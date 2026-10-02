ALTER TABLE `imports` ADD `cursor` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `imports` ADD `total` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `imports` ADD `progress_at` integer;