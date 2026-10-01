"""FastAPI transport for the same engine used by the Site. No duplicate scoring logic."""
import asyncio
import base64
import json
import os
import shutil
import hashlib
import time
import uuid
import logging
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field
from backend.security import principal, owner_id, authenticate, authorize, rate_limit, append_audit, append_audit_in_transaction, audit_key, verify_audit, secret

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = os.getenv('SCAMSHIELD_DB', str(ROOT / 'backend/scamshield.sqlite3'))
app = FastAPI(title='ScamShield', version='1.0.0', description='Evidence-led scam triage. Drafts only; no filing or automatic contact.', docs_url=None, redoc_url=None, openapi_url=None)

class Answers(BaseModel):
    model_config = ConfigDict(extra='forbid')
    clicked: bool = False
    shared: bool = False
    paid: bool = False
    amount: float = Field(default=0, ge=0, le=1_000_000_000)
    bank: str = Field(default='', max_length=200)
    method: str = Field(default='', max_length=200)
    utr: str = Field(default='', max_length=200)
    incidentTime: str = Field(default='', max_length=200)

class Intake(BaseModel):
    model_config = ConfigDict(extra='forbid')
    text: str = Field(default='', max_length=12000)
    image: str | None = Field(default=None, max_length=5_600_000)
    imageConsent: bool = False
    imageHash: str | None = Field(default=None, pattern=r'^[a-f0-9]{64}$')
    lang: Literal['en','hi','mr'] = 'en'
    answers: Answers = Field(default_factory=Answers)

class Approval(BaseModel):
    drafts: dict[str, str] = Field(default_factory=dict)

logger = logging.getLogger('scamshield.security')

@app.middleware('http')
async def guard(request: Request, call_next):
    request_id = str(uuid.uuid4())
    started = time.monotonic()
    context = None
    user = None
    path = request.url.path
    # Route templates keep customer identifiers out of operational logs.
    route = '/cases/:id/' + path.split('/')[3] if path.startswith('/cases/') and len(path.split('/')) > 3 else '/cases/:id' if path.startswith('/cases/') else path
    try:
        if path != '/health':
            # Do not trust X-Forwarded-For. Let a trusted edge enforce its own IP quota.
            peer = request.client.host if request.client else 'unknown'
            rate_limit(connect, 'edge:' + hashlib.sha256(peer.encode()).hexdigest(), 120)
            user = authenticate(request)
            authorize(user, request.method, path)
            audit_key()  # fail closed before any application action
            context = principal.set(user)
            rate_limit(connect, 'user:' + user['id'], int(os.getenv('SCAMSHIELD_RATE_LIMIT', '60')))
            if request.method not in ('GET', 'HEAD'):
                rate_limit(connect, 'write:' + user['id'], int(os.getenv('SCAMSHIELD_WRITE_LIMIT', '12')))
            origin = request.headers.get('origin')
            allowed = set(filter(None, os.getenv('SCAMSHIELD_ALLOWED_ORIGINS', '').split(',')))
            if origin and origin not in allowed:
                raise HTTPException(403, 'Origin is not allowed')
            if request.headers.get('sec-fetch-site') == 'cross-site':
                raise HTTPException(403, 'Cross-site request rejected')
            if int(request.headers.get('content-length', '0')) > 6_000_000:
                raise HTTPException(413, 'Request exceeds 6 MB')
            if request.method not in ('GET', 'HEAD'):
                body = bytearray()
                async for chunk in request.stream():
                    body.extend(chunk)
                    if len(body) > 6_000_000:
                        raise HTTPException(413, 'Request exceeds 6 MB')
                request._body = bytes(body)
        response = await call_next(request)
    except HTTPException as exc:
        response = Response(json.dumps({'error': exc.detail}), status_code=exc.status_code, media_type='application/json', headers=exc.headers)
    except Exception:
        response = Response(json.dumps({'error': 'Service unavailable', 'request_id': request_id}), status_code=503, media_type='application/json')
    try:
        if path != '/health':
            event = {'request_id': request_id, 'time': datetime.now(timezone.utc).isoformat(), 'actor': user['id'] if user else 'unauthenticated', 'method': request.method, 'route': route, 'status': response.status_code, 'duration_ms': round((time.monotonic()-started)*1000)}
            digest = append_audit(connect, event)
            logger.info(json.dumps({**event, 'audit_digest': digest, 'duration_ms': round((time.monotonic()-started)*1000)}))
    except Exception:
        # Never deliver success if the required audit write failed.
        response = Response(json.dumps({'error': 'Audit service unavailable', 'request_id': request_id}), status_code=503, media_type='application/json')
    finally:
        if context is not None:
            principal.reset(context)
    response.headers.update({'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', 'X-Request-ID': request_id})
    return response

def connect():
    con=sqlite3.connect(DB_PATH, timeout=10)
    con.execute('PRAGMA journal_mode=WAL')
    con.execute('CREATE TABLE IF NOT EXISTS cases (id TEXT PRIMARY KEY,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,status TEXT NOT NULL,lang TEXT NOT NULL,result TEXT NOT NULL)')
    con.execute('CREATE INDEX IF NOT EXISTS idx_cases_created_at ON cases(created_at)')
    columns = {r[1] for r in con.execute('PRAGMA table_info(cases)')}
    if 'owner_id' not in columns:
        con.execute("ALTER TABLE cases ADD COLUMN owner_id TEXT NOT NULL DEFAULT ''")
    con.execute('CREATE INDEX IF NOT EXISTS idx_cases_owner ON cases(owner_id,created_at)')
    con.execute('CREATE TABLE IF NOT EXISTS rate_limits(bucket TEXT NOT NULL,window INTEGER NOT NULL,count INTEGER NOT NULL,PRIMARY KEY(bucket,window))')
    con.execute('CREATE TABLE IF NOT EXISTS audit_events(seq INTEGER PRIMARY KEY AUTOINCREMENT,body TEXT NOT NULL,previous TEXT NOT NULL,digest TEXT NOT NULL)')
    con.execute("CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT,'Audit records are append-only'); END")
    con.execute("CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT,'Audit records are append-only'); END")
    con.execute('CREATE TABLE IF NOT EXISTS intel (indicator_hash TEXT PRIMARY KEY,kind TEXT NOT NULL,report_count INTEGER NOT NULL,first_seen TEXT NOT NULL,last_seen TEXT NOT NULL)')
    return con

def get_case(case_id):
    with connect() as con:
        row=con.execute('SELECT result FROM cases WHERE id=? AND owner_id=?',(case_id,owner_id())).fetchone()
    if not row: raise HTTPException(404,'Case not found')
    return json.loads(row[0])

def record_change(con, case_id, owner, before, after):
    event={'time':datetime.now(timezone.utc).isoformat(),'actor':owner,'operation':'case-change','resource_hash':hashlib.sha256(case_id.encode()).hexdigest(),'before_hash':hashlib.sha256(before.encode()).hexdigest() if before else None,'after_hash':hashlib.sha256(after.encode()).hexdigest() if after else None}
    append_audit_in_transaction(con,event)

def save_case(result, owner=None):
    owner=owner or owner_id()
    with connect() as con:
        con.execute('BEGIN IMMEDIATE')
        before=con.execute('SELECT result FROM cases WHERE id=? AND owner_id=?',(result['id'],owner)).fetchone()
        con.execute('INSERT INTO cases(id,created_at,updated_at,status,lang,result,owner_id) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at,status=excluded.status,lang=excluded.lang,result=excluded.result WHERE cases.owner_id=excluded.owner_id',(result['id'],result['created_at'],result['updated_at'],result['status'],result['lang'],json.dumps(result,ensure_ascii=False),owner))
        record_change(con,result['id'],owner,before[0] if before else None,json.dumps(result,ensure_ascii=False))

def intel_map():
    with connect() as con: return dict(con.execute('SELECT indicator_hash,report_count FROM intel').fetchall())

async def bridge_events(payload):
    node=shutil.which('node')
    if not node: raise HTTPException(503,'Node.js 22+ is required for the shared engine.')
    process=await asyncio.create_subprocess_exec(node,str(ROOT/'backend/bridge.mjs'),cwd=str(ROOT),stdin=asyncio.subprocess.PIPE,stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.DEVNULL,limit=12_000_000,env={**os.environ, **{k:secret(k) for k in ['OPENAI_API_KEY','GOOGLE_SAFE_BROWSING_API_KEY']}})
    process.stdin.write(json.dumps(payload).encode());await process.stdin.drain();process.stdin.close()
    try:
        async with asyncio.timeout(90):
            while line:=await process.stdout.readline():
                yield json.loads(line)
            await process.wait()
    finally:
        if process.returncode is None:
            process.kill();await process.wait()

async def bridge(payload):
    result=None
    events=bridge_events(payload)
    try:
        async for event in events:
            if event['event']=='error': raise HTTPException(400,event['data']['error'])
            if event['event']=='result': result=event['data']
    finally:
        await events.aclose()
    if result is None: raise HTTPException(503,'Analysis did not complete.')
    return result

@app.get('/health')
def health():
    return {'status':'ok','version':'1.0.0','mode':'AI-assisted' if os.getenv('OPENAI_API_KEY') else 'rules','vision':bool(os.getenv('OPENAI_API_KEY')),'safe_browsing':bool(os.getenv('GOOGLE_SAFE_BROWSING_API_KEY'))}

@app.post('/analyze')
async def analyze_single(input: Intake):
    return await bridge({'input':input.model_dump(exclude_none=True)})

@app.post('/cases')
async def create_case(input: Intake, request: Request):
    payload={'input':input.model_dump(exclude_none=True),'intel':intel_map()}
    owner = owner_id()
    if 'text/event-stream' in request.headers.get('accept',''):
        async def stream():
            async for event in bridge_events(payload):
                if event['event']=='result': save_case(event['data'], owner)
                yield f"event: {event['event']}\ndata: {json.dumps(event['data'],ensure_ascii=False)}\n\n"
        return StreamingResponse(stream(),media_type='text/event-stream')
    result=await bridge(payload);save_case(result);return result

@app.get('/cases')
def list_cases():
    with connect() as con: rows=con.execute('SELECT result FROM cases WHERE owner_id=? ORDER BY created_at DESC LIMIT 50',(owner_id(),)).fetchall()
    return {'cases':[{k:r.get(k) for k in ['id','created_at','status','lang','verdict','score','scam_title','branch','amount_lost']} for row in rows for r in [json.loads(row[0])]]}

@app.get('/cases/{case_id}')
def case(case_id: str): return get_case(case_id)

@app.delete('/cases/{case_id}')
def delete_case(case_id: str):
    get_case(case_id)
    with connect() as con:
        con.execute('BEGIN IMMEDIATE')
        row=con.execute('SELECT result FROM cases WHERE id=? AND owner_id=?',(case_id,owner_id())).fetchone()
        if not row:raise HTTPException(404,'Case not found')
        con.execute('DELETE FROM cases WHERE id=? AND owner_id=?',(case_id,owner_id()))
        record_change(con,case_id,owner_id(),row[0],None)
    return {'deleted':True,'note':'Hashed local reports are retained separately.'}

@app.post('/cases/{case_id}/answers')
async def answers(case_id: str, input: Answers):
    result=await bridge({'operation':'answers','result':get_case(case_id),'answers':input.model_dump()});save_case(result);return result

@app.post('/cases/{case_id}/evidence')
async def add_evidence(case_id: str,input: Intake):
    current=get_case(case_id);payload=input.model_dump(exclude_none=True)
    payload.update(id=case_id,text=current['text']+'\n'+input.text,lang=current['lang'],answers=current['answers'])
    result=await bridge({'input':payload,'intel':intel_map()});result['created_at']=current['created_at'];save_case(result);return result

@app.get('/cases/{case_id}/stream')
def stream_case(case_id: str):
    result=get_case(case_id)
    async def replay():
        for row in result['trace']: yield f"event: trace\ndata: {json.dumps(row,ensure_ascii=False)}\n\n"
        yield f"event: result\ndata: {json.dumps(result,ensure_ascii=False)}\n\n"
    return StreamingResponse(replay(),media_type='text/event-stream',headers={'X-ScamShield-Stream':'replay'})

@app.post('/cases/{case_id}/approve')
async def approve(case_id: str, input: Approval):
    current=get_case(case_id)
    if current.get('approved_at'): return current
    merged={key:input.drafts.get(key,value) for key,value in current['drafts'].items()}
    if any(len(v)>16000 for v in merged.values()):raise HTTPException(400,'Draft too long')
    masked=await bridge({'operation':'mask','drafts':merged})
    current['drafts']=masked['drafts'];current['approved_at']=datetime.now(timezone.utc).isoformat();current['updated_at']=current['approved_at'];current['status']='approved'
    with connect() as con:
        con.execute('BEGIN IMMEDIATE')
        row=con.execute('SELECT status FROM cases WHERE id=? AND owner_id=?',(case_id,owner_id())).fetchone()
        if not row: raise HTTPException(404,'Case not found')
        if row[0]=='approved':return get_case(case_id)
        before=con.execute('SELECT result FROM cases WHERE id=? AND owner_id=?',(case_id,owner_id())).fetchone()[0]
        for entity in current['entities']:
            con.execute('INSERT INTO intel VALUES (?,?,1,?,?) ON CONFLICT(indicator_hash) DO UPDATE SET report_count=report_count+1,last_seen=excluded.last_seen',(entity['value_hash'],entity['kind'],current['approved_at'],current['approved_at']))
        con.execute('UPDATE cases SET result=?,status=?,updated_at=? WHERE id=? AND owner_id=?',(json.dumps(current,ensure_ascii=False),'approved',current['approved_at'],case_id,owner_id()))
        record_change(con,case_id,owner_id(),before,json.dumps(current,ensure_ascii=False))
    return current

@app.api_route('/cases/{case_id}/pack.pdf',methods=['GET','POST'])
async def pack(case_id: str,request: Request):
    result=get_case(case_id)
    if not result.get('approved_at'):raise HTTPException(403,'Review and approve before downloading.')
    image=(await request.json()).get('image') if request.method=='POST' else None
    pdf=await bridge({'operation':'pdf','result':result,'image':image})
    return Response(base64.b64decode(pdf['base64']),media_type='application/pdf',headers={'Content-Disposition':f'attachment; filename="ScamShield-{case_id[:8]}.pdf"'})

@app.get('/cases/{case_id}/reminders.ics')
async def reminders(case_id: str):
    result=get_case(case_id)
    if not result.get('approved_at'):raise HTTPException(403,'Review and approve before downloading.')
    data=await bridge({'operation':'calendar','result':result})
    return Response(data['calendar'],media_type='text/calendar',headers={'Content-Disposition':'attachment; filename="ScamShield-follow-up.ics"'})

@app.get('/ops/audit')
def audit_export():
    with connect() as con:
        rows = con.execute('SELECT seq,body,previous,digest FROM audit_events ORDER BY seq').fetchall()
    return {'integrity': verify_audit(rows, audit_key()), 'checkpoint': rows[-1][3] if rows else '0'*64, 'events': [{'seq':r[0],'event':json.loads(r[1]),'previous':r[2],'digest':r[3]} for r in rows]}

@app.get('/ops/readiness')
def readiness():
    with connect() as con:
        ok = con.execute('PRAGMA quick_check').fetchone()[0] == 'ok'
    return {'database': ok, 'authentication': principal.get()['mode'], 'audit': 'hmac-sha256', 'version': '1.1.0'}

@app.get('/ops/metrics')
def metrics():
    with connect() as con:
        rows=con.execute("SELECT json_extract(body,'$.status'),COUNT(*) FROM audit_events WHERE json_extract(body,'$.status') IS NOT NULL GROUP BY json_extract(body,'$.status')").fetchall()
    lines=['# HELP scamshield_requests_total Audited API requests by response status','# TYPE scamshield_requests_total counter']
    lines += ['scamshield_requests_total{status="'+str(status)+'"} '+str(count) for status,count in rows]
    return Response('\n'.join(lines)+'\n',media_type='text/plain')
