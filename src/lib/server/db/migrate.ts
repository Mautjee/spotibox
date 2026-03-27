import postgres from 'postgres';

export async function runMigrations() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL env var is required');

  const sql = postgres(connectionString);

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS dj_users (
        id text PRIMARY KEY NOT NULL,
        display_name text NOT NULL,
        access_token text NOT NULL,
        refresh_token text NOT NULL,
        token_expiry timestamptz NOT NULL
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS events (
        id text PRIMARY KEY NOT NULL,
        name text NOT NULL,
        accent_color text NOT NULL DEFAULT '#3B82F6',
        dj_user_id text NOT NULL REFERENCES dj_users(id),
        spotify_playlist_id text,
        spotify_played_playlist_id text,
        qr_code_svg text,
        created_at timestamptz NOT NULL
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS queue_entries (
        id text PRIMARY KEY NOT NULL,
        event_id text NOT NULL REFERENCES events(id),
        spotify_track_id text NOT NULL,
        title text NOT NULL,
        artist text NOT NULL,
        album_art text NOT NULL,
        added_at timestamptz NOT NULL,
        played boolean NOT NULL DEFAULT false
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS votes (
        id text PRIMARY KEY NOT NULL,
        queue_entry_id text NOT NULL REFERENCES queue_entries(id),
        voter_token text NOT NULL,
        created_at timestamptz NOT NULL
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS engagement_events (
        id text PRIMARY KEY NOT NULL,
        event_id text NOT NULL REFERENCES events(id),
        type text NOT NULL,
        title text NOT NULL,
        options text NOT NULL,
        correct_option integer,
        duration_seconds integer NOT NULL,
        started_at timestamptz NOT NULL,
        ended_at timestamptz,
        status text NOT NULL DEFAULT 'active'
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS engagement_votes (
        id text PRIMARY KEY NOT NULL,
        engagement_event_id text NOT NULL REFERENCES engagement_events(id),
        option_index integer NOT NULL,
        voter_token text NOT NULL,
        created_at timestamptz NOT NULL
      )
    `;

    console.log('[DB] Schema ready');
  } catch (err) {
    console.error('[DB] Schema init failed:', err);
    throw err;
  } finally {
    await sql.end();
  }
}
