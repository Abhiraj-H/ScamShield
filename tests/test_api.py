import importlib
import os
from fastapi.testclient import TestClient
import pytest

@pytest.fixture
def client(tmp_path,monkeypatch):
    monkeypatch.setenv('SCAMSHIELD_DB',str(tmp_path/'test.sqlite3'))
    monkeypatch.setenv('SCAMSHIELD_DEV_AUTH','1')
    for name in ['OPENAI_API_KEY','OPENAI_API_KEY_FILE','GOOGLE_SAFE_BROWSING_API_KEY','GOOGLE_SAFE_BROWSING_API_KEY_FILE']:
        monkeypatch.delenv(name,raising=False)
    monkeypatch.delenv('SCAMSHIELD_API_KEY',raising=False)
    from backend import main
    importlib.reload(main)
    with TestClient(main.app) as c:yield c

SCAM='SBI KYC expires tonight. Send OTP now. https://sbi-kyc.example Call 9876543210.'
def test_complete_recovery_flow(client):
    result=client.post('/cases',json={'text':SCAM}).json();cid=result['id']
    assert result['verdict']=='Scam' and result['branch']=='A'
    assert client.get(f'/cases/{cid}/pack.pdf').status_code==403
    changed=client.post(f'/cases/{cid}/answers',json={'paid':True,'amount':5000,'bank':'SBI','utr':'UTR-123'}).json()
    assert changed['branch']=='C' and changed['actions'][0]['href']=='tel:1930'
    approved=client.post(f'/cases/{cid}/approve',json={'drafts':{'family':'Reviewed test warning'}}).json()
    assert approved['drafts']['family']=='Reviewed test warning'
    pack=client.get(f'/cases/{cid}/pack.pdf')
    assert pack.status_code==200 and pack.content.startswith(b'%PDF')
    assert client.get(f'/cases/{cid}/reminders.ics').text.count('BEGIN:VEVENT')==3
    assert client.get('/cases').json()['cases'][0]['id']==cid
    again=client.post(f'/cases/{cid}/approve',json={}).json()
    assert again['approved_at']==approved['approved_at']
    assert client.get(f'/cases/{cid}/stream').headers['X-ScamShield-Stream']=='replay'
    assert client.post(f'/cases/{cid}/answers',json={'clicked':True}).json()['branch']=='B'
    assert client.get(f'/cases/{cid}/pack.pdf').status_code==403

def test_stateless_validation_and_key_guard(client,monkeypatch):
    assert client.post('/analyze',json={'text':'Hello'}).json()['verdict']=='Unverified'
    assert client.get('/cases').json()['cases']==[]
    assert client.post('/analyze',json={'text':'x','answers':{'amount':-1}}).status_code==422
    assert client.post('/analyze',json={'text':'x','lang':'fr'}).status_code==422
    assert client.get('/cases/missing').status_code==404
    monkeypatch.delenv('SCAMSHIELD_DEV_AUTH')
    assert client.get('/cases').status_code==503
    assert client.get('/health').status_code==200

def test_live_sse_and_no_raw_identifier_storage(client):
    response=client.post('/cases',json={'text':SCAM},headers={'Accept':'text/event-stream'})
    assert response.status_code==200 and 'event: trace' in response.text and 'event: result' in response.text
    assert '9876543210' not in response.text

def test_screenshot_requires_explicit_configuration(client):
    assert client.post('/analyze',json={'image':'data:image/png;base64,AA=='}).status_code==400
