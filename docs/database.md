# Database

Primary store: **Neon Postgres** (`DATABASE_URL`). For zero-setup local
development the same schema runs on **PGlite** (embedded Postgres, WASM)
under `var/pglite`. The adapter (`server/db/index.ts`) exposes one
`query(text, params)` interface for both.

Schema: [`server/db/migrations/`](../server/db/migrations/) — plain SQL
files applied in filename order by the migration runner in
`server/db/index.ts` and tracked in `schema_migrations`. Dev (PGlite) and
production (Neon) run the exact same DDL. `001_init.sql` is the v1 schema;
`002_product_model.sql` adds provenance, content states, the rights model,
collections and moderation history.

## Entities

```
users ─┬─ playlists ── playlist_tracks ── tracks
       ├─ favorites ───────────────────── tracks
       └─ play_history ────────────────── tracks

artists ─┬─ artist_links
         ├─ albums ── tracks
         └─ tracks ─┬─ track_sources     (provider/kind/url/storage)
                    ├─ lyrics
                    ├─ track_genres ── genres
                    └─ track_tags ──── tags

licenses ── tracks
community_picks ── tracks
play_events (anonymous, drives trending)

collections ── collection_items ──(track|album|artist)
takedowns (content-state audit trail)
```

## Design decisions

- **No audio in Postgres.** `track_sources` points at externally managed
  bytes via `url` or `object_key`; `source_type`
  (`original_hosted | community_hosted | remote | external`) and `storage`
  record how the bytes are managed so a migration to object storage is a
  data update, not a schema change. Playback URLs are produced only by the
  server-side resolver (`GET /api/play/:trackId`).
- **Provenance** (`source_type = original | community | external`) lives on
  artists, albums and tracks — it is data, not styling.
- **Multiple sources per track**, ranked by `priority` — a track can have a
  hosted stream *and* an external link fallback.
- **`play_events` vs `play_history`.** Events are anonymous and power
  trending; history is per-user and only written for signed-in listeners.
- **Content state.** `tracks.status` / `albums.status`
  (`published | unlisted | taken_down | archived`) tracks catalog
  visibility. `takedowns` keeps the full audit history; takedowns never
  destroy data. There are no submission tables — music intake happens in
  external community channels.
- **Rights are columns, not vibes**: `rights_holder`, `license_id`,
  `attribution_text`, `distribution_permission`, `streaming_permission`,
  `territory`, `rights_notes` (see docs/catalog-model.md).
- Indexes cover every list ordering used by the API (plays, released_on,
  lower(title) lookups, status+created_at queues).

## Migrating audio to object storage

Hosted sources store an `object_key` (e.g. `night-bus.mp3`); the playback
resolver prefixes it with `AUDIO_CDN_BASE` (default `/media/audio`).

1. Upload files to S3/R2/Neon Object Storage.
2. Set `AUDIO_CDN_BASE=https://media.example/audio`.
3. Restart. No schema changes, no client changes — the resolver is the only
   place the mapping exists, and it can later mint signed URLs there too.

## Neon compatibility

The application cannot assume PGlite behavior. What we verify and how:

| Behavior | Status |
| --- | --- |
| DDL (`CREATE TABLE/INDEX IF NOT EXISTS`, `ALTER TABLE ADD COLUMN IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS`) | Standard Postgres 12+ DDL only; applied by the migration runner identically on both drivers |
| Parameterized queries | Every statement uses `$1…$n` placeholders through the shared `query()` interface; no driver-specific literals |
| Types | `UUID`, `TEXT`, `INTEGER`, `BOOLEAN`, `TIMESTAMPTZ`, `JSONB` only — all native on Neon |
| JSON | `payload JSONB` written via `JSON.stringify` param, read defensively (`typeof === 'string' ? JSON.parse : value`) because Neon's driver returns parsed objects while some paths return strings |
| Timestamps | Always `TIMESTAMPTZ` with `now()` defaults; serialized as ISO strings |
| Pagination | `LIMIT/OFFSET` with server-clamped bounds on every list endpoint |
| Expressions used | `count(*)`, `sum`, `COALESCE`, `ANY($1)` arrays, `ln()`, `md5()`, `::bit(32)::int` casts, `interval` arithmetic, `NULLS LAST` — all standard Postgres, exercised by the live API tests |
| Transactions | The write paths are single-statement or idempotent multi-statement (ON CONFLICT DO NOTHING); no PGlite-only transaction semantics are relied on |
| Connections | Neon driver is per-request HTTP (`neon(url).query`) — no pool assumptions; PGlite is single-connection, which is why dev tooling never opens a second process against `var/pglite` |
| Seeding | Runs only when `tracks` is empty; safe against a live production DB |

Production boot refuses to run without `DATABASE_URL`
(`NODE_ENV=production` + no URL → hard error), so the embedded database can
never silently ship to production. Full production validation (migrate →
migrate → start → run the API smoke suite against Neon) is the deploy
checklist in [deployment.md](deployment.md).
