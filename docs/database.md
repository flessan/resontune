# Database

Primary store: **Neon Postgres** (`DATABASE_URL`). For zero-setup local
development the same schema runs on **PGlite** (embedded Postgres, WASM)
under `var/pglite`. The adapter (`server/db/index.ts`) exposes one
`query(text, params)` interface for both.

Schema: [`server/db/schema.sql`](../server/db/schema.sql) — idempotent,
applied on boot.

## Entities

```
users ─┬─ sessions
       ├─ playlists ── playlist_tracks ── tracks
       ├─ favorites ───────────────────── tracks
       ├─ play_history ────────────────── tracks
       └─ submissions ─(approval)──────── tracks

artists ─┬─ artist_links
         ├─ albums ── tracks
         └─ tracks ─┬─ track_sources     (provider/kind/url/storage)
                    ├─ lyrics
                    ├─ track_genres ── genres
                    └─ track_tags ──── tags

licenses ── tracks
community_picks ── tracks
play_events (anonymous, drives trending)
```

## Design decisions

- **No audio in Postgres.** `track_sources.url` points at externally managed
  bytes. The `storage` column (`manual-url | s3 | r2 | neon-object |
  external`) records how the bytes are managed so a migration to object
  storage is a column update + URL rewrite, not a schema change.
- **Multiple sources per track**, ranked by `priority` — a track can have a
  hosted stream *and* an external link fallback.
- **`play_events` vs `play_history`.** Events are anonymous and power
  trending; history is per-user and only written for signed-in listeners.
- **Moderation states** live on both `submissions.status`
  (`pending → reviewing → approved/rejected`) and `tracks.status`
  (`published/hidden/removed`), so takedowns don't destroy data.
- Indexes cover every list ordering used by the API (plays, released_on,
  lower(title) lookups, status+created_at queues).

## Migrating audio to object storage

1. Upload files to S3/R2/Neon Object Storage.
2. `UPDATE track_sources SET url = $cdnUrl, storage = 'r2' WHERE …`
3. Optionally keep the old URL as a second, lower-priority source during the
   transition.

The application code needs no changes — the HostedProvider plays whatever
direct URL it is given.
