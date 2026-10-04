"""Deploy only a clean, independently reviewed main revision with passing checks."""
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if __name__ == '__main__':
    env = dict(os.environ)
    env.setdefault('SCAMSHIELD_GITHUB_REPO', 'Abhiraj-H/ScamShield')
    if not env.get('GH_TOKEN'):
        env['GH_TOKEN'] = subprocess.check_output(['gh', 'auth', 'token'], text=True).strip()
    subprocess.run([str(ROOT / '.venv/bin/python'), 'scripts/verify-release.py'], cwd=ROOT, env=env, check=True)
    subprocess.run([str(ROOT / '.venv/bin/python'), 'scripts/security_gate.py'], cwd=ROOT, check=True)
    subprocess.run(['npx', '--yes', 'vercel@62.2.0', 'deploy', '--prod', '--yes'], cwd=ROOT, check=True)
