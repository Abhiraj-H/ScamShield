import importlib.util
import subprocess
from pathlib import Path
import pytest
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('release_gate',ROOT/'scripts/verify-release.py');release=importlib.util.module_from_spec(spec);spec.loader.exec_module(release)

def policies():
    return {'branches/main':{'protected':True,'commit':{'sha':'a'*40}},'branches/main/protection':{'required_pull_request_reviews':{'required_approving_review_count':1,'dismiss_stale_reviews':True},'enforce_admins':{'enabled':True},'required_status_checks':{'contexts':['security-gate']}},'commits/'+'a'*40+'/pulls?per_page=100':[{'number':1,'merged_at':'now','base':{'ref':'main'},'merge_commit_sha':'a'*40,'head':{'sha':'b'*40},'user':{'login':'author'},'html_url':'https://github.com/example/project/pull/1'}],'pulls/1/reviews?per_page=100':[{'state':'APPROVED','user':{'login':'reviewer','type':'User'},'commit_id':'b'*40}],'commits/'+'a'*40+'/check-runs?per_page=100':{'check_runs':[{'id':1,'name':'security-gate','status':'completed','conclusion':'success'}]}}

def setup(monkeypatch,data):
    monkeypatch.setattr(release.subprocess,'check_output',lambda args,**kwargs:'' if 'status' in args else 'a'*40+'\n')
    monkeypatch.setattr(release,'github',lambda path:data[path])

def test_release_accepts_only_reviewed_exact_commit(monkeypatch):
    setup(monkeypatch,policies());release.verify()

@pytest.mark.parametrize('failure',['unprotected','review','stale','admin','required','failed','self','bot','other-commit','change-request'])
def test_release_rejects_missing_guarantees(monkeypatch,failure):
    p=policies();protection=p['branches/main/protection'];reviews=p['pulls/1/reviews?per_page=100']
    if failure=='unprotected':p['branches/main']['protected']=False
    if failure=='review':protection['required_pull_request_reviews']['required_approving_review_count']=0
    if failure=='stale':protection['required_pull_request_reviews']['dismiss_stale_reviews']=False
    if failure=='admin':protection['enforce_admins']['enabled']=False
    if failure=='required':protection['required_status_checks']['contexts']=[]
    if failure=='failed':p['commits/'+'a'*40+'/check-runs?per_page=100']['check_runs'][0]['conclusion']='failure'
    if failure=='self':reviews[0]['user']['login']='author'
    if failure=='bot':reviews[0]['user']['type']='Bot'
    if failure=='other-commit':reviews[0]['commit_id']='c'*40
    if failure=='change-request':reviews.append({'state':'CHANGES_REQUESTED','user':{'login':'second','type':'User'},'commit_id':'b'*40})
    setup(monkeypatch,p)
    with pytest.raises(RuntimeError):release.verify()

def test_dirty_release_is_blocked(monkeypatch):
    monkeypatch.setattr(release.subprocess,'check_output',lambda args,**kwargs:' M backend/main.py\n')
    with pytest.raises(RuntimeError,match='clean working tree'):release.verify()
