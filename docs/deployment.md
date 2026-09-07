# Deployment

## Build & run

```bash
npm install
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
| `NEON_AUTH_URL` | Neon Auth base URL (…/neondb/auth) — the single authentication authority |
| `NEON_AUTH_JWKS_URL` | optional override; defaults to `{NEON_AUTH_URL}/.well-known/jwks.json` |
| `NEON_AUTH_JWKS_JSON` | optional inline JWKS (public keys) to pin keys / skip the fetch |
| `VITE_NEON_AUTH_URL` | same base URL for the client bundle (public by design) |
| `NEON_API_KEY` | **server-side only, optional.** Neon control-plane key that lets account deletion also delete the Neon Auth identity. Use a project-scoped key. Unset → the browser attempts the deletion instead and the UI reports the real outcome |
| `NEON_PROJECT_ID` / `NEON_BRANCH_ID` | the project and the branch Neon Auth runs on; both required alongside `NEON_API_KEY` |
| `NEON_API_BASE` | override the control-plane base URL (default `https://console.neon.tech/api/v2`); exists for testing |
| `IDENTITY_TOMBSTONE_HOURS` | how long a deleted identity stays revoked in `deleted_identities` (default 24). Set it above your token lifetime |
| `COMMUNITY_DISCORD_URL` / `COMMUNITY_TELEGRAM_URL` / `COMMUNITY_WHATSAPP_URL` | Release-music channel links (optional; admin-editable at runtime) |
| `ADMIN_USER_IDS` / `MODERATOR_USER_IDS` | comma-separated user ids granted roles server-side — the only way to bootstrap the first production admin |
| `IMGBB_API_KEY` | **server-side only.** Enables member profile-photo upload (browser → API → ImgBB → stored URL). Unset → uploads answer 503 and avatars fall back to initials. Never expose it to the client; catalog audio/artwork never use it |
| `AUDIO_CDN_BASE` | base URL for hosted-audio object keys (default `/media/audio`) |
| `ALLOW_LOCAL_MEDIA_URLS` | dev only: `1` permits `http://localhost` media/link URLs. Leave unset everywhere else — it is the single exception in the SSRF-safe URL validator |
| `GITHUB_SPONSORS_URL` / `SOCIABUZZ_URL` / `QRIS_IMAGE_URL` | support-page links (all optional; admin-editable at runtime via `PUT /api/site/config/support`, which overrides env) |
| `REPO_URL` | public repository URL used on About/Contribute/footer (default `https://github.com/flessan/resontune`) |

Secrets live only in server env. The client bundle contains none — only
`VITE_`-prefixed values reach the browser, and the sole one is the public
Neon Auth base URL. `IMGBB_API_KEY` in particular must never be given a
`VITE_` prefix: verify with `grep -r IMGBB dist/` after a build (expected:
no matches).

## Authentication (Neon Auth)

Neon Auth is the single authentication authority. Enable Auth on your Neon
project, copy the Base URL into `NEON_AUTH_URL` + `VITE_NEON_AUTH_URL`, and
the app's sign-in dialog works against it directly. The API verifies every
bearer token cryptographically against the JWKS (EdDSA signatures, expiry,
issuer) — payloads are never trusted un-verified; invalid or expired tokens
are treated as anonymous. Identity providers (GitHub, Google, …) are
configured **inside Neon Auth**, not in this codebase. Without the env vars
the app runs fully anonymous: browsing, playback, radio and local music
never require an account.

## Identity deletion

Deleting an account is two systems, and the app never conflates them. The
ResonTune data always goes. The Neon Auth identity — email, password,
sessions — goes only if one of these is available:

1. **Server-side (recommended).** Set `NEON_API_KEY`, `NEON_PROJECT_ID` and
   `NEON_BRANCH_ID`. `DELETE /api/me` then calls the documented endpoint
   `DELETE /projects/{project_id}/branches/{branch_id}/auth/users/{auth_user_id}`
   and reports exactly what Neon answered. Provision the key **project-scoped**
   (org admin → *API keys* → scope to this project, or
   `neon api-keys create --project-id <id>`): such a key cannot reach other
   projects, create projects, or mint more keys. Rotate it like any other
   secret; it never reaches the browser, a response body or a log line. Neon
   documents the endpoint as beta and non-idempotent, so ResonTune calls it
   exactly once per deletion and never retries automatically.
2. **Browser-side.** Enable self-service deletion (`user.deleteUser`) on the
   Neon Auth project. The member's own session then authorizes
   `POST {NEON_AUTH_URL}/delete-user`. Depending on the project's settings
   this may send a confirmation email, in which case the UI says the identity
   still exists until the link is opened.
3. **Neither.** Everything still works; the closing dialog states that the
   ResonTune account is deleted, that the sign-in identity was *not* deleted,
   and where to remove it. Signing in again creates a new, empty account.

Verify the key never leaks into the bundle the same way as ImgBB:
`grep -r NEON_API dist/` → no matches (only `VITE_`-prefixed values are
inlined, and this one is not).

### Multi-instance deployments

Deletion writes a row to `deleted_identities` (migration `006`) in the same
transaction that removes the account: the provider subject plus a deletion
and an expiry timestamp, nothing about the person. Every instance reads that
table on the one path that could re-create an account, so a stale token is
refused everywhere, not just on the instance that handled the deletion. Rows
expire after `IDENTITY_TOMBSTONE_HOURS` and are swept by the next deletion,
so the table stays proportional to recent deletions. No Redis, no extra
service, and normal authenticated requests never read it.

## Roles in production

To bootstrap moderation: deploy, sign in once (Neon Auth), read your
ResonTune user id from the `users` table (or `/api/auth/me`), set
`ADMIN_USER_IDS=<that id>`, restart. Environment role grants override the
`users.role` column and are evaluated per request on the server; nothing
client-side is ever trusted.

## Database

Point `DATABASE_URL` at a Neon project. The schema applies itself on boot
(idempotent `IF NOT EXISTS` DDL + tracked migrations). The catalog starts
**empty** — there is no seeded music. Every surface has an honest empty
state, and the catalog grows as real music is published.

## Audio storage

Hosted audio in `media/audio` is served with HTTP Range support.
Hosted sources are stored as **object keys**;
the playback resolver (`GET /api/play/:trackId`) prefixes them with
`AUDIO_CDN_BASE`. Moving audio to object storage (S3, Cloudflare R2, Neon
Object Storage) is therefore: upload the files, set `AUDIO_CDN_BASE` to the
bucket/CDN origin, done — no schema or client changes. Do not serve large
audio through the Node process at scale.

## Abuse resistance checklist

Already built in:

- per-IP rate limits (general 300/min, writes 40/min on every non-GET)
- zod validation on every mutation; bounded JSON bodies (64 kB)
- pagination bounds on every list endpoint (max 60/100 rows)
- `Cache-Control` on public catalog reads → CDN/Cloudflare can absorb reads;
  `no-store` on `/api/auth`, `/api/me`, `/api/admin`, `/api/moderation`
- `trust proxy` enabled for real client IPs behind Cloudflare/WAF
- stateless bearer auth: Neon Auth JWTs verified against the JWKS
  (signature, issuer, expiry) — never an unsigned decode, no custom OAuth,
  no dev-login backdoor
- roles resolved server-side per request; `requireAdmin` on every catalog
  mutation and `requireModerator` on every admin read, independent of the UI
- media-URL validation (`server/util/urlSafety.ts`) on profile links,
  artist images, release artwork and track audio/artwork: https only, no
  embedded credentials, no private/reserved/loopback IPs, no IPv6 literals,
  no internal-looking hostnames. The server never fetches an
  administrator-supplied URL — previews happen in the admin's own browser —
  so there is no SSRF fetch path
- avatar upload bounded at 4 MB with declared-MIME *and* magic-byte checks
  before the image is forwarded to ImgBB; the API key stays server-side and
  no image bytes are stored
- unexpected server errors respond with a generic message (no stack or
  driver details leak to clients)
- takedown/permission enforcement centralized in `GET /api/play/:trackId`,
  which also refuses tracks whose artist or release has been withdrawn

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
