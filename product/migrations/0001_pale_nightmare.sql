CREATE TABLE `conflicts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`identity_id` text NOT NULL,
	`field` text NOT NULL,
	`existing_value` text,
	`existing_value_id` text,
	`proposed_value` text NOT NULL,
	`proposed_label` text,
	`proposed_observation_id` text,
	`status` text DEFAULT 'open' NOT NULL,
	`resolution` text,
	`resolved_value` text,
	`created_at` integer NOT NULL,
	`resolved_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`identity_id`) REFERENCES `identities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`existing_value_id`) REFERENCES `identity_values`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`proposed_observation_id`) REFERENCES `observations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `conflicts_user_id_idx` ON `conflicts` (`user_id`);--> statement-breakpoint
CREATE INDEX `conflicts_identity_id_idx` ON `conflicts` (`identity_id`);--> statement-breakpoint
CREATE TABLE `history_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`identity_id` text NOT NULL,
	`type` text NOT NULL,
	`actor` text NOT NULL,
	`source_id` text,
	`import_id` text,
	`observation_id` text,
	`payload` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`identity_id`) REFERENCES `identities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`import_id`) REFERENCES `imports`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`observation_id`) REFERENCES `observations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `history_events_identity_id_created_at_idx` ON `history_events` (`identity_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `identities` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`display_name` text NOT NULL,
	`notes` text,
	`merged_into_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`merged_into_id`) REFERENCES `identities`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `identities_user_id_idx` ON `identities` (`user_id`);--> statement-breakpoint
CREATE TABLE `identity_links` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`identity_id` text NOT NULL,
	`observation_id` text NOT NULL,
	`confidence` real NOT NULL,
	`method` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`identity_id`) REFERENCES `identities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`observation_id`) REFERENCES `observations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `identity_links_observation_id_unique` ON `identity_links` (`observation_id`);--> statement-breakpoint
CREATE INDEX `identity_links_identity_id_idx` ON `identity_links` (`identity_id`);--> statement-breakpoint
CREATE TABLE `identity_values` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`identity_id` text NOT NULL,
	`kind` text NOT NULL,
	`value` text NOT NULL,
	`normalized_value` text NOT NULL,
	`label` text,
	`first_observation_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`identity_id`) REFERENCES `identities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`first_observation_id`) REFERENCES `observations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `identity_values_lookup_idx` ON `identity_values` (`user_id`,`kind`,`normalized_value`);--> statement-breakpoint
CREATE INDEX `identity_values_identity_id_idx` ON `identity_values` (`identity_id`);--> statement-breakpoint
CREATE TABLE `imports` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`source_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`raw_key` text,
	`file_name` text,
	`stats` text,
	`error` text,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `imports_user_id_idx` ON `imports` (`user_id`);--> statement-breakpoint
CREATE INDEX `imports_source_id_idx` ON `imports` (`source_id`);--> statement-breakpoint
CREATE TABLE `observation_identifiers` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`observation_id` text NOT NULL,
	`kind` text NOT NULL,
	`value` text NOT NULL,
	`normalized_value` text NOT NULL,
	`label` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`observation_id`) REFERENCES `observations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `observation_identifiers_lookup_idx` ON `observation_identifiers` (`user_id`,`kind`,`normalized_value`);--> statement-breakpoint
CREATE INDEX `observation_identifiers_observation_id_idx` ON `observation_identifiers` (`observation_id`);--> statement-breakpoint
CREATE TABLE `observations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`import_id` text NOT NULL,
	`source_id` text NOT NULL,
	`external_id` text,
	`display_name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`notes` text,
	`observed_at` integer NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`import_id`) REFERENCES `imports`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `observations_user_id_idx` ON `observations` (`user_id`);--> statement-breakpoint
CREATE INDEX `observations_import_id_idx` ON `observations` (`import_id`);--> statement-breakpoint
CREATE INDEX `observations_normalized_name_idx` ON `observations` (`normalized_name`);--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`label` text,
	`last_observed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sources_user_id_idx` ON `sources` (`user_id`);--> statement-breakpoint
CREATE TABLE `usage_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `usage_operations_user_id_created_at_idx` ON `usage_operations` (`user_id`,`created_at`);