import importlib
import json
import os
import time
from types import SimpleNamespace
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

@pytest.fixture
def secured(tmp_path, monkeypatch):
    monkeypatch.setenv('SCAMSHIELD_DB', str(tmp_path/'secure.sqlite3'))
    monkeypatch.delenv('SCAMSHIELD_DEV_AUTH', raising=False)
    monkeypatch.setenv('SCAMSHIELD_AUDIT_KEY', os.urandom(32).hex())
    monkeypatch.setenv('OIDC_ISSUER', 'https://idp.example')
    monkeypatch.setenv('OIDC_JWKS_URL', 'https://idp.example/jwks')
    monkeypatch.setenv('OIDC_AUDIENCE', 'scamshield')
    monkeypatch.delenv('OPENAI_API_KEY', raising=False)
    monkeypatch.delenv('OPENAI_API_KEY_FILE', raising=False)
    for name in ['GEMINI_API_KEY','GEMINI_API_KEY_FILE','LLM_PROVIDER']:
        monkeypatch.delenv(name,raising=False)
    from backend import main, security
    importlib.reload(main)
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    class Client:
        def get_signing_key_from_jwt(self, token):
            return SimpleNamespace(key=key.public_key())
    monkeypatch.setattr(security, 'key_client', lambda url: Client())
    def headers(subject='alice', **overrides):
        now=int(time.time())
        claims={'iss':'https://idp.example','aud':'scamshield','sub':subject,'iat':now,'exp':now+300,'amr':['mfa'],'roles':['user']}
        claims.update(overrides)
        return {'Authorization': 'Bearer '+jwt.encode(claims, key, algorithm='RS256', headers={'kid':'test'})}
    with TestClient(main.app) as client:
        yield client, headers, main, security

def test_tokens_mfa_roles_and_csrf(secured):
    c, token, _, _=secured
    assert c.get('/cases').status_code==401
    for override in ({'exp':int(time.time())-1}, {'aud':'other'}, {'iss':'https://evil.example'}, {'exp':int(time.time())+7200}, {'sub':''}):
        assert c.get('/cases',headers=token(**override)).status_code==401
    assert c.get('/cases',headers=token(amr=['pwd'])).status_code==403
    assert c.get('/cases',headers=token(roles=[])).status_code==403
    assert c.get('/cases',headers=token(roles=['reader'])).status_code==200
    assert c.post('/analyze',headers=token(roles=['reader']),json={'text':'hi'}).status_code==403
    assert c.post('/analyze',headers={**token(),'Origin':'https://evil.example'},json={'text':'hi'}).status_code==403
    assert c.post('/analyze',headers={**token(),'Sec-Fetch-Site':'cross-site'},json={'text':'hi'}).status_code==403
    assert c.get('/docs',headers=token()).status_code==404
    assert c.get('/health').status_code==200

def test_ownership_every_case_endpoint(secured):
    c, token, _, _=secured
    a=token();b=token('bob')
    case=c.post('/cases',headers=a,json={'text':'SBI KYC expires tonight. Send OTP now. https://sbi-kyc.example'}).json()
    cid=case['id']
    assert c.get('/cases',headers=b).json()['cases']==[]
    for method, suffix, body in [('GET','',None),('DELETE','',None),('GET','/stream',None),('GET','/pack.pdf',None),('GET','/reminders.ics',None),('POST','/approve',{}),('POST','/answers',{}),('POST','/evidence',{'text':'more'})]:
        kwargs={'headers':b}
        if body is not None: kwargs['json']=body
        assert c.request(method,'/cases/'+cid+suffix,**kwargs).status_code==404
    assert c.get('/cases/'+cid,headers=a).status_code==200

def test_signature_and_provider_failure(secured,monkeypatch):
    c, token, _, security=secured
    raw=token()['Authorization'][7:]
    parts=raw.split('.')
    payload=json.loads(jwt.utils.base64url_decode(parts[1]))
    payload['sub']='admin'
    parts[1]=jwt.utils.base64url_encode(json.dumps(payload).encode()).decode()
    assert c.get('/cases',headers={'Authorization':'Bearer '+'.'.join(parts)}).status_code==401
    class Broken:
        def get_signing_key_from_jwt(self, value):raise jwt.PyJWKClientConnectionError('offline')
    monkeypatch.setattr(security,'key_client',lambda url:Broken())
    assert c.get('/cases',headers=token()).status_code==401

def test_rate_limit_payload_and_audit(secured,monkeypatch):
    c, token, main, security=secured
    a=token()
    assert c.post('/analyze',headers={**a,'Content-Length':'6000001'},content='{}').status_code==413
    assert c.post('/analyze',headers=a,content=b'x'*6000001).status_code==413
    monkeypatch.setenv('SCAMSHIELD_WRITE_LIMIT','2')
    # The rejected oversized requests also consumed the write budget.
    r=c.post('/analyze',headers=a,json={'text':'hello'})
    assert r.status_code==429 and int(r.headers['Retry-After'])>0
    assert c.get('/ops/audit',headers=a).status_code==403
    audit=c.get('/ops/audit',headers=token(roles=['auditor'])).json()
    assert audit['integrity'] and audit['events']
    metrics=c.get('/ops/metrics',headers=token(roles=['auditor']))
    assert metrics.status_code==200 and 'scamshield_requests_total' in metrics.text
    assert c.get('/ops/readiness',headers=token(roles=['auditor'])).json()['database']
    with main.connect() as con:
        rows=con.execute('SELECT seq,body,previous,digest FROM audit_events ORDER BY seq').fetchall()
        with pytest.raises(Exception):con.execute("UPDATE audit_events SET body='changed' WHERE seq=1")
    assert security.verify_audit(rows,security.audit_key())
    changed=list(rows);row=list(changed[0]);row[1]='changed';changed[0]=tuple(row)
    assert not security.verify_audit(changed,security.audit_key())
    assert not security.verify_audit(rows[1:],security.audit_key())

def test_missing_audit_key_blocks_writes(secured,monkeypatch):
    c, token, _, _=secured
    monkeypatch.delenv('SCAMSHIELD_AUDIT_KEY')
    assert c.post('/cases',headers=token(),json={'text':'hello'}).status_code==503
