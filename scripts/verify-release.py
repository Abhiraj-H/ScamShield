"""Verify exact-commit PR approval and successful GitHub CI before packaging a release."""
import json
import os
import re
import subprocess
import sys
import urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def github(path):
    token=os.getenv('GH_TOKEN','')
    if not token:raise RuntimeError('GH_TOKEN is required to verify repository policy')
    repo=os.getenv('SCAMSHIELD_GITHUB_REPO','')
    if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+',repo):raise RuntimeError('SCAMSHIELD_GITHUB_REPO is required')
    request=urllib.request.Request('https://api.github.com/repos/'+repo+'/'+path,headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json','User-Agent':'scamshield-release-gate'})
    with urllib.request.urlopen(request,timeout=30) as response:return json.load(response)

def verify():
    if subprocess.check_output(['git','status','--porcelain'],cwd=ROOT,text=True).strip():raise RuntimeError('Release requires a clean working tree')
    sha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
    branch=github('branches/main')
    if not branch['protected'] or branch['commit']['sha']!=sha:raise RuntimeError('Release must use the current protected main commit')
    protection=github('branches/main/protection')
    reviews=protection.get('required_pull_request_reviews',{})
    if reviews.get('required_approving_review_count',0)<1 or not reviews.get('dismiss_stale_reviews') or not protection.get('enforce_admins',{}).get('enabled'):
        raise RuntimeError('Require human review, stale-review dismissal and administrator enforcement')
    contexts=protection.get('required_status_checks',{}).get('contexts',[])
    if 'security-gate' not in contexts:raise RuntimeError('security-gate must be a required branch check')
    prs=github('commits/'+sha+'/pulls?per_page=100')
    merged=[p for p in prs if p.get('merged_at') and p['base']['ref']=='main' and p.get('merge_commit_sha')==sha]
    if not merged:raise RuntimeError('Commit must come from a merged pull request')
    pr=merged[0]
    responses=github('pulls/'+str(pr['number'])+'/reviews?per_page=100')
    latest={}
    for response in responses:
        if response.get('state') in ('APPROVED','CHANGES_REQUESTED','DISMISSED'):
            latest[response['user']['login']]=response
    approvals=[r for user,r in latest.items() if user!=pr['user']['login'] and r['state']=='APPROVED' and r.get('commit_id')==pr['head']['sha'] and r['user']['type']=='User']
    if not approvals or any(r['state']=='CHANGES_REQUESTED' for r in latest.values()):raise RuntimeError('Independent approval of the final PR revision is required')
    checks=github('commits/'+sha+'/check-runs?per_page=100')['check_runs']
    latest_checks={}
    for check in checks:
        name=check['name']
        if name not in latest_checks or check['id']>latest_checks[name]['id']:latest_checks[name]=check
    for name in set(contexts)|{'security-gate'}:
        check=latest_checks.get(name)
        if not check or check['status']!='completed' or check['conclusion']!='success':raise RuntimeError('Required CI check is missing or failed: '+name)
    print(json.dumps({'reviewed_commit':sha,'pull_request':pr['html_url'],'ci':'passed'}))

if __name__=='__main__':
    try:verify()
    except Exception as exc:print('Release blocked: '+str(exc),file=sys.stderr);sys.exit(1)
