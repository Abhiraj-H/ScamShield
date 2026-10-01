"""Install pinned scanners, verifying Gitleaks against committed upstream checksums."""
import hashlib
import io
import os
import platform
import subprocess
import sys
import tarfile
import urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SCANNERS={'Darwin-arm64':('darwin_arm64','b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5'),'Linux-x86_64':('linux_x64','551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb')}
if __name__=='__main__':
    target,digest=SCANNERS[platform.system()+'-'+platform.machine()]
    url='https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_'+target+'.tar.gz'
    with urllib.request.urlopen(url,timeout=60) as response:data=response.read()
    if hashlib.sha256(data).hexdigest()!=digest:raise ValueError('Gitleaks checksum mismatch')
    output=ROOT/'.security/bin/gitleaks';output.parent.mkdir(parents=True,exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(data),mode='r:gz') as archive:
        # Only this named executable is extracted; no archive paths are accepted.
        member=archive.getmember('gitleaks')
        if not member.isfile():raise ValueError('Expected executable file')
        output.write_bytes(archive.extractfile(member).read())
    output.chmod(0o755)
    python=ROOT/'.security-venv/bin/python'
    if not python.exists():subprocess.run([sys.executable,'-m','venv',str(ROOT/'.security-venv')],check=True)
    subprocess.run([str(python),'-m','pip','install','semgrep==1.155.0'],check=True)
    print('Pinned scanners installed. Semgrep uses an isolated environment.')
