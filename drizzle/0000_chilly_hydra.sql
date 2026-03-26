CREATE TABLE `dj_users` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`access_token` text NOT NULL,
	`refresh_token` text NOT NULL,
	`token_expiry` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `engagement_events` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`options` text NOT NULL,
	`correct_option` integer,
	`duration_seconds` integer NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`status` text DEFAULT 'active' NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `engagement_votes` (
	`id` text PRIMARY KEY NOT NULL,
	`engagement_event_id` text NOT NULL,
	`option_index` integer NOT NULL,
	`voter_token` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`engagement_event_id`) REFERENCES `engagement_events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`accent_color` text DEFAULT '#3B82F6' NOT NULL,
	`dj_user_id` text NOT NULL,
	`spotify_playlist_id` text,
	`spotify_played_playlist_id` text,
	`qr_code_svg` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`dj_user_id`) REFERENCES `dj_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `queue_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`spotify_track_id` text NOT NULL,
	`title` text NOT NULL,
	`artist` text NOT NULL,
	`album_art` text NOT NULL,
	`added_at` integer NOT NULL,
	`played` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `votes` (
	`id` text PRIMARY KEY NOT NULL,
	`queue_entry_id` text NOT NULL,
	`voter_token` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`queue_entry_id`) REFERENCES `queue_entries`(`id`) ON UPDATE no action ON DELETE no action
);
