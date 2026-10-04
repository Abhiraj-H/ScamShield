# ScamShield operations and incident response

This is a deployment-ready procedure template. No on-call person, paging integration, backup timer or production SLO measurement has been activated by this local change.

## Ownership and targets

Before launch, record primary responder, secondary responder, IdP administrator, database/cloud administrator, escalation channel and status-page owner in your operations system. Keep contacts out of the public source repository.

Proposed SLOs: authenticated case reads available 99.5% monthly; rule-based analysis completes within 5 seconds for 95% of ordinary text requests. These are targets, not measured promises. Separately track model/tool latency, quota rejections and database/audit failure rates. Do not count a failed external verification as proof that a message is safe.

Proposed backup targets: RPO ≤24 hours and RTO ≤4 hours. The local restore test checks correctness; it does not establish production RTO.

## Monitoring and paging

Collect structured `scamshield.security` logs for the API and Sites worker JSON logs where available. Use request IDs to correlate failures; never enable full request-body or Authorization logging. Authenticate the `/ops/readiness`, `/ops/metrics` and `/ops/audit` API endpoints with a short-lived MFA token containing the `auditor` role. Liveness `/health` alone does not establish working authentication, database writes or model availability.

Page the primary responder for database/audit unavailability, a verified ledger integrity/checkpoint mismatch, or authenticated user flows returning ≥5% 5xx for five minutes. Notify for sustained 429s or IdP failures; investigate traffic before raising limits. Have the secondary take over after ten minutes without acknowledgement. Supply your monitoring system’s actual paging and escalation rules before launch.

Copy ledger checkpoints to a separate restricted, append-only destination. Compare exported ledger signatures and the last checkpoint; sequence/signature checks alone cannot detect removal of a valid trailing prefix. The standalone ledger records metadata and case state hashes, never before/after evidence text. Keep cryptographic keys in the vault and back up recovery access separately.

## Database or audit outage

1. Record UTC time and failing request IDs. Fail closed; never remove ownership or audit guards to restore availability.
2. Check disk capacity, SQLite WAL/locking, file permissions and the configured volume. For D1, check the provider service and binding/migration state.
3. Run `PRAGMA quick_check` on a read-only copy. Do not edit production audit rows or run destructive migrations as a diagnostic.
4. Restore to a fresh database using the procedure below, compare counts and external audit checkpoints, then switch the service to the validated copy during a maintenance window.
5. Verify sign-in, a read/write with the correct owner, a rejected second-user request, approval/export and a new ledger event before reopening service.

## Identity-provider outage

Check the issuer/JWKS service and key rotation. Cache lifetime is five minutes; token expiry and signature checks remain mandatory. Re-establish provider access or repair the trusted issuer configuration. Never enable developer auth or replace MFA checks with a shared user token. A token without the expected MFA/role claims requires an IdP policy fix. The frontend Site relies on platform sign-in/session management; escalate that outage through its provider.

## Dependency CVE or secret leak

Block releases. Save the advisory ID and affected lockfile versions. Update dependencies, regenerate hashed Python locks if necessary, then run the full gate and the tracked release policy and exact-commit CI process. If a key leaked, revoke/rotate it at the provider/vault first and examine usage; deleting a Git file does not revoke a leaked key. Preserve redacted forensic metadata. Re-scan history and invalidate affected artifacts. Audit-key rotation needs a versioned keyring migration; keep old signing material securely for history verification.

## Abuse or model outage

Retain quota guards; investigate hashed actors, endpoint/status aggregates and edge traffic. Apply narrower WAF/auth-rate rules at the trusted edge. Do not trust client-supplied forwarded IPs. The application does not sign users up or visit submitted URLs.

OpenAI failure falls back to deterministic rule-based text processing with a visible failed tool trace. Direct provider vision fails explicitly; suggest editable local OCR/pasted text. Do not disable consent or send screenshots to another provider during an incident.

## Backup and restore

For independently hosted SQLite:

```sh
.venv/bin/python -m backend.backup backup /path/to/live.sqlite3 /protected/backups/new-snapshot.sqlite3
.venv/bin/python -m backend.backup verify /protected/backups/new-snapshot.sqlite3
```

The snapshot uses SQLite’s online backup API, includes committed WAL data, uses mode 0600, and verifies a restored copy in a temporary directory. It refuses to overwrite an existing backup or the live database. Preserve its SHA256 manifest. Encrypt/copy the file to protected off-host storage with the same chosen region/policy.

Install `deploy/scamshield-backup.service` and `.timer` after adjusting `/opt/scamshield`, the service account, and protected `backup.conf` containing `SCAMSHIELD_DB` and `SCAMSHIELD_BACKUP_DIR`. Set the RW backup directory correctly; enable the timer and inspect the first successful run. Alert on a failed run or the absence of a verified backup within 24 hours. No timer is currently installed.

For a real recovery, stop the API, restore **into a new location**, verify integrity, owner distribution, counts and the external audit checkpoint, preserve the old database plus its WAL/SHM files for investigation, and point `SCAMSHIELD_DB` to the validated copy. Never overwrite the live file while the service is running. Test at least quarterly and record start/end timestamps, observed RPO/RTO, data loss and sign-off.

For hosted D1, the account administrator must verify the actual Time Travel retention and database ID, take an export, and rehearse a supported restore. The connector could not find the existing Site during this audit. Do not assume its backup configuration or region.

## Incident and post-mortem record

Record incident ID, UTC start/detection/containment/recovery times, responders, affected flows and data, severity, customer impact, evidence/checkpoint hashes, containment decisions, root cause, contributing factors, recovery validation, measured RPO/RTO, communications and corrective actions with owners/deadlines. Keep evidence in restricted incident storage. Review the timeline with the primary and secondary, then test the prevention measure before closing the incident.
