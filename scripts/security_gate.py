"""All checks must succeed. A missing tool, offline audit, or finding is a failure."""
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/security'

def source_digest():
    files=subprocess.check_output(['git','ls-files','-z','--cached','--others','--exclude-standard'],cwd=ROOT).decode().split('\x00')
    digest=hashlib.sha256()
    for name in sorted(set(filter(None,files))):
        if name.startswith(('output/','.vinext/')):continue
        p=ROOT/name
        if p.is_file():digest.update(name.encode()+b'\x00'+p.read_bytes()+b'\x00')
    return digest.hexdigest()

def run(name,args,output=None):
    result=subprocess.run(args,cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env={**os.environ,'SEMGREP_SEND_METRICS':'off'})
    if output:(OUT/output).write_text(result.stdout)
    print(name+': '+('PASS' if result.returncode==0 else 'FAIL'),flush=True)
    if result.returncode:
        # Gitleaks output already redacted; reports do not include request evidence.
        print((result.stderr or result.stdout)[-3000:])
        raise RuntimeError(name+' failed; deployment blocked')
    return result.stdout

def gate():
    OUT.mkdir(parents=True,exist_ok=True)
    initial=source_digest()
    python=sys.executable
    semgrep=ROOT/'.security-venv/bin/semgrep'
    leaks=ROOT/'.security/bin/gitleaks'
    if not semgrep.is_file() or not leaks.is_file():raise RuntimeError('Run scripts/setup-security.py; missing security scanners block deployment')
    # Scan exactly the source universe, including force-added ignored files. Runtime
    # vault/dev bindings are not source and must never be copied into an artifact.
    with tempfile.TemporaryDirectory(prefix='scamshield-source-scan-') as temp:
        files=subprocess.check_output(['git','ls-files','-z','--cached','--others','--exclude-standard'],cwd=ROOT).decode().split('\x00')
        for name in set(filter(None,files)):
            source=ROOT/name
            if source.is_file():
                destination=Path(temp)/name
                destination.parent.mkdir(parents=True,exist_ok=True)
                shutil.copyfile(source,destination)
        run('Secrets (working tree source)',[str(leaks),'dir','--redact','--config',str(ROOT/'.gitleaks.toml'),'--report-format','json','--report-path',str(OUT/'secrets.json'),temp])
    run('Secrets (Git history)',[str(leaks),'git','--redact','--config','.gitleaks.toml','--report-format','json','--report-path',str(OUT/'secrets-history.json'),'.'])
    run('SAST JavaScript/TypeScript',[str(semgrep),'scan','--config','security/semgrep.yml','--metrics','off','--disable-version-check','--error','--json','--output',str(OUT/'sast-web.json'),'app','api','lib','frontend','backend'])
    run('SAST Python',[python,'-m','bandit','-r','backend','-f','json','-o',str(OUT/'sast-python.json')])
    for folder,label in [('.', 'web'),('backend','engine')]:
        run('SCA npm '+label,['npm','audit','--prefix',folder,'--audit-level=low','--json'],label+'-audit.json')
    run('SCA Python',[python,'-m','pip_audit','-r','backend/requirements.lock','--format','json','--output',str(OUT/'python-audit.json')])
    run('Registered packages and artifact provenance',[python,'scripts/verify-packages.py'],'package-provenance.json')
    run('Type checking',['node','node_modules/typescript/bin/tsc','--noEmit'])
    run('Engine and D1 security tests',['npm','test'],'tests-node.txt')
    run('API security and restore tests',[python,'-m','pytest','tests','-q'],'tests-python.txt')
    run('Production build',['npm','run','build'],'build.txt')
    run('Standalone judge demo build',['npm','run','build:demo'],'build-demo.txt')
    with tempfile.TemporaryDirectory(prefix='scamshield-frontend-scan-') as temp:
        # Scan a copy outside ignored build directories, so Gitleaks examines real output bytes.
        shutil.copytree(ROOT/'dist-demo',Path(temp)/'frontend')
        run('Secrets (built frontend)',[str(leaks),'dir','--redact','--config',str(ROOT/'.gitleaks.toml'),'--report-format','json','--report-path',str(OUT/'secrets-built.json'),temp])
    for folder,label in [('.', 'web'),('backend','engine')]:
        run('SBOM npm '+label,['npm','sbom','--prefix',folder,'--sbom-format','cyclonedx'],label+'-sbom.cdx.json')
    run('SBOM Python',[python,'-m','pip_audit','-r','backend/requirements.lock','--format','cyclonedx-json','--output',str(OUT/'python-sbom.cdx.json')])
    if source_digest()!=initial:raise RuntimeError('Source changed during scanning; rerun checks')
    report={'passed':True,'time':datetime.now(timezone.utc).isoformat(),'source_sha256':initial,'base_commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'checks':18,'signed':False}
    (OUT/'gate.json').write_text(json.dumps(report,indent=2)+'\n')
    print('All checks passed. Deployment still requires protected main, exact-commit CI and the tracked release policy.')

if __name__=='__main__':
    try:gate()
    except Exception as exc:
        OUT.mkdir(parents=True,exist_ok=True);(OUT/'gate.json').write_text(json.dumps({'passed':False,'error':str(exc)}));print(str(exc),file=sys.stderr);sys.exit(1)
