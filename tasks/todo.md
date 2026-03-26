# SpotyBox — Implementation Plan

## Spec Reference
- App: Crowd-controlled DJ song request system
- Stack: SvelteKit + TypeScript, Tailwind CSS, shadcn-svelte, Drizzle ORM, SQLite, SSE, Spotify OAuth
- Deployment: Docker (multi-stage, adapter-node) on VPS via Dokploy

---

## Phase 1 — Project Foundation

- [x] Scaffold SvelteKit project with TypeScript (`npm create svelte@latest`)
- [x] Install and configure Tailwind CSS
- [x] Install and configure shadcn-svelte
- [x] Install Drizzle ORM + better-sqlite3 + drizzle-kit
- [x] Write SQLite schema (see Data Model below)
- [x] Run initial Drizzle migration to generate the database
- [x] Enable WAL mode on SQLite for concurrent read performance
- [x] Set up `.env` and `.env.example` with all required variables
- [x] Write `Dockerfile` (multi-stage, SvelteKit adapter-node, SQLite volume at `/data`)
- [x] Write `.dockerignore`
- [x] Install `@fontsource/inter` and configure as global font
- [x] Install `lucide-svelte` for icons
- [x] Set up global CSS design tokens (color variables, glow utilities, glassmorphism utility classes)

---

## Phase 2 — Auth & Identity

- [ ] Register SpotyBox on Spotify Developer Dashboard (document steps in README)
- [ ] Implement Spotify OAuth 2.0 Authorization Code flow (DJ login)
  - `GET /auth/spotify` — redirect to Spotify
  - `GET /auth/spotify/callback` — exchange code for tokens, store in DB, set session cookie
  - `GET /auth/logout` — clear session
- [ ] Server-side session management (encrypted cookie via `lucia` or `iron-session`)
- [ ] Store DJ access token + refresh token in `DJUser` table
- [ ] Implement Spotify token refresh middleware (auto-refresh before expiry)
- [ ] Implement crowd anonymous identity
  - Generate a UUID token on first visit, store in a `spotybox_token` cookie (HttpOnly, SameSite=Lax)
  - Fingerprint fallback: hash of `navigator.userAgent + screen.width + screen.height + timezone` if cookie is blocked
  - Expose token to client via a `+layout.server.ts` load function

---

## Phase 3 — Events

- [ ] DJ can create a named event
  - Form: event name + accent color picker (hex)
  - Generate unique event ID (nanoid, URL-safe)
  - Create two Spotify playlists via API:
    - `SpotyBox — {Event Name}` (live queue, public)
    - `SpotyBox — {Event Name} (Played)` (archive, public)
  - Store both playlist IDs in `Event` table
- [ ] Generate QR code server-side pointing to `/event/[id]`
  - Use `qrcode` npm package
  - Store as SVG string in `Event` table
  - Serve via `GET /api/events/[id]/qr` as downloadable SVG/PNG
- [ ] DJ dashboard: list all events belonging to the logged-in DJ
- [ ] DJ dashboard: switch active event context

---

## Phase 4 — Song Queue ✅ COMPLETE

### Backend
- [x] `GET /api/events/[id]/queue` — return full queue sorted by vote count desc (excluding played songs)
- [x] `POST /api/events/[id]/queue` — add a song to the queue
- [x] `POST /api/events/[id]/queue/[songId]/vote` — upvote a song
- [x] `PATCH /api/events/[id]/queue/[songId]/played` — DJ marks song as played (auth required)
- [x] `GET /api/search` — Spotify search proxy with client credentials token cache
- [x] `src/lib/server/sse.ts` — SSE broadcast stub
- [x] `src/lib/server/spotify/search.ts` — Client Credentials token cache
- [x] `src/lib/server/spotify/sync.ts` — Playlist sync stub

### Frontend — Crowd Page (`/event/[id]`)
- [x] Load event details + queue in `+page.server.ts`
- [x] Full crowd page with search, queue list, voting

### Frontend — DJ Dashboard (`/dj/dashboard`)
- [x] Queue loading in `+page.server.ts`
- [x] Queue management UI with "Mark as Played" and event selector

---

## Phase 5 — Real-time (SSE)

- [ ] `GET /api/events/[id]/stream` — SSE endpoint
  - Keep connection alive with periodic heartbeat comment (`:heartbeat\n\n`)
  - Track active connections per event in a server-side `Map`
  - Broadcast helper: `broadcast(eventId, type, data)`
- [ ] SSE event types:
  - `queue_updated` — payload: full sorted queue array
  - `engagement_started` — payload: engagement event object
  - `engagement_updated` — payload: current vote counts per option
  - `engagement_ended` — payload: results + correct answer (if quiz)
  - `engagement_cleared` — payload: none (signal to return to queue view)
- [ ] Crowd page subscribes to SSE stream, updates queue reactively
- [ ] TV display subscribes to SSE stream
- [ ] DJ dashboard subscribes to SSE stream
- [ ] Reconnection: use `EventSource` with exponential backoff on error

---

## Phase 6 — Spotify Playlist Sync

- [ ] `syncPlaylist(eventId)` server utility:
  - Fetch current queue sorted by votes
  - Compare to current Spotify playlist track order
  - Use `PUT /playlists/{id}/tracks` to reorder to match vote ranking
- [ ] Call `syncPlaylist` after every vote cast and every song addition
- [ ] On song added: `POST /playlists/{id}/tracks` to append to live queue playlist
- [ ] On song marked played:
  - `DELETE /playlists/{id}/tracks` to remove from live queue playlist
  - `POST /playlists/{playedId}/tracks` to append to played archive playlist
- [ ] Handle Spotify rate limiting (429 responses): queue sync operations, retry with backoff
- [ ] Handle token expiry in all Spotify API calls (use refresh middleware)

---

## Phase 7 — TV Display (`/event/[id]/display`)

- [ ] Route: `/event/[id]/display`
- [ ] No auth required, public
- [ ] Fullscreen layout, no scrollbars
- [ ] Header: event name (massive, glow) + live indicator dot
- [ ] Song list: top 10 songs
  - Rank number (huge, muted)
  - Album art (large, ~80px, rounded)
  - Title + artist
  - Animated horizontal vote bar (pill-shaped, accent color)
  - Vote count (bold)
- [ ] `#1` ranked song: larger card, accent glow border, title text-glow, pulsing animation
- [ ] Subscribe to SSE stream, update queue and handle engagement takeover
- [ ] Engagement event takeover state handled in Phase 8

---

## Phase 8 — Engagement Events

### Backend
- [ ] `POST /api/events/[id]/engagement` — DJ launches an engagement event (auth required)
  - Body: `{ type: 'genre_poll' | 'quiz', title, options: string[], correctOption?: number, durationSeconds: number }`
  - Insert into `EngagementEvent` table with `status: 'active'`
  - Broadcast `engagement_started` SSE event
  - Schedule timer: after `durationSeconds`, set `status: 'revealing'`, broadcast `engagement_ended`
  - After reveal delay (8s), set `status: 'ended'`, broadcast `engagement_cleared`
- [ ] `POST /api/events/[id]/engagement/[engId]/vote` — crowd votes on an engagement option
  - Identify voter by session token
  - Enforce 1 vote per voter per engagement event
  - Broadcast `engagement_updated` SSE event with updated counts
- [ ] `PATCH /api/events/[id]/engagement/[engId]/end` — DJ ends event early (auth required)
- [ ] `PATCH /api/events/[id]/engagement/[engId]/extend` — DJ extends timer (auth required)
- [ ] `GET /api/events/[id]/engagement/active` — return current active engagement event (if any)

### DJ Dashboard — Right Column
- [ ] "Launch Event" button opens a modal with template picker
- [ ] **Genre Poll template form**: title, 2–6 option inputs (add/remove), duration picker (5/10/15/30 min)
- [ ] **Quiz Question template form**: question text, 2–4 option inputs, mark correct answer, duration picker
- [ ] Active engagement event panel: shows type, title, live vote counts, countdown timer, "End Early" + "Extend +5min" buttons

### Crowd Page — Engagement Takeover
- [ ] On `engagement_started` SSE: slide up full-screen sheet over the queue
- [ ] Sheet shows: event title, all options as large tappable pill buttons
- [ ] After voting: show live percentages per option (animated pill bars)
- [ ] On `engagement_ended` SSE:
  - Genre poll: highlight winning option with accent glow
  - Quiz: highlight correct answer in green, wrong answers in red
- [ ] On `engagement_cleared` SSE: dismiss sheet, return to queue

### TV Display — Engagement Takeover
- [ ] On `engagement_started` SSE: fade out queue, scale in engagement full-screen view
- [ ] Show question/title large at top, options as animated pill bars with live vote percentages
- [ ] Countdown ring (SVG circle) in corner: amber below 30s, pulsing red below 10s
- [ ] On `engagement_ended` SSE:
  - Staggered bar animation to final percentages
  - Correct answer bar glows green (quiz), winning option glows accent (genre poll)
  - Result lingers 8 seconds
- [ ] On `engagement_cleared` SSE: fade back to song queue

---

## Phase 9 — Polish & Deployment

### UI Polish
- [ ] Loading skeletons for queue cards while fetching
- [ ] Empty state for queue (no songs yet — prompt crowd to add one)
- [ ] Error toast notifications (failed vote, failed add, network error)
- [ ] "Already voted" visual feedback (no toast, just button state)
- [ ] Responsive audit: crowd page on small phones (375px), DJ dashboard on iPad (768px), TV on 1080p+
- [ ] Accessibility: aria-labels on all icon buttons, focus styles, keyboard nav on DJ dashboard
- [ ] Page transitions: fade + upward slide between routes

### DJ Dashboard Polish
- [ ] Show Spotify avatar + display name in header
- [ ] Confirm dialog before marking a song as played
- [ ] Show played songs section (collapsed, expandable) for reference during the set

### Deployment
- [ ] Test Dockerfile locally (`docker build` + `docker run`)
- [ ] Verify SQLite volume persistence across container restarts
- [ ] Write `docker-compose.yml` for local development convenience
- [ ] Write deployment notes in `README.md`:
  - Required env vars
  - Spotify app setup (redirect URI, scopes needed)
  - Dokploy volume configuration for `/data`
- [ ] Set `NODE_ENV=production` in Dockerfile
- [ ] Confirm SSE works behind a reverse proxy (Nginx/Traefik: disable buffering, set `X-Accel-Buffering: no`)

---

## Data Model Reference

```
DJUser
  id              TEXT PK   (Spotify user ID)
  displayName     TEXT
  accessToken     TEXT
  refreshToken    TEXT
  tokenExpiry     DATETIME

Event
  id              TEXT PK   (nanoid)
  name            TEXT
  accentColor     TEXT      (hex, e.g. #3B82F6)
  djUserId        TEXT → DJUser.id
  spotifyPlaylistId     TEXT
  spotifyPlayedPlaylistId TEXT
  qrCodeSvg       TEXT
  createdAt       DATETIME

QueueEntry
  id              TEXT PK
  eventId         TEXT → Event.id
  spotifyTrackId  TEXT
  title           TEXT
  artist          TEXT
  albumArt        TEXT
  addedAt         DATETIME
  played          BOOLEAN DEFAULT false
  UNIQUE(eventId, spotifyTrackId)

Vote
  id              TEXT PK
  queueEntryId    TEXT → QueueEntry.id
  voterToken      TEXT
  createdAt       DATETIME
  UNIQUE(queueEntryId, voterToken)

EngagementEvent
  id              TEXT PK
  eventId         TEXT → Event.id
  type            TEXT      ('genre_poll' | 'quiz')
  title           TEXT
  options         TEXT      (JSON array of strings)
  correctOption   INTEGER   (nullable, quiz only — index into options)
  durationSeconds INTEGER
  startedAt       DATETIME
  endedAt         DATETIME  (nullable)
  status          TEXT      ('active' | 'revealing' | 'ended')

EngagementVote
  id              TEXT PK
  engagementEventId TEXT → EngagementEvent.id
  optionIndex     INTEGER
  voterToken      TEXT
  createdAt       DATETIME
  UNIQUE(engagementEventId, voterToken)
```

---

## Environment Variables Reference

```
SPOTIFY_CLIENT_ID          # From Spotify Developer Dashboard
SPOTIFY_CLIENT_SECRET      # From Spotify Developer Dashboard
SPOTIFY_REDIRECT_URI       # e.g. https://yourdomain.com/auth/spotify/callback
SESSION_SECRET             # Random 32+ char string for cookie encryption
DATABASE_PATH              # Path to SQLite file, e.g. /data/db.sqlite
PUBLIC_BASE_URL            # Base URL for QR code generation, e.g. https://yourdomain.com
```

---

## Spotify API Scopes Required

```
playlist-modify-public
playlist-modify-private
user-read-private
user-read-email
```

---

## Notes & Decisions

- **SQLite WAL mode**: enable on DB connection open for concurrent read performance during SSE streaming
- **Spotify playlist sync**: debounce reorder calls (max once per 2s) to avoid rate limiting
- **SSE proxy config**: set `X-Accel-Buffering: no` header on the SSE response so Nginx/Traefik doesn't buffer the stream
- **Cookie fallback**: if `document.cookie` is empty after setting, fall back to fingerprint token stored in `localStorage`
- **Karaoke mode**: deferred to v2 — implement as a display-only `EngagementEvent` type with `type: 'announcement'`
- **Manual queue reorder**: DJ can drag songs in the dashboard; this sets an explicit `rank` override field on `QueueEntry`, takes precedence over vote count sort
