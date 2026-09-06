# Deployment

## Build & run

```bash
npm install
npm run seed:audio          # optional: demo catalog audio (CC0, generated)
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
| `ALLOW_DEV_LOGIN` | keep dev sign-in when OAuth is configured (dev only) |

Secrets live only in server env. The client bundle contains none.

## Database

Point `DATABASE_URL` at a Neon project. The schema applies itself on boot
(idempotent `IF NOT EXISTS` DDL). Seeding only happens when the tracks table
is empty, so a production database is never overwritten.

## Audio storage

Development serves generated demo audio from `media/audio` with HTTP Range
support. In production, point `track_sources.url` at object storage or a CDN
(S3, Cloudflare R2, Neon Object Storage) — see
[database.md](database.md#migrating-audio-to-object-storage). Do not serve
large audio through the Node process at scale.

## Abuse resistance checklist

Already built in:

- per-IP rate limits (general 300/min, writes 40/min, sign-in 25/15min)
- submission cooldown (60s) + pending cap (5)
- zod validation on every mutation; bounded JSON bodies (64 kB)
- pagination bounds on every list endpoint (max 60/100 rows)
- `Cache-Control` on public catalog reads → CDN/Cloudflare can absorb reads
- `trust proxy` enabled for real client IPs behind Cloudflare/WAF
- opaque httpOnly session cookies (Secure in production, SameSite=Lax)

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
