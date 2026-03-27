import { pgTable, text, integer, boolean, timestamp, unique } from 'drizzle-orm/pg-core';

export const djUsers = pgTable('dj_users', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token').notNull(),
  tokenExpiry: timestamp('token_expiry').notNull(),
});

export const events = pgTable('events', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  accentColor: text('accent_color').notNull().default('#3B82F6'),
  djUserId: text('dj_user_id').notNull().references(() => djUsers.id),
  spotifyPlaylistId: text('spotify_playlist_id'),
  spotifyPlayedPlaylistId: text('spotify_played_playlist_id'),
  qrCodeSvg: text('qr_code_svg'),
  createdAt: timestamp('created_at').notNull(),
});

export const queueEntries = pgTable('queue_entries', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull().references(() => events.id),
  spotifyTrackId: text('spotify_track_id').notNull(),
  title: text('title').notNull(),
  artist: text('artist').notNull(),
  albumArt: text('album_art').notNull(),
  addedAt: timestamp('added_at').notNull(),
  played: boolean('played').notNull().default(false),
});

export const votes = pgTable('votes', {
  id: text('id').primaryKey(),
  queueEntryId: text('queue_entry_id').notNull().references(() => queueEntries.id),
  voterToken: text('voter_token').notNull(),
  type: text('type').notNull().default('up'),
  createdAt: timestamp('created_at').notNull(),
}, (t) => [unique().on(t.queueEntryId, t.voterToken)]);

export const engagementEvents = pgTable('engagement_events', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull().references(() => events.id),
  type: text('type').notNull(),
  title: text('title').notNull(),
  options: text('options').notNull(),
  correctOption: integer('correct_option'),
  durationSeconds: integer('duration_seconds').notNull(),
  startedAt: timestamp('started_at').notNull(),
  endedAt: timestamp('ended_at'),
  status: text('status').notNull().default('active'),
});

export const engagementVotes = pgTable('engagement_votes', {
  id: text('id').primaryKey(),
  engagementEventId: text('engagement_event_id').notNull().references(() => engagementEvents.id),
  optionIndex: integer('option_index').notNull(),
  voterToken: text('voter_token').notNull(),
  createdAt: timestamp('created_at').notNull(),
});
