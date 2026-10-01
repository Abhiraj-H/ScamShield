"""The judge endpoint never grants a saved-case or operations identity."""
import importlib
import os
import pytest
from fastapi.testclient import TestClient

@pytest.fixture
def demo(tmp_path, monkeypatch):
    monkeypatch.setenv('SCAMSHIELD_DB', str(tmp_path/'demo.sqlite3'))
    monkeypatch.setenv('SCAMSHIELD_PUBLIC_DEMO', '1')
    monkeypatch.setenv('SCAMSHIELD_AUDIT_KEY', os.urandom(32).hex())
    for name in ['SCAMSHIELD_DEV_AUTH','OIDC_ISSUER','OIDC_AUDIENCE','OIDC_JWKS_URL','OPENAI_API_KEY','OPENAI_API_KEY_FILE']:
        monkeypatch.delenv(name, raising=False)
    for name in ['GEMINI_API_KEY','GEMINI_API_KEY_FILE','LLM_PROVIDER']:
        monkeypatch.delenv(name,raising=False)
    from backend import main
    importlib.reload(main)
    with TestClient(main.app) as c: yield c, main

def test_public_json_and_stream_are_stateless_but_audited(demo):
    c, main=demo
    r=c.post('/analyze', json={'text':'Hello friend'})
    assert r.status_code==200 and r.json()['verdict']=='Unverified'
    r=c.post('/analyze', json={'text':'SBI send OTP now'}, headers={'Accept':'text/event-stream'})
    assert 'event: trace' in r.text and 'event: result' in r.text
    with main.connect() as con:
        assert con.execute('SELECT COUNT(*) FROM cases').fetchone()[0]==0
        assert con.execute('SELECT COUNT(*) FROM intel').fetchone()[0]==0
        assert con.execute('SELECT COUNT(*) FROM audit_events').fetchone()[0]==2
    for path in ['/cases','/cases/anything','/ops/audit','/ops/metrics']:
        assert c.get(path).status_code==503
    assert c.post('/cases',json={'text':'hi'}).status_code==503

def test_public_limits_origins_and_audit_fail_closed(demo, monkeypatch):
    c, _=demo
    assert c.post('/analyze',json={'text':'x'*4001}).status_code==422
    assert c.post('/analyze',json={'image':'data:image/png;base64,AA=='}).status_code==422
    assert c.post('/analyze',json={'text':'hi'},headers={'Origin':'https://evil.example'}).status_code==403
    assert c.post('/analyze',content='hi',headers={'Content-Type':'text/plain'}).status_code==415
    assert c.post('/analyze',json={'text':'hi'},headers={'Origin':'http://testserver'}).status_code==200
    monkeypatch.delenv('SCAMSHIELD_AUDIT_KEY')
    assert c.post('/analyze',json={'text':'hi'}).status_code==503

def test_public_quota_and_opt_in_only(demo, monkeypatch):
    c, _=demo
    for _ in range(6):assert c.post('/analyze',json={'text':'hello'}).status_code==200
    assert c.post('/analyze',json={'text':'hello'}).status_code==429
    monkeypatch.delenv('SCAMSHIELD_PUBLIC_DEMO')
    assert c.post('/analyze',json={'text':'hello'}).status_code==503
