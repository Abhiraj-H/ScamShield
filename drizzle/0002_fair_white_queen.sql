DROP INDEX `idx_rate_bucket`;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_rate_bucket` ON `rate_limits` (`bucket`,`window`);
--> statement-breakpoint
CREATE INDEX idx_cases_owner ON cases(owner_id,created_at);
--> statement-breakpoint
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT,'Audit records are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT,'Audit records are append-only'); END;
