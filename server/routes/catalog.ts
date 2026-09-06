/**
 * Public catalog + discovery routes. Everything here works without an
 * account — listening comes first.
 */
import { Router } from 'express';
import { getDb, uuid } from '../db/index.ts';
import { asyncRoute, pagination, HttpError } from '../util/http.ts';

/* ------------------------------ serialization ----------------------------- */

const TRACK_SELECT = `
  t.id, t.slug, t.title, t.track_no, t.duration_seconds, t.artwork_url,
  t.description, t.rights_holder, t.credits, t.play_count, t.like_count,
  t.created_at, t.source_type, t.attribution_text, t.territory,
  a.id AS artist_id, a.slug AS artist_slug, a.name AS artist_name,
  al.id AS album_id, al.slug AS album_slug, al.title AS album_title,
  al.artwork_url AS album_artwork,
  l.id AS license_id, l.name AS license_name, l.url AS license_url,
  l.requires_attribution AS license_attribution
`;

const TRACK_FROM = `
  FROM tracks t
  JOIN artists a ON a.id = t.artist_id
  LEFT JOIN albums al ON al.id = t.album_id
  LEFT JOIN licenses l ON l.id = t.license_id
`;

interface TrackRow {
  id: string; slug: string; title: string; track_no: number | null;
  duration_seconds: number | null; artwork_url: string | null;
  description: string | null; rights_holder: string | null; credits: string | null;
  play_count: string | number; like_count: string | number; created_at: string;
  source_type: 'original' | 'community' | 'external';
  attribution_text: string | null; territory: string | null;
  artist_id: string; artist_slug: string; artist_name: string;
  album_id: string | null; album_slug: string | null; album_title: string | null;
  album_artwork: string | null;
  license_id: string | null; license_name: string | null; license_url: string | null;
  license_attribution: boolean | null;
}

export function serializeTrack(row: TrackRow, extra?: Record<string, unknown>) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    trackNo: row.track_no,
    duration: row.duration_seconds,
    artworkUrl: row.artwork_url ?? row.album_artwork,
    description: row.description,
    rightsHolder: row.rights_holder,
    credits: row.credits,
    playCount: Number(row.play_count),
    likeCount: Number(row.like_count),
    createdAt: row.created_at,
    sourceType: row.source_type,
    attributionText: row.attribution_text,
    territory: row.territory,
    artist: { id: row.artist_id, slug: row.artist_slug, name: row.artist_name },
    album: row.album_id
      ? { id: row.album_id, slug: row.album_slug, title: row.album_title, artworkUrl: row.album_artwork }
      : null,
    license: row.license_id
      ? {
          id: row.license_id,
          name: row.license_name,
          url: row.license_url,
          requiresAttribution: row.license_attribution,
        }
      : null,
    ...extra,
  };
}

export async function loadTrackExtras(trackIds: string[]) {
  const db = await getDb();
  if (!trackIds.length) return { sources: new Map(), genres: new Map(), tags: new Map() };
  const [sources, genres, tags] = await Promise.all([
    // NOTE: the raw url column is deliberately not selected — the client
    // resolves playback through GET /api/play/:trackId, never from here.
    db.query<{ track_id: string; provider: string; kind: string; mime_type: string | null; source_type: string; availability: string; priority: number }>(
      `SELECT track_id, provider, kind, mime_type, source_type, availability, priority
         FROM track_sources WHERE track_id = ANY($1) ORDER BY priority`,
      [trackIds],
    ),
    db.query<{ track_id: string; id: string; name: string }>(
      `SELECT tg.track_id, g.id, g.name FROM track_genres tg JOIN genres g ON g.id = tg.genre_id
        WHERE tg.track_id = ANY($1)`,
      [trackIds],
    ),
    db.query<{ track_id: string; id: string; name: string }>(
      `SELECT tt.track_id, tg.id, tg.name FROM track_tags tt JOIN tags tg ON tg.id = tt.tag_id
        WHERE tt.track_id = ANY($1)`,
      [trackIds],
    ),
  ]);
  const group = <T extends { track_id: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) {
      const list = m.get(r.track_id) ?? [];
      list.push(r);
      m.set(r.track_id, list);
    }
    return m;
  };
  return { sources: group(sources), genres: group(genres), tags: group(tags) };
}

export function withExtras(rows: TrackRow[], extras: Awaited<ReturnType<typeof loadTrackExtras>>) {
  return rows.map((row) =>
    serializeTrack(row, {
      sources: (extras.sources.get(row.id) ?? []).map((s: any) => ({
        provider: s.provider, kind: s.kind, mimeType: s.mime_type,
        sourceType: s.source_type, availability: s.availability,
      })),
      genres: (extras.genres.get(row.id) ?? []).map((g: any) => ({ id: g.id, name: g.name })),
      tags: (extras.tags.get(row.id) ?? []).map((t: any) => ({ id: t.id, name: t.name })),
    }),
  );
}

export async function queryTracks(
  where: string,
  params: unknown[],
  orderLimit: string,
  opts: { includeUnlisted?: boolean } = {},
) {
  const db = await getDb();
  const statusClause = opts.includeUnlisted
    ? `t.status IN ('published','unlisted')`
    : `t.status = 'published'`;
  const rows = await db.query<TrackRow>(
    `SELECT ${TRACK_SELECT} ${TRACK_FROM} WHERE ${statusClause} ${where} ${orderLimit}`,
    params,
  );
  const extras = await loadTrackExtras(rows.map((r) => r.id));
  return withExtras(rows, extras);
}

/* --------------------------------- routes --------------------------------- */

export function catalogRouter(): Router {
  const r = Router();

  /** Home feed: every section is deterministic and explained. */
  r.get(
    '/home',
    asyncRoute(async (_req, res) => {
      const db = await getDb();
      const [trending, newReleases, risingRows, picksRows, featuredRows, originals, collections] = await Promise.all([
        // Trending = plays in the last 14 days (falls back to all-time below)
        queryTracks(
          `AND t.id IN (
             SELECT track_id FROM play_events
              WHERE played_at > now() - interval '14 days'
              GROUP BY track_id ORDER BY count(*) DESC LIMIT 12)`,
          [],
          `ORDER BY t.play_count DESC LIMIT 12`,
        ),
        db.query(
          `SELECT al.id, al.slug, al.title, al.type, al.artwork_url, al.released_on, al.source_type,
                  a.name AS artist_name, a.slug AS artist_slug,
                  (SELECT count(*) FROM tracks tr WHERE tr.album_id = al.id AND tr.status='published') AS track_count
             FROM albums al JOIN artists a ON a.id = al.artist_id
            WHERE al.status = 'published'
            ORDER BY al.released_on DESC NULLS LAST LIMIT 8`,
        ),
        // Rising artists = artists whose recent plays outpace their catalog size
        db.query(
          `SELECT a.id, a.slug, a.name, a.image_url, a.location,
                  COALESCE(sum(t.play_count), 0) AS plays,
                  count(t.id) AS track_count
             FROM artists a LEFT JOIN tracks t ON t.artist_id = a.id AND t.status='published'
            GROUP BY a.id
            ORDER BY (COALESCE(sum(t.play_count),0) + 1)::float / (count(t.id) + 2) DESC, a.created_at DESC
            LIMIT 6`,
        ),
        db.query<{ track_id: string; note: string | null }>(
          `SELECT track_id, note FROM community_picks ORDER BY created_at DESC LIMIT 8`,
        ),
        // Featured release = most recent published Originals release
        db.query(
          `SELECT al.id, al.slug, al.title, al.type, al.artwork_url, al.released_on,
                  al.description, al.catalog_no, a.name AS artist_name, a.slug AS artist_slug,
                  (SELECT count(*) FROM tracks tr WHERE tr.album_id = al.id AND tr.status='published') AS track_count
             FROM albums al JOIN artists a ON a.id = al.artist_id
            WHERE al.source_type = 'original' AND al.status = 'published'
            ORDER BY al.released_on DESC NULLS LAST LIMIT 1`,
        ),
        queryTracks(
          `AND t.source_type = 'original'`, [],
          `ORDER BY t.play_count DESC LIMIT 8`,
        ),
        db.query(
          `SELECT c.id, c.slug, c.title, c.description, c.artwork_url, c.curator_name,
                  (SELECT count(*) FROM collection_items ci WHERE ci.collection_id = c.id) AS item_count
             FROM collections c WHERE c.status = 'published'
            ORDER BY c.updated_at DESC LIMIT 6`,
        ),
      ]);

      let trendingOut = trending;
      if (!trendingOut.length) {
        trendingOut = await queryTracks('', [], `ORDER BY t.play_count DESC, t.created_at DESC LIMIT 12`);
      }

      const pickIds = picksRows.map((p: any) => p.track_id);
      const picks = pickIds.length
        ? await queryTracks(`AND t.id = ANY($1)`, [pickIds], '')
        : [];
      const noteMap = new Map(picksRows.map((p: any) => [p.track_id, p.note]));

      const feat: any = featuredRows[0];
      res.json({
        featuredRelease: feat
          ? {
              id: feat.id, slug: feat.slug, title: feat.title, type: feat.type,
              artworkUrl: feat.artwork_url, releasedOn: feat.released_on,
              description: feat.description, catalogNo: feat.catalog_no,
              trackCount: Number(feat.track_count), sourceType: 'original',
              artist: { name: feat.artist_name, slug: feat.artist_slug },
            }
          : null,
        originals,
        collections: collections.map((c: any) => ({
          id: c.id, slug: c.slug, title: c.title, description: c.description,
          artworkUrl: c.artwork_url, curatorName: c.curator_name, itemCount: Number(c.item_count),
        })),
        trending: trendingOut,
        newReleases: newReleases.map((al: any) => ({
          id: al.id, slug: al.slug, title: al.title, type: al.type,
          artworkUrl: al.artwork_url, releasedOn: al.released_on,
          trackCount: Number(al.track_count), sourceType: al.source_type,
          artist: { name: al.artist_name, slug: al.artist_slug },
        })),
        risingArtists: risingRows.map((a: any) => ({
          id: a.id, slug: a.slug, name: a.name, imageUrl: a.image_url,
          location: a.location, plays: Number(a.plays), trackCount: Number(a.track_count),
        })),
        communityPicks: picks.map((t: any) => ({ ...t, pickNote: noteMap.get(t.id) ?? null })),
      });
    }),
  );

  r.get(
    '/tracks',
    asyncRoute(async (req, res) => {
      const { limit, offset } = pagination(req);
      const genre = typeof req.query.genre === 'string' ? req.query.genre : null;
      const tag = typeof req.query.tag === 'string' ? req.query.tag : null;
      const source =
        req.query.source === 'original' || req.query.source === 'community'
          ? String(req.query.source)
          : null;
      const sort = req.query.sort === 'plays' ? 't.play_count DESC' : 't.created_at DESC';
      let where = '';
      const params: unknown[] = [];
      if (source) {
        params.push(source);
        where += ` AND t.source_type = $${params.length}`;
      }
      if (genre) {
        params.push(genre);
        where += ` AND t.id IN (SELECT track_id FROM track_genres WHERE genre_id = $${params.length})`;
      }
      if (tag) {
        params.push(tag);
        where += ` AND t.id IN (SELECT track_id FROM track_tags WHERE tag_id = $${params.length})`;
      }
      params.push(limit, offset);
      const tracks = await queryTracks(
        where, params, `ORDER BY ${sort} LIMIT $${params.length - 1} OFFSET $${params.length}`,
      );
      res.json({ tracks, limit, offset });
    }),
  );

  r.get(
    '/tracks/:slug',
    asyncRoute(async (req, res) => {
      const slug = String(req.params.slug);
      const tracks = await queryTracks(`AND t.slug = $1`, [slug], `LIMIT 1`);
      const track = tracks[0];
      if (!track) throw new HttpError(404, 'Track not found.');
      const db = await getDb();
      const [lyrics, related, moreFromArtist] = await Promise.all([
        db.query<{ body: string; kind: string }>(`SELECT body, kind FROM lyrics WHERE track_id = $1`, [track.id]),
        // Related = shares a genre, not the same artist, ordered by plays
        queryTracks(
          `AND t.id <> $1 AND t.artist_id <> $2 AND t.id IN (
             SELECT track_id FROM track_genres WHERE genre_id IN (
               SELECT genre_id FROM track_genres WHERE track_id = $1))`,
          [track.id, track.artist.id],
          `ORDER BY t.play_count DESC LIMIT 6`,
        ),
        queryTracks(
          `AND t.artist_id = $1 AND t.id <> $2`,
          [track.artist.id, track.id],
          `ORDER BY t.play_count DESC LIMIT 6`,
        ),
      ]);
      res.json({
        track: { ...track, lyrics: lyrics[0] ?? null },
        related,
        moreFromArtist,
      });
    }),
  );

  /** Record an anonymous play event (rate-limited by middleware). */
  r.post(
    '/tracks/:id/play',
    asyncRoute(async (req, res) => {
      const id = String(req.params.id);
      if (!/^[0-9a-f-]{36}$/.test(id)) throw new HttpError(400, 'Bad track id.');
      const db = await getDb();
      const found = await db.query(`SELECT 1 FROM tracks WHERE id = $1 AND status = 'published'`, [id]);
      if (!found.length) throw new HttpError(404, 'Track not found.');
      await db.query(`UPDATE tracks SET play_count = play_count + 1 WHERE id = $1`, [id]);
      await db.query(`INSERT INTO play_events (id, track_id) VALUES ($1, $2)`, [uuid(), id]);
      if (req.user) {
        await db.query(
          `INSERT INTO play_history (id, user_id, track_id) VALUES ($1, $2, $3)`,
          [uuid(), req.user.id, id],
        );
      }
      res.json({ ok: true });
    }),
  );

  r.get(
    '/artists',
    asyncRoute(async (req, res) => {
      const { limit, offset } = pagination(req);
      const db = await getDb();
      const source =
        req.query.source === 'original' || req.query.source === 'community'
          ? String(req.query.source)
          : null;
      const params: unknown[] = [];
      let where = '';
      if (source) {
        params.push(source);
        where = `WHERE a.source_type = $${params.length}`;
      }
      params.push(limit, offset);
      const rows = await db.query(
        `SELECT a.id, a.slug, a.name, a.bio, a.image_url, a.location, a.source_type,
                COALESCE(sum(t.play_count), 0) AS plays, count(t.id) AS track_count
           FROM artists a LEFT JOIN tracks t ON t.artist_id = a.id AND t.status='published'
          ${where}
          GROUP BY a.id ORDER BY plays DESC, a.name LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );
      res.json({
        artists: rows.map((a: any) => ({
          id: a.id, slug: a.slug, name: a.name, bio: a.bio, imageUrl: a.image_url,
          location: a.location, sourceType: a.source_type,
          plays: Number(a.plays), trackCount: Number(a.track_count),
        })),
      });
    }),
  );

  r.get(
    '/artists/:slug',
    asyncRoute(async (req, res) => {
      const db = await getDb();
      const rows = await db.query(
        `SELECT id, slug, name, bio, image_url, location, source_type, created_at
           FROM artists WHERE slug = $1`,
        [String(req.params.slug)],
      );
      const artist: any = rows[0];
      if (!artist) throw new HttpError(404, 'Artist not found.');
      const [links, albums, popular, genres] = await Promise.all([
        db.query(`SELECT kind, label, url FROM artist_links WHERE artist_id = $1`, [artist.id]),
        db.query(
          `SELECT al.id, al.slug, al.title, al.type, al.artwork_url, al.released_on, al.catalog_no,
                  (SELECT count(*) FROM tracks t WHERE t.album_id = al.id AND t.status='published') AS track_count
             FROM albums al WHERE al.artist_id = $1 AND al.status = 'published'
            ORDER BY al.released_on DESC NULLS LAST`,
          [artist.id],
        ),
        queryTracks(`AND t.artist_id = $1`, [artist.id], `ORDER BY t.play_count DESC LIMIT 10`),
        db.query(
          `SELECT DISTINCT g.id, g.name FROM genres g
             JOIN track_genres tg ON tg.genre_id = g.id
             JOIN tracks t ON t.id = tg.track_id
            WHERE t.artist_id = $1`,
          [artist.id],
        ),
      ]);
      res.json({
        artist: {
          id: artist.id, slug: artist.slug, name: artist.name, bio: artist.bio,
          imageUrl: artist.image_url, location: artist.location,
          sourceType: artist.source_type, createdAt: artist.created_at,
          links: links.map((l: any) => ({ kind: l.kind, label: l.label, url: l.url })),
          genres: genres.map((g: any) => ({ id: g.id, name: g.name })),
        },
        albums: albums.map((al: any) => ({
          id: al.id, slug: al.slug, title: al.title, type: al.type,
          artworkUrl: al.artwork_url, releasedOn: al.released_on,
          catalogNo: al.catalog_no, trackCount: Number(al.track_count),
        })),
        popularTracks: popular,
      });
    }),
  );

  r.get(
    '/albums',
    asyncRoute(async (req, res) => {
      const { limit, offset } = pagination(req);
      const db = await getDb();
      const rows = await db.query(
        `SELECT al.id, al.slug, al.title, al.type, al.artwork_url, al.released_on, al.description,
                al.source_type, al.catalog_no, a.name AS artist_name, a.slug AS artist_slug,
                (SELECT count(*) FROM tracks t WHERE t.album_id = al.id AND t.status='published') AS track_count
           FROM albums al JOIN artists a ON a.id = al.artist_id
          WHERE al.status = 'published'
          ORDER BY al.released_on DESC NULLS LAST LIMIT $1 OFFSET $2`,
        [limit, offset],
      );
      res.json({
        albums: rows.map((al: any) => ({
          id: al.id, slug: al.slug, title: al.title, type: al.type,
          artworkUrl: al.artwork_url, releasedOn: al.released_on, description: al.description,
          sourceType: al.source_type, catalogNo: al.catalog_no,
          trackCount: Number(al.track_count),
          artist: { name: al.artist_name, slug: al.artist_slug },
        })),
      });
    }),
  );

  r.get(
    '/albums/:slug',
    asyncRoute(async (req, res) => {
      const db = await getDb();
      const rows = await db.query(
        `SELECT al.*, a.name AS artist_name, a.slug AS artist_slug
           FROM albums al JOIN artists a ON a.id = al.artist_id WHERE al.slug = $1`,
        [String(req.params.slug)],
      );
      const album: any = rows[0];
      if (!album) throw new HttpError(404, 'Album not found.');
      if (album.status === 'taken_down' || album.status === 'archived') {
        throw new HttpError(404, 'Album not found.');
      }
      const tracks = await queryTracks(
        `AND t.album_id = $1`, [album.id], `ORDER BY t.track_no NULLS LAST, t.title`,
      );
      res.json({
        album: {
          id: album.id, slug: album.slug, title: album.title, type: album.type,
          artworkUrl: album.artwork_url, releasedOn: album.released_on,
          description: album.description, sourceType: album.source_type,
          catalogNo: album.catalog_no,
          artist: { name: album.artist_name, slug: album.artist_slug },
        },
        tracks,
      });
    }),
  );

  r.get(
    '/genres',
    asyncRoute(async (_req, res) => {
      const db = await getDb();
      const rows = await db.query(
        `SELECT g.id, g.name, count(tg.track_id) AS track_count
           FROM genres g LEFT JOIN track_genres tg ON tg.genre_id = g.id
          GROUP BY g.id ORDER BY track_count DESC, g.name`,
      );
      res.json({ genres: rows.map((g: any) => ({ id: g.id, name: g.name, trackCount: Number(g.track_count) })) });
    }),
  );

  r.get(
    '/tags',
    asyncRoute(async (_req, res) => {
      const db = await getDb();
      const rows = await db.query(
        `SELECT tg.id, tg.name, count(tt.track_id) AS track_count
           FROM tags tg LEFT JOIN track_tags tt ON tt.tag_id = tg.id
          GROUP BY tg.id ORDER BY track_count DESC, tg.name`,
      );
      res.json({ tags: rows.map((t: any) => ({ id: t.id, name: t.name, trackCount: Number(t.track_count) })) });
    }),
  );

  r.get(
    '/search',
    asyncRoute(async (req, res) => {
      const q = String(req.query.q ?? '').trim().slice(0, 80);
      if (q.length < 2) return void res.json({ tracks: [], artists: [], albums: [], playlists: [] });
      const like = `%${q.toLowerCase().replace(/[%_]/g, '')}%`;
      const db = await getDb();
      const [tracks, artists, albums, playlists] = await Promise.all([
        queryTracks(
          `AND (lower(t.title) LIKE $1 OR lower(a.name) LIKE $1)`, [like],
          `ORDER BY t.play_count DESC LIMIT 12`,
        ),
        db.query(
          `SELECT id, slug, name, image_url, location FROM artists
            WHERE lower(name) LIKE $1 ORDER BY name LIMIT 6`,
          [like],
        ),
        db.query(
          `SELECT al.id, al.slug, al.title, al.type, al.artwork_url, a.name AS artist_name, a.slug AS artist_slug
             FROM albums al JOIN artists a ON a.id = al.artist_id
            WHERE lower(al.title) LIKE $1 ORDER BY al.released_on DESC NULLS LAST LIMIT 6`,
          [like],
        ),
        db.query(
          `SELECT p.id, p.slug, p.title, p.description, p.like_count,
                  u.handle AS owner_handle,
                  (SELECT count(*) FROM playlist_tracks pt WHERE pt.playlist_id = p.id) AS track_count
             FROM playlists p LEFT JOIN users u ON u.id = p.owner_id
            WHERE p.is_public AND lower(p.title) LIKE $1 LIMIT 6`,
          [like],
        ),
      ]);
      res.json({
        tracks,
        artists: artists.map((a: any) => ({
          id: a.id, slug: a.slug, name: a.name, imageUrl: a.image_url, location: a.location,
        })),
        albums: albums.map((al: any) => ({
          id: al.id, slug: al.slug, title: al.title, type: al.type, artworkUrl: al.artwork_url,
          artist: { name: al.artist_name, slug: al.artist_slug },
        })),
        playlists: playlists.map((p: any) => ({
          id: p.id, slug: p.slug, title: p.title, description: p.description,
          likeCount: Number(p.like_count), trackCount: Number(p.track_count),
          ownerHandle: p.owner_handle,
        })),
      });
    }),
  );

  /** ResonTune Originals overview: releases + artists + top tracks. */
  r.get(
    '/originals',
    asyncRoute(async (_req, res) => {
      const db = await getDb();
      const [releases, artists, topTracks] = await Promise.all([
        db.query(
          `SELECT al.id, al.slug, al.title, al.type, al.artwork_url, al.released_on,
                  al.description, al.catalog_no, a.name AS artist_name, a.slug AS artist_slug,
                  (SELECT count(*) FROM tracks t WHERE t.album_id = al.id AND t.status='published') AS track_count
             FROM albums al JOIN artists a ON a.id = al.artist_id
            WHERE al.source_type = 'original' AND al.status = 'published'
            ORDER BY al.released_on DESC NULLS LAST`,
        ),
        db.query(
          `SELECT a.id, a.slug, a.name, a.bio, a.image_url, a.location,
                  COALESCE(sum(t.play_count),0) AS plays, count(t.id) AS track_count
             FROM artists a LEFT JOIN tracks t ON t.artist_id = a.id AND t.status='published'
            WHERE a.source_type = 'original'
            GROUP BY a.id ORDER BY plays DESC`,
        ),
        queryTracks(`AND t.source_type = 'original'`, [], `ORDER BY t.play_count DESC LIMIT 10`),
      ]);
      res.setHeader('Cache-Control', 'public, max-age=30');
      res.json({
        releases: releases.map((al: any) => ({
          id: al.id, slug: al.slug, title: al.title, type: al.type,
          artworkUrl: al.artwork_url, releasedOn: al.released_on,
          description: al.description, catalogNo: al.catalog_no,
          trackCount: Number(al.track_count),
          artist: { name: al.artist_name, slug: al.artist_slug },
        })),
        artists: artists.map((a: any) => ({
          id: a.id, slug: a.slug, name: a.name, bio: a.bio, imageUrl: a.image_url,
          location: a.location, plays: Number(a.plays), trackCount: Number(a.track_count),
        })),
        topTracks,
      });
    }),
  );

  /** Community catalog overview: published community releases + latest tracks. */
  r.get(
    '/community',
    asyncRoute(async (_req, res) => {
      const db = await getDb();
      const [releases, artists, latest, picksRows] = await Promise.all([
        db.query(
          `SELECT al.id, al.slug, al.title, al.type, al.artwork_url, al.released_on, al.description,
                  a.name AS artist_name, a.slug AS artist_slug,
                  (SELECT count(*) FROM tracks t WHERE t.album_id = al.id AND t.status='published') AS track_count
             FROM albums al JOIN artists a ON a.id = al.artist_id
            WHERE al.source_type = 'community' AND al.status = 'published'
            ORDER BY al.released_on DESC NULLS LAST LIMIT 24`,
        ),
        db.query(
          `SELECT a.id, a.slug, a.name, a.bio, a.image_url, a.location,
                  COALESCE(sum(t.play_count),0) AS plays, count(t.id) AS track_count
             FROM artists a LEFT JOIN tracks t ON t.artist_id = a.id AND t.status='published'
            WHERE a.source_type = 'community'
            GROUP BY a.id ORDER BY plays DESC LIMIT 12`,
        ),
        queryTracks(`AND t.source_type = 'community'`, [], `ORDER BY t.created_at DESC LIMIT 12`),
        db.query<{ track_id: string; note: string | null }>(
          `SELECT track_id, note FROM community_picks ORDER BY created_at DESC LIMIT 6`,
        ),
      ]);
      const pickIds = picksRows.map((p: any) => p.track_id);
      const picks = pickIds.length ? await queryTracks(`AND t.id = ANY($1)`, [pickIds], '') : [];
      const noteMap = new Map(picksRows.map((p: any) => [p.track_id, p.note]));
      res.setHeader('Cache-Control', 'public, max-age=30');
      res.json({
        releases: releases.map((al: any) => ({
          id: al.id, slug: al.slug, title: al.title, type: al.type,
          artworkUrl: al.artwork_url, releasedOn: al.released_on, description: al.description,
          trackCount: Number(al.track_count),
          artist: { name: al.artist_name, slug: al.artist_slug },
        })),
        artists: artists.map((a: any) => ({
          id: a.id, slug: a.slug, name: a.name, bio: a.bio, imageUrl: a.image_url,
          location: a.location, plays: Number(a.plays), trackCount: Number(a.track_count),
        })),
        latestTracks: latest,
        picks: picks.map((t: any) => ({ ...t, pickNote: noteMap.get(t.id) ?? null })),
      });
    }),
  );

  /** Published editorial collections. */
  r.get(
    '/collections',
    asyncRoute(async (_req, res) => {
      const db = await getDb();
      const rows = await db.query(
        `SELECT c.id, c.slug, c.title, c.description, c.artwork_url, c.curator_name, c.updated_at,
                (SELECT count(*) FROM collection_items ci WHERE ci.collection_id = c.id) AS item_count
           FROM collections c WHERE c.status = 'published'
          ORDER BY c.updated_at DESC LIMIT 50`,
      );
      res.setHeader('Cache-Control', 'public, max-age=30');
      res.json({
        collections: rows.map((c: any) => ({
          id: c.id, slug: c.slug, title: c.title, description: c.description,
          artworkUrl: c.artwork_url, curatorName: c.curator_name,
          itemCount: Number(c.item_count), updatedAt: c.updated_at,
        })),
      });
    }),
  );

  /** A collection with its ordered mixed items (tracks, albums, artists). */
  r.get(
    '/collections/:slug',
    asyncRoute(async (req, res) => {
      const db = await getDb();
      const rows = await db.query(
        `SELECT id, slug, title, description, artwork_url, curator_name, status, updated_at
           FROM collections WHERE slug = $1`,
        [String(req.params.slug)],
      );
      const col: any = rows[0];
      if (!col || col.status !== 'published') throw new HttpError(404, 'Collection not found.');
      const items = await db.query<{ position: number; item_kind: string; item_id: string; note: string | null }>(
        `SELECT position, item_kind, item_id, note FROM collection_items
          WHERE collection_id = $1 ORDER BY position`,
        [col.id],
      );
      const trackIds = items.filter((i) => i.item_kind === 'track').map((i) => i.item_id);
      const albumIds = items.filter((i) => i.item_kind === 'album').map((i) => i.item_id);
      const artistIds = items.filter((i) => i.item_kind === 'artist').map((i) => i.item_id);
      const [tracks, albums, artists] = await Promise.all([
        trackIds.length ? queryTracks(`AND t.id = ANY($1)`, [trackIds], '') : Promise.resolve([]),
        albumIds.length
          ? db.query(
              `SELECT al.id, al.slug, al.title, al.type, al.artwork_url, al.released_on, al.source_type,
                      a.name AS artist_name, a.slug AS artist_slug,
                      (SELECT count(*) FROM tracks t WHERE t.album_id = al.id AND t.status='published') AS track_count
                 FROM albums al JOIN artists a ON a.id = al.artist_id
                WHERE al.id = ANY($1) AND al.status = 'published'`,
              [albumIds],
            )
          : Promise.resolve([]),
        artistIds.length
          ? db.query(
              `SELECT id, slug, name, bio, image_url, location, source_type FROM artists WHERE id = ANY($1)`,
              [artistIds],
            )
          : Promise.resolve([]),
      ]);
      const trackMap = new Map(tracks.map((t: any) => [t.id, t]));
      const albumMap = new Map(
        albums.map((al: any) => [
          al.id,
          {
            id: al.id, slug: al.slug, title: al.title, type: al.type,
            artworkUrl: al.artwork_url, releasedOn: al.released_on,
            sourceType: al.source_type, trackCount: Number(al.track_count),
            artist: { name: al.artist_name, slug: al.artist_slug },
          },
        ]),
      );
      const artistMap = new Map(
        artists.map((a: any) => [
          a.id,
          { id: a.id, slug: a.slug, name: a.name, bio: a.bio, imageUrl: a.image_url, location: a.location, sourceType: a.source_type },
        ]),
      );
      res.setHeader('Cache-Control', 'public, max-age=30');
      res.json({
        collection: {
          id: col.id, slug: col.slug, title: col.title, description: col.description,
          artworkUrl: col.artwork_url, curatorName: col.curator_name, updatedAt: col.updated_at,
        },
        items: items
          .map((i) => ({
            kind: i.item_kind,
            note: i.note,
            track: i.item_kind === 'track' ? trackMap.get(i.item_id) ?? null : undefined,
            album: i.item_kind === 'album' ? albumMap.get(i.item_id) ?? null : undefined,
            artist: i.item_kind === 'artist' ? artistMap.get(i.item_id) ?? null : undefined,
          }))
          .filter((i) => i.track || i.album || i.artist),
      });
    }),
  );

  /**
   * Radio: a deterministic continuous queue, no AI involved.
   * station = originals | community | all | genre:<id> | artist:<slug> | track:<slug>
   * Selection = seeded shuffle over eligible published tracks, weighted
   * toward play_count, deterministic for a given (station, seed) so the
   * client can page through the same station queue.
   */
  r.get(
    '/radio',
    asyncRoute(async (req, res) => {
      const station = String(req.query.station ?? 'all').slice(0, 80);
      const seedParam = Number.parseInt(String(req.query.seed ?? ''), 10);
      const seed = Number.isFinite(seedParam) ? Math.abs(seedParam) % 1_000_000 : Math.floor(Math.random() * 1_000_000);
      const db = await getDb();

      let where = '';
      const params: unknown[] = [];
      let label = 'ResonTune Radio';
      if (station === 'originals') {
        where = `AND t.source_type = 'original'`;
        label = 'Originals Radio';
      } else if (station === 'community') {
        where = `AND t.source_type = 'community'`;
        label = 'Community Radio';
      } else if (station.startsWith('genre:')) {
        const genreId = station.slice(6).slice(0, 40);
        params.push(genreId);
        where = `AND t.id IN (SELECT track_id FROM track_genres WHERE genre_id = $${params.length})`;
        const g = await db.query<{ name: string }>(`SELECT name FROM genres WHERE id = $1`, [genreId]);
        label = g[0] ? `${g[0].name} Radio` : 'Genre Radio';
      } else if (station.startsWith('artist:')) {
        const slug = station.slice(7).slice(0, 64);
        const a = await db.query<{ id: string; name: string }>(`SELECT id, name FROM artists WHERE slug = $1`, [slug]);
        if (!a[0]) throw new HttpError(404, 'Artist not found.');
        // Artist radio = the artist plus tracks sharing any of their genres.
        params.push(a[0].id);
        where = `AND (t.artist_id = $${params.length} OR t.id IN (
                   SELECT tg2.track_id FROM track_genres tg2 WHERE tg2.genre_id IN (
                     SELECT tg.genre_id FROM track_genres tg JOIN tracks tr ON tr.id = tg.track_id
                      WHERE tr.artist_id = $${params.length})))`;
        label = `${a[0].name} Radio`;
      } else if (station.startsWith('track:')) {
        const slug = station.slice(6).slice(0, 80);
        const t0 = await db.query<{ id: string; title: string }>(`SELECT id, title FROM tracks WHERE slug = $1`, [slug]);
        if (!t0[0]) throw new HttpError(404, 'Track not found.');
        params.push(t0[0].id);
        where = `AND (t.id = $${params.length} OR t.id IN (
                   SELECT tg2.track_id FROM track_genres tg2 WHERE tg2.genre_id IN (
                     SELECT genre_id FROM track_genres WHERE track_id = $${params.length})))`;
        label = `Radio from “${t0[0].title}”`;
      }

      // Deterministic per-seed shuffle: hash the track id with the seed.
      // md5 is available in both Postgres and PGlite; weight by log(plays).
      params.push(String(seed));
      const tracks = await queryTracks(
        where,
        params,
        `ORDER BY ('x' || substr(md5(t.id::text || $${params.length}), 1, 8))::bit(32)::int::float
                  / 2147483647.0 - ln(t.play_count + 2) / 40.0
         LIMIT 30`,
      );
      res.json({ station, label, seed, tracks });
    }),
  );

  return r;
}
