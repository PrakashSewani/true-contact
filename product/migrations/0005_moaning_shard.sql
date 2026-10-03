DROP INDEX `observations_user_id_idx`;--> statement-breakpoint
DROP INDEX `observations_normalized_name_idx`;--> statement-breakpoint
ALTER TABLE `observations` ADD `record_key` text;--> statement-breakpoint
ALTER TABLE `observations` ADD `content_hash` text;--> statement-breakpoint
CREATE INDEX `observations_record_key_idx` ON `observations` (`user_id`,`record_key`,`created_at`);--> statement-breakpoint
ALTER TABLE `identities` ADD `normalized_name` text;--> statement-breakpoint
CREATE INDEX `identities_normalized_name_idx` ON `identities` (`user_id`,`normalized_name`);--> statement-breakpoint
UPDATE `observations` SET `record_key` = coalesce((SELECT `s`.`kind` FROM `sources` `s` WHERE `s`.`id` = `observations`.`source_id`), 'unknown') || ':x:' || `external_id` WHERE `external_id` IS NOT NULL AND `external_id` <> '';