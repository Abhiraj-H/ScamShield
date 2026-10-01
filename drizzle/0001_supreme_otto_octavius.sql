CREATE TABLE `audit_events` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`body` text NOT NULL,
	`previous` text NOT NULL,
	`digest` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`bucket` text NOT NULL,
	`window` integer NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_rate_bucket` ON `rate_limits` (`bucket`,`window`);--> statement-breakpoint
ALTER TABLE `cases` ADD `owner_id` text DEFAULT '' NOT NULL;