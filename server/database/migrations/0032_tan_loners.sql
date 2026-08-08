ALTER TABLE `media_references` ADD `storage_key` text;--> statement-breakpoint
ALTER TABLE `media_references` ADD `content_type` text;--> statement-breakpoint
ALTER TABLE `media_references` ADD `size_bytes` integer;--> statement-breakpoint
ALTER TABLE `media_references` ADD `original_filename` text;--> statement-breakpoint
CREATE INDEX `media_references_created_at_idx` ON `media_references` (`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `media_references_content_type_idx` ON `media_references` (`content_type`);