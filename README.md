# SpotyBox

SpotyBox is a real-time crowd-driven DJ request platform. Attendees scan a QR code, search for songs, add them to a live queue, and upvote their favourites — all from their phones. The DJ sees the ranked queue on their dashboard and on a full-screen TV display. DJs can also launch live crowd engagement events (genre polls and quiz questions).

## Routes reference

| Route | Description |
|---|---|
| `/` | Landing page |
| `/auth/spotify` | Initiate Spotify OAuth login (DJ) |
| `/auth/spotify/callback` | Spotify OAuth callback |
| `/auth/logout` | Log out |
| `/dj/dashboard` | DJ dashboard — manage events, queue, engagement |
| `/event/[id]` | Crowd page — search songs, vote |
| `/event/[id]/display` | TV display — full-screen live queue |
| `/api/events` | Create events |
| `/api/events/[id]/queue` | Add songs to queue |
| `/api/events/[id]/queue/[qid]/vote` | Vote on a song |
| `/api/events/[id]/queue/[qid]/played` | Mark song as played (DJ) |
| `/api/events/[id]/engagement` | Launch engagement event (DJ) |
| `/api/events/[id]/engagement/[eid]/vote` | Vote on engagement option (crowd) |
| `/api/events/[id]/engagement/[eid]/control` | Control engagement (end early) |
| `/api/events/[id]/stream` | SSE stream for real-time updates |
| `/api/events/[id]/qr` | Download QR code SVG |
| `/api/search` | Search Spotify tracks |

## Local development setup

### Prerequisites
- [Bun](https://bun.sh) runtime
- A Spotify Developer account and app

### Spotify app setup

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create a new app
3. Add `http://localhost:5173/auth/spotify/callback` as a Redirect URI
4. Note your **Client ID** and **Client Secret**
5. Required scopes (no action needed — these are requested at login):
   - `user-read-email`
   - `user-read-private`
   - `playlist-modify-public`
   - `playlist-modify-private`

### Steps

1. **Clone the repo**
   ```sh
   git clone <repo-url>
   cd spotybox
   ```

2. **Copy `.env.example` and fill in values**
   ```sh
   cp .env.example .env
   ```
   Edit `.env`:
   ```
   SPOTIFY_CLIENT_ID=your_client_id
   SPOTIFY_CLIENT_SECRET=your_client_secret
   SPOTIFY_REDIRECT_URI=http://localhost:5173/auth/spotify/callback
   SESSION_SECRET=a_long_random_secret_string
   DATABASE_PATH=local.db
   ```

3. **Install dependencies**
   ```sh
   bun install
   ```

4. **Push database schema (local dev)**
   ```sh
   bun run db:push
   ```

5. **Start the dev server**
   ```sh
   bun run dev
   ```
   Open [http://localhost:5173](http://localhost:5173)

## Docker / production

### Build and run with Docker

```sh
docker build -t spotybox .

docker run -p 3000:3000 \
  -v spotybox_data:/data \
  --env-file .env \
  spotybox
```

### Or use docker-compose

```sh
docker-compose up --build
```

The app will be available at [http://localhost:3000](http://localhost:3000).

The SQLite database is persisted in the `spotybox_data` Docker volume at `/data/db.sqlite`. Migrations run automatically on startup.

## Deploying with Dokploy (VPS)

1. Push your code to a Git repository
2. In Dokploy, create a new **Application** pointing to your repo
3. Set the **Build type** to `Dockerfile`
4. Set environment variables in the Dokploy dashboard:
   ```
   SPOTIFY_CLIENT_ID=...
   SPOTIFY_CLIENT_SECRET=...
   SPOTIFY_REDIRECT_URI=https://yourdomain.com/auth/spotify/callback
   SESSION_SECRET=...
   DATABASE_PATH=/data/db.sqlite
   NODE_ENV=production
   ```
5. Mount a persistent volume at `/data` so the database survives redeployments
6. In your Spotify app's Redirect URIs, add `https://yourdomain.com/auth/spotify/callback`
7. Deploy

> **Note:** The `SPOTIFY_REDIRECT_URI` in production **must** match exactly what is registered in the Spotify developer dashboard.
