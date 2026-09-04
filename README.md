# telegrup

File host that stores everything in Telegram (via a real user account, not a
bot — that's what allows up to ~4GB per file), streams video straight back
out with HTTP range support (seeking doesn't require downloading the whole
file first), and lets you hand a friend a working link — a watch page, a
direct file link, or an embeddable HLS stream — without giving them an
account.

## Stack

- Next.js (App Router, TypeScript) — dashboard UI + API routes in one app
- PostgreSQL + Prisma (driver adapter, `@prisma/adapter-pg`) — file/account/folder/key metadata
- GramJS (`telegram` npm package) — MTProto client, one connection pooled per
  Telegram account
- JW Player 8 (OSS, archived upstream, CC BY-NC-SA 3.0 — non-commercial use
  only) — the video player, built from source into `public/jwplayer/`
- ffmpeg — auto-thumbnail extraction and HLS remuxing

## One-time setup

1. Get Telegram API credentials at https://my.telegram.org/apps (this is
   `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` — required for *any* account login,
   separate from the account's own phone/password).
2. `cp .env.example .env` and fill it in — see the comments in that file for
   what each variable is and how to generate the secrets. Nothing has an
   insecure built-in default; the app and `docker compose` both refuse to
   start with something missing.
3. `docker compose up -d --build` — runs Postgres + the app (ffmpeg baked in,
   `prisma migrate deploy` runs automatically on boot). Or for local dev
   without Docker: `docker compose up -d postgres`, `npm install`,
   `npm run db:migrate`, `npm run dev`.
4. Seed the site's single login:
   `ADMIN_USERNAME=you ADMIN_PASSWORD=... npm run db:seed`
5. Open the app, log in, then add a Telegram account from the **Accounts**
   page (phone number → code → 2FA password if enabled).

## Dashboard

- **Files** (`/`) — drag-and-drop or multi-select upload (2 files upload to
  Telegram at a time, the rest queue), folder filter, per-file thumbnail
  snap-from-video or upload-your-own-photo, before upload or afterward from
  the player.
- **Accounts** (`/accounts`) — add/remove Telegram accounts, toggle
  Premium (~4GB cap) vs free (~2GB cap) — files bigger than the cap are
  transparently split into parts and reassembled on stream/download.
- **API Keys** (`/keys`) — mint/revoke keys with a role (read / upload /
  full) for scripted access; see **API Docs** (`/docs`) in the app for every
  endpoint and curl examples.
- File page (`/files/:id`) — JW Player with a rewind/forward-10 control pair,
  rename, move to folder, delete, `.vtt` caption upload, and the share panel.

## Sharing (no account needed on the other end)

Generating a share link (file page → "Get share link") gives out, depending
on file kind:

- **Watch page** (video only) — `/watch/:id/:token`, a plain page with the
  player on it. This is the one to actually send a friend.
- **Direct file link** (any kind) — `/api/public/:id/:token`, the same
  range-streamed bytes the logged-in player uses, just token-gated instead of
  cookie-gated. Works as a raw download link or an `<img>`/`<video>` src
  elsewhere.
- **Thumbnail image link** — `/thumbnails/:id.jpg`, always public (it's a
  static file under `public/`, no token at all), once a thumbnail exists.
- **HLS embed** — `/api/hls/:fileId/:token/master.m3u8`, for embedding in
  another site's own player (see *Notable mechanics* below); optionally
  locked to a list of allowed embedding hosts (checked against
  `Origin`/`Referer`).

Rotating or revoking invalidates every one of these at once (they all share
the same per-file token).

## Notable mechanics

- **Upload**: raw request body (not multipart) streamed straight to disk,
  never buffered fully in memory — that's what makes multi-GB uploads work.
  Split parts upload with GramJS's own multi-connection workers *and*
  multiple parts in flight at once (`PART_UPLOAD_CONCURRENCY` /
  `UPLOAD_WORKERS_PER_PART` in `.env`).
- **Streaming**: `GET /api/stream/:id` (logged in) and
  `GET /api/public/:fileId/:token` (share link) both honor `Range`, pulling
  only the requested bytes from Telegram via `iterDownload` — no full
  download for a seek, even across split parts.
- **HLS**: `GET /api/hls/:fileId/:token/master.m3u8` is built purely from the
  file's stored duration — no Telegram/ffmpeg work at all, instant regardless
  of file size. Each *segment* (`segNNNNN.ts`) is generated independently on
  first request, against an internal-only range-streaming route gated by a
  process-local secret. If the source is already h264/aac (the common case
  for uploaded mp4s), ffmpeg just remuxes it (`-c copy` with
  `h264_mp4toannexb`/`aac_adtstoasc` bitstream filters — mp4 stores those
  codecs' framing out-of-band, mpegts needs it in-stream, which is what the
  filters convert on the fly) instead of paying for a real-time `libx264`
  encode; anything else falls back to re-encoding. `HLS_MAX_CONCURRENT_JOBS`
  caps simultaneous generations app-wide; `HLS_SEGMENT_TIMEOUT_MS` kills a
  stuck one; ffprobe's own codec check is capped (`probesize`/
  `analyzeduration`) and time-limited so a source with metadata at the end of
  the file can't stall a request. Segments cache on disk (`HLS_CACHE_*` —
  size-capped + idle-evicted, not permanent storage).
- **HLS test player**: `hls-test-player.html` at the repo root — a
  standalone page (hls.js) for watching real segment-load events, buffered
  ranges, and bytes fetched while seeking. Serve it locally
  (`python3 -m http.server 8765`) and paste in an `hlsUrl` to try it.
- **API keys**: separate auth layer from the login cookie, three roles
  (read / upload / full), scoped to the file/folder management API only —
  Telegram account login and streaming keep their own auth.

Full endpoint reference (methods, required role, curl examples) lives at
`/docs` in the running app.

## Production notes

- **Put a TLS-terminating reverse proxy in front.** The session cookie is
  marked `Secure` whenever `NODE_ENV=production` (which the Docker image
  always sets) — over plain HTTP the browser will never send it back, so
  login will appear to work but never actually persist. The app itself only
  speaks plain HTTP on `:3000`.
- **Single instance only.** HLS segment caching, the login rate limiter, and
  live upload-progress tracking are all in-process memory, not shared
  storage — don't run more than one replica behind a load balancer, or each
  request could land on an instance with none of that state.
- The container drops root before running the app (`docker-entrypoint.sh`
  chowns the volume mount points, then runs everything else as the image's
  built-in non-root `node` user) and has a Docker `HEALTHCHECK` wired up.
- The server validates required env vars (`AUTH_SECRET`,
  `SESSION_ENCRYPTION_KEY`, `TELEGRAM_API_ID`/`HASH`, `DATABASE_URL`) at boot
  (`src/instrumentation.ts`) and refuses to start rather than 500ing on the
  first real request.
- `X-Forwarded-For` (used for login rate-limiting) is only trustworthy behind
  a reverse proxy that sets it itself — see the comment in
  `src/lib/loginRateLimit.ts` if you're exposing the app any other way.

### Redeploying

- **Normal update** (pull latest code, keep data):
  ```bash
  git pull
  docker compose up -d --build app
  ```
- **Full clean redeploy** (also wipes Postgres + all volumes — every file
  record, share token, Telegram account, and API key is gone; the files
  themselves stay on Telegram but you lose the DB rows that point to them):
  ```bash
  git pull
  docker compose down -v
  docker system prune -af --volumes   # also drop dangling images/layers + unused build cache
  docker compose build --no-cache app
  docker compose up -d
  docker compose logs -f app   # confirm migrations run clean, then Ctrl+C
  ```
  `docker system prune -af --volumes` removes *every* stopped container,
  unused image, and unused volume on the host, not just this project's — safe
  on a VPS dedicated to this app, risky if anything else runs there.
  Re-link Telegram accounts and re-seed the login (`npm run db:seed`, see
  *One-time setup* above) afterward — a volume wipe removes those too.
