import { sqlite } from './index';

/**
 * Ensures all tables exist using CREATE TABLE IF NOT EXISTS.
 * Safe to run on every startup — idempotent, no journal dependency.
 * Works whether the DB was created via db:push or is brand new.
 */
export function runMigrations() {
	try {
		sqlite.exec(`
			CREATE TABLE IF NOT EXISTS \`dj_users\` (
				\`id\` text PRIMARY KEY NOT NULL,
				\`display_name\` text NOT NULL,
				\`access_token\` text NOT NULL,
				\`refresh_token\` text NOT NULL,
				\`token_expiry\` integer NOT NULL
			);

			CREATE TABLE IF NOT EXISTS \`events\` (
				\`id\` text PRIMARY KEY NOT NULL,
				\`name\` text NOT NULL,
				\`accent_color\` text DEFAULT '#3B82F6' NOT NULL,
				\`dj_user_id\` text NOT NULL,
				\`spotify_playlist_id\` text,
				\`spotify_played_playlist_id\` text,
				\`qr_code_svg\` text,
				\`created_at\` integer NOT NULL,
				FOREIGN KEY (\`dj_user_id\`) REFERENCES \`dj_users\`(\`id\`) ON UPDATE no action ON DELETE no action
			);

			CREATE TABLE IF NOT EXISTS \`queue_entries\` (
				\`id\` text PRIMARY KEY NOT NULL,
				\`event_id\` text NOT NULL,
				\`spotify_track_id\` text NOT NULL,
				\`title\` text NOT NULL,
				\`artist\` text NOT NULL,
				\`album_art\` text NOT NULL,
				\`added_at\` integer NOT NULL,
				\`played\` integer DEFAULT false NOT NULL,
				FOREIGN KEY (\`event_id\`) REFERENCES \`events\`(\`id\`) ON UPDATE no action ON DELETE no action
			);

			CREATE TABLE IF NOT EXISTS \`votes\` (
				\`id\` text PRIMARY KEY NOT NULL,
				\`queue_entry_id\` text NOT NULL,
				\`voter_token\` text NOT NULL,
				\`created_at\` integer NOT NULL,
				FOREIGN KEY (\`queue_entry_id\`) REFERENCES \`queue_entries\`(\`id\`) ON UPDATE no action ON DELETE no action
			);

			CREATE TABLE IF NOT EXISTS \`engagement_events\` (
				\`id\` text PRIMARY KEY NOT NULL,
				\`event_id\` text NOT NULL,
				\`type\` text NOT NULL,
				\`title\` text NOT NULL,
				\`options\` text NOT NULL,
				\`correct_option\` integer,
				\`duration_seconds\` integer NOT NULL,
				\`started_at\` integer NOT NULL,
				\`ended_at\` integer,
				\`status\` text DEFAULT 'active' NOT NULL,
				FOREIGN KEY (\`event_id\`) REFERENCES \`events\`(\`id\`) ON UPDATE no action ON DELETE no action
			);

			CREATE TABLE IF NOT EXISTS \`engagement_votes\` (
				\`id\` text PRIMARY KEY NOT NULL,
				\`engagement_event_id\` text NOT NULL,
				\`option_index\` integer NOT NULL,
				\`voter_token\` text NOT NULL,
				\`created_at\` integer NOT NULL,
				FOREIGN KEY (\`engagement_event_id\`) REFERENCES \`engagement_events\`(\`id\`) ON UPDATE no action ON DELETE no action
			);
		`);
		console.log('[DB] Schema ready');
	} catch (err) {
		console.error('[DB] Schema init failed:', err);
		throw err; // re-throw so the server doesn't silently start with a broken DB
	}
}
