# Radio

Radio is continuous listening without decisions — and without a recommender
system. A **station** is nothing more than a deterministic, server-built
queue fed into the ordinary player queue, so skip / shuffle / reorder /
repeat all work exactly like everywhere else.

## Stations

`GET /api/radio?station=<station>&seed=<n>`

| station | contents |
| --- | --- |
| `all` | everything published (ResonTune Radio) |
| `originals` | only `source_type = 'original'` (Originals Radio) |
| `community` | only `source_type = 'community'` (Community Radio) |
| `genre:<id>` | one genre (Genre Radio) |
| `artist:<slug>` | the artist's tracks plus tracks sharing any of their genres (Artist Radio) |
| `track:<slug>` | the seed track plus tracks sharing its genres |

## Selection

No AI, no profiling. Eligible tracks (published, playable) are ordered by a
**seeded hash shuffle weighted by popularity**:

```sql
ORDER BY ('x' || substr(md5(t.id::text || $seed), 1, 8))::bit(32)::int::float
         / 2147483647.0  -  ln(t.play_count + 2) / 40.0
```

- `md5(id || seed)` gives every track a stable pseudo-random rank for that
  seed — the same `(station, seed)` pair always returns the same queue
  (verified in tests), while a new seed reshuffles.
- Subtracting `ln(play_count)` gently floats popular tracks upward without
  letting them dominate.
- Works identically on Neon Postgres and PGlite (both provide `md5` and
  `bit(32)` casts).

The response is `{ station, label, seed, tracks[] }`; the client turns the
tracks into a normal queue. There is no live broadcasting, no server-side
listening session — deliberately.

## Empty and small catalogs

Stations never fabricate content. With zero eligible tracks the endpoint
returns an empty `tracks` array and the client shows an honest empty state;
with only a handful of tracks the station simply plays what exists. Queues
grow naturally as the real catalog grows.
