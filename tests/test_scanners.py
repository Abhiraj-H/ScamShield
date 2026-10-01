import secrets
import string
import subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def test_secret_scanner_rejects_a_leaked_token(tmp_path):
    token='gh'+'p_'+''.join(secrets.choice(string.ascii_letters+string.digits) for _ in range(36))
    (tmp_path/'leak.py').write_text('api_token = '+repr(token))
    result=subprocess.run([str(ROOT/'.security/bin/gitleaks'),'dir','--redact','--config',str(ROOT/'.gitleaks.toml'),str(tmp_path)],capture_output=True,text=True)
    assert result.returncode==1
    assert token not in result.stdout+result.stderr

def test_sast_rejects_dynamic_evaluation(tmp_path):
    path=tmp_path/'unsafe.js';path.write_text('eval(userText);')
    result=subprocess.run([str(ROOT/'.security-venv/bin/semgrep'),'scan','--no-git-ignore','--config',str(ROOT/'security/semgrep.yml'),'--metrics','off','--disable-version-check','--error',str(path)],capture_output=True,text=True)
    assert result.returncode==1
    assert 'no-dynamic-eval' in result.stdout
