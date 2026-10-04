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
    monkeypatch.setattr(release,'release_policy',lambda:{'mode':'reviewed-pr'})

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

def owner_setup(monkeypatch):
    data=policies()
    setup(monkeypatch,data)
    policy={'mode':'sole-owner','repository':'Abhiraj-H/ScamShield','owner':'Abhiraj-H'}
    monkeypatch.setattr(release,'release_policy',lambda:policy)
    monkeypatch.setenv('SCAMSHIELD_GITHUB_REPO',policy['repository'])
    actor={'login':'Abhiraj-H','type':'User'}
    monkeypatch.setattr(release,'authenticated_actor',lambda:actor)
    data['']={'full_name':policy['repository'],'owner':dict(actor),'permissions':{'admin':True}}
    protection=data['branches/main/protection']
    protection.pop('required_pull_request_reviews')
    protection['required_status_checks'].update(strict=True,checks=[{'context':'security-gate','app_id':15368}])
    protection.update(allow_force_pushes={'enabled':False},allow_deletions={'enabled':False})
    data['commits/'+'a'*40+'/check-runs?per_page=100']['check_runs'][0]['app']={'id':15368}
    return data,policy,actor

def test_owner_release_accepts_direct_main_without_pr(monkeypatch):
    data,_,_=owner_setup(monkeypatch)
    del data['commits/'+'a'*40+'/pulls?per_page=100']
    del data['pulls/1/reviews?per_page=100']
    release.verify()

@pytest.mark.parametrize('failure',['actor','repo','admin','unprotected','force','delete','strict','untrusted-check','newer-failure','wrong-main','unknown-policy'])
def test_owner_release_rejects_missing_guarantees(monkeypatch,failure):
    data,policy,actor=owner_setup(monkeypatch)
    protection=data['branches/main/protection']
    checks=data['commits/'+'a'*40+'/check-runs?per_page=100']['check_runs']
    if failure=='actor':actor['login']='someone-else'
    if failure=='repo':policy['repository']='someone-else/project'
    if failure=='admin':data['']['permissions']['admin']=False
    if failure=='unprotected':data['branches/main']['protected']=False
    if failure=='force':protection['allow_force_pushes']['enabled']=True
    if failure=='delete':protection['allow_deletions']['enabled']=True
    if failure=='strict':protection['required_status_checks']['strict']=False
    if failure=='untrusted-check':checks[0]['app']['id']=123
    if failure=='newer-failure':checks.append({**checks[0],'id':2,'conclusion':'failure'})
    if failure=='wrong-main':data['branches/main']['commit']['sha']='c'*40
    if failure=='unknown-policy':policy['mode']='skip'
    with pytest.raises(RuntimeError):release.verify()
