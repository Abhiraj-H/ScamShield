"""Consistent SQLite snapshots and isolated restore verification, never an in-place restore."""
import argparse
import hashlib
import json
import os
import sqlite3
import tempfile
from pathlib import Path

def snapshot(source, destination):
    source=Path(source).resolve();destination=Path(destination).resolve()
    if not source.is_file() or source==destination or destination.exists():
        raise ValueError('Source must exist and destination must be a new file')
    destination.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    # SQLite backup API includes committed WAL data without stopping the service.
    fd=os.open(destination,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600);os.close(fd)
    try:
        with sqlite3.connect(source.as_uri()+'?mode=ro',uri=True) as src, sqlite3.connect(destination) as dst:
            src.backup(dst)
        report=verify_restore(destination)
        digest=hashlib.sha256(destination.read_bytes()).hexdigest()
        manifest={'sha256':digest,'bytes':destination.stat().st_size,**report}
        path=destination.with_suffix(destination.suffix+'.json')
        fd=os.open(path,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
        with os.fdopen(fd,'w') as out:json.dump(manifest,out,indent=2)
        return manifest
    except Exception:
        destination.unlink(missing_ok=True)
        raise

def verify_restore(backup):
    backup=Path(backup).resolve()
    if not backup.is_file():raise ValueError('Backup does not exist')
    with tempfile.TemporaryDirectory(prefix='scamshield-restore-') as temp:
        restored=Path(temp)/'restored.sqlite3'
        with sqlite3.connect(backup.as_uri()+'?mode=ro',uri=True) as src, sqlite3.connect(restored) as dst:
            src.backup(dst)
            if dst.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise ValueError('Backup integrity check failed')
            required={'cases','intel','audit_events','rate_limits'}
            tables={r[0] for r in dst.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            if not required.issubset(tables):raise ValueError('Backup is missing required tables')
            queries={'cases':'SELECT COUNT(*) FROM cases','intel':'SELECT COUNT(*) FROM intel','audit_events':'SELECT COUNT(*) FROM audit_events','rate_limits':'SELECT COUNT(*) FROM rate_limits'}
            counts={t:dst.execute(query).fetchone()[0] for t,query in queries.items()}
    return {'restore_verified':True,'counts':counts}

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('operation',choices=['backup','verify']);parser.add_argument('source');parser.add_argument('destination',nargs='?');args=parser.parse_args()
    if args.operation=='backup' and not args.destination:parser.error('backup requires destination')
    print(json.dumps(snapshot(args.source,args.destination) if args.operation=='backup' else verify_restore(args.source),indent=2))
