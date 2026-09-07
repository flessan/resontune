# Express ↔ Cloudflare Pages route parity audit

Audited against the route registrations in `server/routes/**`,
`server/routes/admin/**`, `server/auth.ts`, and frontend calls under `src/**`.
The Pages adapter is `functions/api/[[path]].ts`; `functions/api/health.ts`
handles the dedicated health route. All Pages errors use JSON and unknown
`/api/*` paths use JSON 404s.

## Route matrix

| Express route(s) | Pages status | Notes |
|---|---|---|
| `GET /api/health` | **exact parity** | Dedicated Pages handler, JSON 200. |
| `GET /api/auth/me` | **exact parity** | Anonymous and verified sessions use the same envelope. |
| `GET /api/home` | **nearly matching** | Same feed keys; Pages avoids Express-only cache middleware. |
| `GET /api/tracks`, `GET /api/tracks/:slug`, `POST /api/tracks/:id/play` | **nearly matching** | Public entity serialization, links/lyrics, and play history are covered; Pages uses Web APIs. |
| `GET /api/artists`, `GET /api/artists/:slug` | **nearly matching** | Links, genres, albums and tracks are returned; cache headers differ intentionally. |
| `GET /api/albums`, `GET /api/albums/:slug` | **nearly matching** | Links, related tracks and artist metadata are returned. |
| `GET /api/genres`, `GET /api/tags`, `GET /api/search` | **nearly matching** | Search returns all four result groups. Pagination is bounded. |
| `GET /api/originals`, `GET /api/community` | **nearly matching** | Real catalog queries; no fake fallback records. |
| `GET /api/collections`, `GET /api/collections/:slug` | **nearly matching** | Mixed collection items are resolved from published records. |
| `GET /api/radio` | **intentional runtime-specific difference** | Deterministic SQL-backed station resolver; no AI/provider dependency. |
| `GET /api/play/:trackId` | **nearly matching** | Enforces publication, permissions and approved source selection; returns direct media URL and does not proxy. |
| `GET /api/users/:username` | **nearly matching** | Public profile fields and playlists are returned without auth internals. |
| `GET /api/site/config`, `PUT /api/site/config/support` | **nearly matching** | Pages reads/writes the same `site_settings` record; validation is Web API based. |
| `/api/playlists/public`, `/api/playlists/mine`, `/api/playlists/:slug` | **nearly matching** | Public/owned visibility and ordering are enforced. |
| `POST/PATCH/DELETE /api/playlists`, `/:id` | **nearly matching** | Owner/admin checks and bounded mutations are enforced. |
| `POST/DELETE /api/playlists/:id/tracks/:trackId` | **nearly matching** | Track membership and owner checks are enforced. |
| `PUT /api/playlists/:id/order` | **nearly matching** | Position updates are applied in request order. |
| `POST /api/playlists/:id/duplicate` | **nearly matching** | Duplicates playlist metadata and ordered tracks. |
| `POST /api/playlists/:id/like` | **nearly matching** | Authenticated toggle and counter update. |
| `/api/me`, `/api/me/profile`, `/api/me/username-available` | **nearly matching** | Own-row authorization; external profile links persist in `entity_links`. |
| `/api/me/favorites*`, `/api/me/history` | **nearly matching** | Uses the same favorites and `play_history` tables. |
| `/api/me/avatar` | **nearly matching** | Server-only ImgBB upload, size, MIME and magic-byte checks. |
| `/api/me/export` | **nearly matching** | Server-generated export; no auth provider secrets are included. |
| `DELETE /api/me` | **nearly matching** | Neon transaction, counter cleanup, cascades, tombstone and optional control-plane deletion. Live Neon verification remains pending. |
| `/api/admin/overview`, `/licenses`, `/users/search` | **nearly matching** | Moderator reads and admin mutations are checked server-side. |
| `/api/admin/artists/*`, `/api/admin/releases/*`, `/api/admin/tracks/*` | **nearly matching** | Nested links, counts, sources, genres, licenses and relations are serialized by Pages. |
| `/api/moderation/tracks`, `/takedowns`, `/tracks/:id/state` | **nearly matching** | Moderator access and takedown audit writes are enforced. |

## Runtime/security differences

- The Node adapter retains its Express per-process limiter for local/server
  deployments. Pages does not claim that limiter is distributed. Production
  edge/WAF rate limiting must be configured at the Pages/Cloudflare layer;
  SQL validation, authorization, bounded pagination and upload limits remain
  application-enforced.
- The Pages adapter uses `Request`, `Response`, `fetch`, Web Crypto and Neon’s
  serverless driver. It does not import Express, Node filesystem modules,
  PGlite, or the migration runner.
- Migrations remain a Node/operator operation against the checked-in SQL files;
  Pages Functions never read the deployment filesystem.
- Live Neon integration verification is pending because no test Neon
  credentials/environment are available in this execution environment.
- Production verification is pending when TLS/network access to
  `https://resontune.pages.dev` is available.
