"""Reject unregistered versions, unexpected registries, and mismatched npm integrity."""
import concurrent.futures
import json
import re
import sys
import urllib.request
from pathlib import Path
from urllib.parse import quote, urlsplit

def read_json(url):
    request=urllib.request.Request(url,headers={'User-Agent':'ScamShield-supply-chain-check/1'})
    with urllib.request.urlopen(request,timeout=30) as response:return json.load(response)

def check_npm(item):
    name,version,integrity,resolved=item
    if urlsplit(resolved).hostname!='registry.npmjs.org' or not integrity.startswith('sha512-'):
        raise ValueError('Unexpected registry or missing strong integrity for '+name)
    info=read_json('https://registry.npmjs.org/'+quote(name,safe='')+'/'+quote(version,safe=''))
    if info['name']!=name or info['version']!=version or info['dist']['integrity']!=integrity or info['dist']['tarball']!=resolved:
        raise ValueError('Package provenance mismatch for '+name)

def check_python(item):
    name,version=item
    info=read_json('https://pypi.org/pypi/'+quote(name,safe='')+'/'+quote(version,safe='')+'/json')
    if not info.get('urls') or info['info']['version']!=version:raise ValueError('Unregistered Python package version: '+name)
    return {f['digests']['sha256'] for f in info['urls']}

def verify(root):
    items=set()
    for folder in [root,root/'backend']:
        lock=json.loads((folder/'package-lock.json').read_text())
        manifest=json.loads((folder/'package.json').read_text())
        for kind in ['dependencies','devDependencies']:
            if lock['packages'][''].get(kind,{})!=manifest.get(kind,{}):raise ValueError('Manifest/lock mismatch')
        for path,package in lock['packages'].items():
            if not path:continue
            if package.get('link'):raise ValueError('Local links are not allowed')
            name=path.rsplit('node_modules/',1)[-1]
            if package.get('inBundle'):
                parent=lock['packages'].get(path.rsplit('/node_modules/',1)[0],{})
                if name not in parent.get('bundleDependencies',[]) or not parent.get('integrity','').startswith('sha512-'):
                    raise ValueError('Unverified bundled dependency: '+name)
                continue  # Its bytes are covered by the parent tarball integrity.
            items.add((name,package['version'],package.get('integrity',''),package.get('resolved','')))
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        list(pool.map(check_npm,sorted(items)))
    text=(root/'backend/requirements.lock').read_text()
    groups=re.findall(r'^([A-Za-z0-9_.-]+)(?:\[[^\]]+\])?==([^\s\\]+)(.*?)(?=^\S|\Z)',text,re.M|re.S)
    if not groups:raise ValueError('Hashed Python lock is required')
    for name,version,block in groups:
        hashes=set(re.findall(r'--hash=sha256:([a-f0-9]{64})',block))
        if not hashes or not hashes.issubset(check_python((name,version))):raise ValueError('Python artifact integrity mismatch: '+name)
    return {'npm_versions':len(items),'python_versions':len(groups)}

if __name__=='__main__':
    print(json.dumps(verify(Path(__file__).resolve().parents[1])))
