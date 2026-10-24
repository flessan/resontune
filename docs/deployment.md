# Cloudflare Pages deployment

ResonTune is deployed as a **Cloudflare Pages project**, not a standalone Worker.
The Vite build produces `dist/`; the Pages Functions in `functions/api/` handle
same-origin `/api/*` requests. Pages' `_routes.json` is emitted in `dist/` so
API requests are never sent to the SPA fallback.

## Pages settings

* Build command: `npm run build`
* Build output directory: `dist`
* Production URL: `https://resontune.pages.dev`
* Functions: keep the repository-root `functions/` directory; Pages detects it
  automatically. No Worker deployment or separate backend is required.

Set these as **Pages → Settings → Environment variables** (Preview and
Production as appropriate):

| Variable | Scope | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | secret | Neon Postgres connection string |
| `NEON_AUTH_URL` | public-to-function | Neon Auth base URL |
| `NEON_AUTH_JWKS_URL` or `NEON_AUTH_JWKS_JSON` | public-to-function | JWKS used for cryptographic JWT verification |
| `ADMIN_USER_IDS` | secret | comma-separated ResonTune user IDs |
| `MODERATOR_USER_IDS` | secret | comma-separated ResonTune user IDs |
| `AUDIO_CDN_BASE` | public-to-function | CDN/object URL prefix for approved object keys |
| `NEON_API_KEY`, `NEON_PROJECT_ID`, `NEON_BRANCH_ID` | secrets | optional server-side Neon Auth identity deletion |
| `IMGBB_API_KEY` | secret | optional server-side avatar upload |
| `COMMUNITY_DISCORD_URL`, `COMMUNITY_TELEGRAM_URL`, `COMMUNITY_WHATSAPP_URL` | function | optional site config |
| `GITHUB_SPONSORS_URL`, `SOCIABUZZ_URL`, `QRIS_IMAGE_URL`, `REPO_URL` | function | optional support/about links |

`VITE_*` values are the only values embedded in the browser bundle. Do not
prefix any secret with `VITE_`. `VITE_NEON_AUTH_URL` is only the public Auth
endpoint used by the sign-in client.

## Authentication and authorization

Pages Functions verify bearer JWTs with `jose` and Web Crypto against Neon
Auth JWKS, checking the EdDSA signature, issuer, expiry and `sub`. The
verified subject is looked up in `users.auth_subject`; roles come from the
server-side database and the admin/moderator allowlists. A role in a request
or in the browser is never trusted. Invalid credentials are anonymous for
public reads and receive JSON `401` responses on protected routes.

## Database and migrations

Neon Postgres is the only production database. Do not use PGlite in Pages
Functions. Apply the checked-in SQL migrations from a machine with the Neon
`DATABASE_URL` before or during a release:

```bash
DATABASE_URL='postgres://...' NODE_ENV=production npm start
```

The Node server's migration runner is intentionally separate from the Pages
runtime: it reads `server/db/migrations` using Node filesystem APIs. Pages
Functions never read the deployment filesystem. Local development may omit
`DATABASE_URL` and use PGlite (`npm run dev:server`); production must provide
Neon.

## Local development

Run the frontend and existing Node API in two terminals:

```bash
npm install
npm run dev:server   # API on 8787, PGlite unless DATABASE_URL is set
npm run dev          # Vite on 5173; /api and /media proxy to 8787
```

Pages-specific routing can be exercised with the Cloudflare Pages tooling
available in the deployment environment. The Functions use standard
`Request`/`Response`, `fetch`, Web Crypto and the Neon serverless driver; they
do not import Express, Node `fs`, Node `path`, or process startup code.

## Media, deletion, and rate limits

`/media/audio` is a development-only Node filesystem endpoint. Production
playback resolves approved catalog sources or object keys and returns a direct
media URL; it does not proxy arbitrary URLs or large audio files. Direct media
hosts must support browser range requests. Audio is never stored in Neon.

Account deletion remains server-only and uses the existing tombstone and
transaction flow. If configured, the Neon administrative deletion call uses
`fetch` and `NEON_API_KEY`; it is never exposed to the browser. ImgBB keys are
also server-only and only URLs/provider metadata are stored.

The Node adapter's in-memory Express limiter is not used by Pages Functions:
Cloudflare edge/WAF limits should be enabled for production, while every
mutation still has authentication, authorization, bounded validation and
resource limits. A fake process-local distributed limiter is deliberately not
claimed.

Unknown `/api/*` paths return JSON `{ "error": "Not found." }` with 404;
there is no HTML fallback for API failures. Frontend routes continue to use
Vite's SPA build fallback.
