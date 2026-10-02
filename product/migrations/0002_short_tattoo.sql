CREATE TABLE `extension_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`extension_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`last_used_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `extension_tokens_token_hash_unique` ON `extension_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `extension_tokens_user_id_idx` ON `extension_tokens` (`user_id`);--> statement-breakpoint
CREATE TABLE `pairing_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`code` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pairing_codes_code_unique` ON `pairing_codes` (`code`);--> statement-breakpoint
CREATE INDEX `pairing_codes_user_id_idx` ON `pairing_codes` (`user_id`);