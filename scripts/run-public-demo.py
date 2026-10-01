"""Launch a loopback rehearsal; never enables development authentication."""
import os
import secrets
import subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[1]
local={}
config=root/'.dev.vars'
if config.is_file():
    for line in config.read_text().splitlines():
        name,separator,value=line.partition('=')
        if separator and name.strip() in ('LLM_PROVIDER','GEMINI_API_KEY','GEMINI_MODEL','GEMINI_API_KEY_FILE','GOOGLE_SAFE_BROWSING_API_KEY'):
            local[name.strip()]=value.strip().strip(chr(34)).strip(chr(39))
env={**local, **os.environ, 'SCAMSHIELD_PUBLIC_DEMO':'1','SCAMSHIELD_DEV_AUTH':'0','SCAMSHIELD_DB':str(root/'output/demo/rehearsal.sqlite3')}
(root/'output/demo').mkdir(parents=True, exist_ok=True)
keyfile=root/'output/demo/audit.key'
if not keyfile.exists():
    descriptor=os.open(keyfile,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(descriptor,'w') as handle:handle.write(secrets.token_hex(32))
env['SCAMSHIELD_AUDIT_KEY_FILE']=str(keyfile)
raise SystemExit(subprocess.call([str(root/'.venv/bin/uvicorn'),'backend.main:app','--host','127.0.0.1','--port','8000'],cwd=root,env=env))
