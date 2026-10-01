CREATE TABLE `cases` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`status` text NOT NULL,
	`lang` text NOT NULL,
	`result` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_cases_created_at` ON `cases` (`created_at`);--> statement-breakpoint
CREATE TABLE `intel` (
	`indicator_hash` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`report_count` integer DEFAULT 1 NOT NULL,
	`first_seen` text NOT NULL,
	`last_seen` text NOT NULL
);
