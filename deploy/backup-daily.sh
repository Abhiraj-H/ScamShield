#!/bin/sh
set -eu
umask 077
: "${SCAMSHIELD_BACKUP_DIR:?Set a protected backup directory}"
: "${SCAMSHIELD_DB:?Set the database path}"
# Invoke from the installed project with its dedicated Python environment.
.venv/bin/python -m backend.backup backup "$SCAMSHIELD_DB" "$SCAMSHIELD_BACKUP_DIR/scamshield-$(date -u +%Y%m%dT%H%M%SZ).sqlite3"
