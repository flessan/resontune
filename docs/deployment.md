# Deployment

## Build & run

```bash
npm install
npm run seed:audio          # optional: launch-catalog audio (CC0, generated)
npm run build               # client → dist/
NODE_ENV=production npm start
```

`npm start` runs `server/index.ts`, which serves `/api`, `/media` and the
built client on `API_PORT` (default 8787). One process, one port — deployable
on any Node host (Render, Railway, Fly.io, a VPS…).

## Environment

See [.env.example](../.env.example):

| Var | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon Postgres. Unset → embedded PGlite (dev only) |
| `API_PORT` / `PORT` | listen port |
| `APP_ORIGIN` | public origin, used for OAuth callbacks |
| `GITHUB_CLIENT_ID/SECRET` | GitHub OAuth (optional) |
| `ALLOW_DEV_LOGIN` | keep dev sign-in when OAuth is configured (dev only; always off in production unless explicitly true) |
| `ADMIN_USER_IDS` / `MODERATOR_USER_IDS` | comma-separated user ids granted roles server-side — the only way to bootstrap the first production admin |
| `AUDIO_CDN_BASE` | base URL for hosted-audio object keys (default `/media/audio`) |
| `GITHUB_SPONSORS_URL` / `SOCIABUZZ_URL` / `QRIS_IMAGE_URL` | support-page links (all optional; admin-editable at runtime via `PUT /api/site/config/support`, which overrides env) |
| `REPO_URL` | public repository URL used on About/Contribute/footer (default `https://github.com/flessan/resontune`) |

Secrets live only in server env. The client bundle contains none.

## Roles in production

"First account becomes admin" is a development-only convenience and is
disabled under `NODE_ENV=production`. To bootstrap moderation in
production: deploy, sign in once (GitHub OAuth), read your user id from the
`users` table (or `/api/auth/me`), set `ADMIN_USER_IDS=<that id>`, restart.
Environment role grants override the `users.role` column and are evaluated
per request on the server; nothing client-side is ever trusted.

## Database

Point `DATABASE_URL` at a Neon project. The schema applies itself on boot
(idempotent `IF NOT EXISTS` DDL). Seeding only happens when the tracks table
is empty, so a production database is never overwritten.

## Audio storage

Development serves the generated launch-catalog audio from `media/audio`
with HTTP Range support. Hosted sources are stored as **object keys**;
the playback resolver (`GET /api/play/:trackId`) prefixes them with
`AUDIO_CDN_BASE`. Moving audio to object storage (S3, Cloudflare R2, Neon
Object Storage) is therefore: upload the files, set `AUDIO_CDN_BASE` to the
bucket/CDN origin, done — no schema or client changes. Do not serve large
audio through the Node process at scale.

## Abuse resistance checklist

Already built in:

- per-IP rate limits (general 300/min, writes 40/min, sign-in 25/15min)
- submission cooldown (60s) + pending cap (5)
- zod validation on every mutation; bounded JSON bodies (64 kB)
- pagination bounds on every list endpoint (max 60/100 rows)
- `Cache-Control` on public catalog reads → CDN/Cloudflare can absorb reads
- `trust proxy` enabled for real client IPs behind Cloudflare/WAF
- opaque httpOnly session cookies (Secure in production, SameSite=Lax)
- media-URL validation on submissions (`server/util/urlSafety.ts`): https
  only, no embedded credentials, no private/reserved IPs, no
  internal-looking hostnames; the server never auto-fetches submitted URLs
  (moderators preview in their own browser), so there is no SSRF fetch path
- duplicate-submission guard (same audio URL can't be resubmitted)
- takedown/permission enforcement centralized in `GET /api/play/:trackId`

Recommended in front of the app:

- Cloudflare (or equivalent) with WAF + bot management on `/api/*`
- cache everything under `/media/*` and `/artwork/*` at the edge
- turn on Neon connection pooling for serverless deployments

## PWA

`public/sw.js` caches the app shell and last-seen catalog responses
(network-first), never caches `/api/auth` or `/api/me`, and deliberately does
not cache `/media/*` audio — offline remote playback is only appropriate
when a source's licensing permits it. Local music works offline by nature
(IndexedDB).
