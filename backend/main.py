"""FastAPI transport for the same engine used by the Site. No duplicate scoring logic."""
import asyncio
import base64
import hmac
import json
import os
import shutil
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = os.getenv('SCAMSHIELD_DB', str(ROOT / 'backend/scamshield.sqlite3'))
app = FastAPI(title='ScamShield', version='1.0.0', description='Evidence-led scam triage. Drafts only; no filing or automatic contact.')

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

@app.middleware('http')
async def guard(request: Request, call_next):
    token = os.getenv('SCAMSHIELD_API_KEY')
    if token and request.url.path != '/health':
        supplied = request.headers.get('X-API-Key','')
        if not hmac.compare_digest(supplied, token):
            return Response(json.dumps({'error':'API key required.'}), status_code=401, media_type='application/json')
    response = await call_next(request)
    response.headers['Cache-Control'] = 'no-store'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    return response

def connect():
    con=sqlite3.connect(DB_PATH, timeout=10)
    con.execute('PRAGMA journal_mode=WAL')
    con.execute('CREATE TABLE IF NOT EXISTS cases (id TEXT PRIMARY KEY,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,status TEXT NOT NULL,lang TEXT NOT NULL,result TEXT NOT NULL)')
    con.execute('CREATE INDEX IF NOT EXISTS idx_cases_created_at ON cases(created_at)')
    con.execute('CREATE TABLE IF NOT EXISTS intel (indicator_hash TEXT PRIMARY KEY,kind TEXT NOT NULL,report_count INTEGER NOT NULL,first_seen TEXT NOT NULL,last_seen TEXT NOT NULL)')
    return con

def get_case(case_id):
    with connect() as con:
        row=con.execute('SELECT result FROM cases WHERE id=?',(case_id,)).fetchone()
    if not row: raise HTTPException(404,'Case not found')
    return json.loads(row[0])

def save_case(result):
    with connect() as con:
        con.execute('INSERT INTO cases VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at,status=excluded.status,lang=excluded.lang,result=excluded.result',(result['id'],result['created_at'],result['updated_at'],result['status'],result['lang'],json.dumps(result,ensure_ascii=False)))

def intel_map():
    with connect() as con: return dict(con.execute('SELECT indicator_hash,report_count FROM intel').fetchall())

async def bridge_events(payload):
    node=shutil.which('node')
    if not node: raise HTTPException(503,'Node.js 22+ is required for the shared engine.')
    process=await asyncio.create_subprocess_exec(node,str(ROOT/'backend/bridge.mjs'),cwd=str(ROOT),stdin=asyncio.subprocess.PIPE,stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.DEVNULL,limit=12_000_000)
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
    if 'text/event-stream' in request.headers.get('accept',''):
        async def stream():
            async for event in bridge_events(payload):
                if event['event']=='result': save_case(event['data'])
                yield f"event: {event['event']}\ndata: {json.dumps(event['data'],ensure_ascii=False)}\n\n"
        return StreamingResponse(stream(),media_type='text/event-stream')
    result=await bridge(payload);save_case(result);return result

@app.get('/cases')
def list_cases():
    with connect() as con: rows=con.execute('SELECT result FROM cases ORDER BY created_at DESC LIMIT 50').fetchall()
    return {'cases':[{k:r.get(k) for k in ['id','created_at','status','lang','verdict','score','scam_title','branch','amount_lost']} for row in rows for r in [json.loads(row[0])]]}

@app.get('/cases/{case_id}')
def case(case_id: str): return get_case(case_id)

@app.delete('/cases/{case_id}')
def delete_case(case_id: str):
    get_case(case_id)
    with connect() as con: con.execute('DELETE FROM cases WHERE id=?',(case_id,))
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
        row=con.execute('SELECT status FROM cases WHERE id=?',(case_id,)).fetchone()
        if row[0]=='approved':return get_case(case_id)
        for entity in current['entities']:
            con.execute('INSERT INTO intel VALUES (?,?,1,?,?) ON CONFLICT(indicator_hash) DO UPDATE SET report_count=report_count+1,last_seen=excluded.last_seen',(entity['value_hash'],entity['kind'],current['approved_at'],current['approved_at']))
        con.execute('UPDATE cases SET result=?,status=?,updated_at=? WHERE id=?',(json.dumps(current,ensure_ascii=False),'approved',current['approved_at'],case_id))
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
