import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const djUsers = sqliteTable('dj_users', {
  id: text('id').primaryKey(), // Spotify user ID
  displayName: text('display_name').notNull(),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token').notNull(),
  tokenExpiry: integer('token_expiry', { mode: 'timestamp' }).notNull(),
});

export const events = sqliteTable('events', {
  id: text('id').primaryKey(), // nanoid
  name: text('name').notNull(),
  accentColor: text('accent_color').notNull().default('#3B82F6'),
  djUserId: text('dj_user_id').notNull().references(() => djUsers.id),
  spotifyPlaylistId: text('spotify_playlist_id'),
  spotifyPlayedPlaylistId: text('spotify_played_playlist_id'),
  qrCodeSvg: text('qr_code_svg'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const queueEntries = sqliteTable('queue_entries', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull().references(() => events.id),
  spotifyTrackId: text('spotify_track_id').notNull(),
  title: text('title').notNull(),
  artist: text('artist').notNull(),
  albumArt: text('album_art').notNull(),
  addedAt: integer('added_at', { mode: 'timestamp' }).notNull(),
  played: integer('played', { mode: 'boolean' }).notNull().default(false),
});

export const votes = sqliteTable('votes', {
  id: text('id').primaryKey(),
  queueEntryId: text('queue_entry_id').notNull().references(() => queueEntries.id),
  voterToken: text('voter_token').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const engagementEvents = sqliteTable('engagement_events', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull().references(() => events.id),
  type: text('type', { enum: ['genre_poll', 'quiz'] }).notNull(),
  title: text('title').notNull(),
  options: text('options').notNull(), // JSON array of strings
  correctOption: integer('correct_option'), // nullable, quiz only
  durationSeconds: integer('duration_seconds').notNull(),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  endedAt: integer('ended_at', { mode: 'timestamp' }),
  status: text('status', { enum: ['active', 'revealing', 'ended'] }).notNull().default('active'),
});

export const engagementVotes = sqliteTable('engagement_votes', {
  id: text('id').primaryKey(),
  engagementEventId: text('engagement_event_id').notNull().references(() => engagementEvents.id),
  optionIndex: integer('option_index').notNull(),
  voterToken: text('voter_token').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});
