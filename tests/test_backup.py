import os
import sqlite3
from pathlib import Path
import pytest
from backend.backup import snapshot, verify_restore

def test_backup_includes_committed_wal_and_is_restorable(tmp_path,monkeypatch):
    from backend import main
    monkeypatch.setattr(main,'DB_PATH',str(tmp_path/'live.sqlite3'))
    with main.connect() as con:
        con.execute("INSERT INTO cases(id,created_at,updated_at,status,lang,result,owner_id) VALUES('case','now','now','draft','en','{}','alice')")
        con.commit()
        backup=tmp_path/'backup.sqlite3'
        report=snapshot(main.DB_PATH,backup)
        assert report['restore_verified'] and report['counts']['cases']==1
        assert len(report['sha256'])==64
        assert backup.stat().st_mode & 0o777==0o600
        assert verify_restore(backup)['counts']['cases']==1
    with pytest.raises(ValueError):snapshot(main.DB_PATH,backup)
    with pytest.raises(ValueError):snapshot(main.DB_PATH,main.DB_PATH)
