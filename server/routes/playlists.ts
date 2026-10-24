/**
 * Playlists: public browsing without auth; creation/editing with auth.
 */
import { Router } from 'express';
import { z } from 'zod';
import { getDb, uuid, slugify } from '../db/index.ts';
import { asyncRoute, pagination, HttpError } from '../util/http.ts';
import { requireAuth } from '../auth.ts';
import { queryTracks } from './catalog.ts';

const UUID_RE = /^[0-9a-f-]{36}$/;

async function serializePlaylist(p: any) {
  const db = await getDb();
  const count = await db.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM playlist_tracks WHERE playlist_id = $1`, [p.id],
  );
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    description: p.description,
    isPublic: p.is_public,
    isCurated: p.is_curated,
    likeCount: Number(p.like_count ?? 0),
    trackCount: Number(count[0]?.n ?? 0),
    ownerHandle: p.owner_handle ?? null,
    ownerId: p.owner_id ?? null,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };
}

export function playlistsRouter(): Router {
  const r = Router();

  /* -------- public -------- */

  r.get(
    '/public',
    asyncRoute(async (req, res) => {
      const { limit, offset } = pagination(req);
      const db = await getDb();
      const rows = await db.query(
        `SELECT p.*, u.handle AS owner_handle FROM playlists p
           LEFT JOIN users u ON u.id = p.owner_id
          WHERE p.is_public ORDER BY p.is_curated DESC, p.like_count DESC, p.updated_at DESC
          LIMIT $1 OFFSET $2`,
        [limit, offset],
      );
      res.json({ playlists: await Promise.all(rows.map(serializePlaylist)) });
    }),
  );

  r.get(
    '/mine',
    requireAuth,
    asyncRoute(async (req, res) => {
      const db = await getDb();
      const rows = await db.query(
        `SELECT p.*, u.handle AS owner_handle FROM playlists p
           LEFT JOIN users u ON u.id = p.owner_id
          WHERE p.owner_id = $1 ORDER BY p.updated_at DESC LIMIT 200`,
        [req.user!.id],
      );
      res.json({ playlists: await Promise.all(rows.map(serializePlaylist)) });
    }),
  );

  r.get(
    '/:slug',
    asyncRoute(async (req, res) => {
      const db = await getDb();
      const rows = await db.query(
        `SELECT p.*, u.handle AS owner_handle FROM playlists p
           LEFT JOIN users u ON u.id = p.owner_id WHERE p.slug = $1`,
        [String(req.params.slug)],
      );
      const p: any = rows[0];
      if (!p) throw new HttpError(404, 'Playlist not found.');
      if (!p.is_public && (!req.user || req.user.id !== p.owner_id)) {
        throw new HttpError(404, 'Playlist not found.');
      }
      const tracks = await queryTracks(
        `AND t.id IN (SELECT track_id FROM playlist_tracks WHERE playlist_id = $1)`,
        [p.id],
        '',
      );
      const order = await db.query<{ track_id: string; position: number }>(
        `SELECT track_id, position FROM playlist_tracks WHERE playlist_id = $1 ORDER BY position`,
        [p.id],
      );
      const byId = new Map(tracks.map((t: any) => [t.id, t]));
      const ordered = order.map((o) => byId.get(o.track_id)).filter(Boolean);
      res.json({ playlist: await serializePlaylist(p), tracks: ordered });
    }),
  );

  /* -------- authenticated management -------- */

  const createSchema = z.object({
    title: z.string().trim().min(1).max(80),
    description: z.string().trim().max(400).optional(),
    isPublic: z.boolean().optional(),
  });

  r.post(
    '/',
    requireAuth,
    asyncRoute(async (req, res) => {
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid playlist.');
      const db = await getDb();
      const owned = await db.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM playlists WHERE owner_id = $1`, [req.user!.id],
      );
      if (Number(owned[0]?.n ?? 0) >= 200) throw new HttpError(429, 'Playlist limit reached.');
      const id = uuid();
      const slug = `${slugify(parsed.data.title)}-${id.slice(0, 6)}`;
      const rows = await db.query(
        `INSERT INTO playlists (id, slug, owner_id, title, description, is_public)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [id, slug, req.user!.id, parsed.data.title, parsed.data.description ?? null, parsed.data.isPublic ?? false],
      );
      res.status(201).json({ playlist: await serializePlaylist({ ...(rows[0] as any), owner_handle: req.user!.handle }) });
    }),
  );

  async function ownedPlaylist(req: any, id: string) {
    if (!UUID_RE.test(id)) throw new HttpError(400, 'Bad playlist id.');
    const db = await getDb();
    const rows = await db.query(`SELECT * FROM playlists WHERE id = $1`, [id]);
    const p: any = rows[0];
    if (!p) throw new HttpError(404, 'Playlist not found.');
    if (p.owner_id !== req.user.id && req.user.role !== 'admin') {
      throw new HttpError(403, 'Not your playlist.');
    }
    return p;
  }

  const updateSchema = z.object({
    title: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(400).nullable().optional(),
    isPublic: z.boolean().optional(),
  });

  r.patch(
    '/:id',
    requireAuth,
    asyncRoute(async (req, res) => {
      const p = await ownedPlaylist(req, String(req.params.id));
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, 'Invalid update.');
      const db = await getDb();
      const d = parsed.data;
      const rows = await db.query(
        `UPDATE playlists SET
           title = COALESCE($2, title),
           description = CASE WHEN $3::boolean THEN $4 ELSE description END,
           is_public = COALESCE($5, is_public),
           updated_at = now()
         WHERE id = $1 RETURNING *`,
        [p.id, d.title ?? null, d.description !== undefined, d.description ?? null, d.isPublic ?? null],
      );
      res.json({ playlist: await serializePlaylist(rows[0]) });
    }),
  );

  r.delete(
    '/:id',
    requireAuth,
    asyncRoute(async (req, res) => {
      const p = await ownedPlaylist(req, String(req.params.id));
      const db = await getDb();
      await db.query(`DELETE FROM playlists WHERE id = $1`, [p.id]);
      res.json({ ok: true });
    }),
  );

  r.post(
    '/:id/tracks',
    requireAuth,
    asyncRoute(async (req, res) => {
      const p = await ownedPlaylist(req, String(req.params.id));
      const trackId = String(req.body?.trackId ?? '');
      if (!UUID_RE.test(trackId)) throw new HttpError(400, 'Bad track id.');
      const db = await getDb();
      const track = await db.query(`SELECT 1 FROM tracks WHERE id = $1 AND status='published'`, [trackId]);
      if (!track.length) throw new HttpError(404, 'Track not found.');
      const count = await db.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM playlist_tracks WHERE playlist_id = $1`, [p.id],
      );
      if (Number(count[0]?.n ?? 0) >= 1000) throw new HttpError(429, 'Playlist is full (1000 tracks).');
      await db.query(
        `INSERT INTO playlist_tracks (playlist_id, track_id, position)
         VALUES ($1, $2, (SELECT COALESCE(max(position), -1) + 1 FROM playlist_tracks WHERE playlist_id = $1))
         ON CONFLICT DO NOTHING`,
        [p.id, trackId],
      );
      await db.query(`UPDATE playlists SET updated_at = now() WHERE id = $1`, [p.id]);
      res.json({ ok: true });
    }),
  );

  r.delete(
    '/:id/tracks/:trackId',
    requireAuth,
    asyncRoute(async (req, res) => {
      const p = await ownedPlaylist(req, String(req.params.id));
      const trackId = String(req.params.trackId);
      if (!UUID_RE.test(trackId)) throw new HttpError(400, 'Bad track id.');
      const db = await getDb();
      await db.query(`DELETE FROM playlist_tracks WHERE playlist_id = $1 AND track_id = $2`, [p.id, trackId]);
      await db.query(`UPDATE playlists SET updated_at = now() WHERE id = $1`, [p.id]);
      res.json({ ok: true });
    }),
  );

  const reorderSchema = z.object({ trackIds: z.array(z.string().regex(UUID_RE)).max(1000) });

  r.put(
    '/:id/order',
    requireAuth,
    asyncRoute(async (req, res) => {
      const p = await ownedPlaylist(req, String(req.params.id));
      const parsed = reorderSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, 'Invalid order payload.');
      const db = await getDb();
      for (let i = 0; i < parsed.data.trackIds.length; i++) {
        await db.query(
          `UPDATE playlist_tracks SET position = $3 WHERE playlist_id = $1 AND track_id = $2`,
          [p.id, parsed.data.trackIds[i], i],
        );
      }
      await db.query(`UPDATE playlists SET updated_at = now() WHERE id = $1`, [p.id]);
      res.json({ ok: true });
    }),
  );

  r.post(
    '/:id/duplicate',
    requireAuth,
    asyncRoute(async (req, res) => {
      const id = String(req.params.id);
      if (!UUID_RE.test(id)) throw new HttpError(400, 'Bad playlist id.');
      const db = await getDb();
      const rows = await db.query(`SELECT * FROM playlists WHERE id = $1`, [id]);
      const src: any = rows[0];
      if (!src) throw new HttpError(404, 'Playlist not found.');
      if (!src.is_public && src.owner_id !== req.user!.id) throw new HttpError(404, 'Playlist not found.');
      const newId = uuid();
      const slug = `${slugify(src.title)}-${newId.slice(0, 6)}`;
      const created = await db.query(
        `INSERT INTO playlists (id, slug, owner_id, title, description, is_public)
         VALUES ($1, $2, $3, $4, $5, false) RETURNING *`,
        [newId, slug, req.user!.id, `${src.title} (copy)`, src.description],
      );
      await db.query(
        `INSERT INTO playlist_tracks (playlist_id, track_id, position)
         SELECT $1, track_id, position FROM playlist_tracks WHERE playlist_id = $2`,
        [newId, src.id],
      );
      res.status(201).json({ playlist: await serializePlaylist({ ...(created[0] as any), owner_handle: req.user!.handle }) });
    }),
  );

  r.post(
    '/:id/like',
    requireAuth,
    asyncRoute(async (req, res) => {
      const id = String(req.params.id);
      if (!UUID_RE.test(id)) throw new HttpError(400, 'Bad playlist id.');
      const db = await getDb();
      const rows = await db.query(`SELECT id, is_public FROM playlists WHERE id = $1`, [id]);
      const p: any = rows[0];
      if (!p || !p.is_public) throw new HttpError(404, 'Playlist not found.');
      const existing = await db.query(
        `SELECT 1 FROM playlist_likes WHERE playlist_id = $1 AND user_id = $2`, [id, req.user!.id],
      );
      if (existing.length) {
        await db.query(`DELETE FROM playlist_likes WHERE playlist_id = $1 AND user_id = $2`, [id, req.user!.id]);
        await db.query(`UPDATE playlists SET like_count = greatest(like_count - 1, 0) WHERE id = $1`, [id]);
        res.json({ liked: false });
      } else {
        await db.query(`INSERT INTO playlist_likes (playlist_id, user_id) VALUES ($1, $2)`, [id, req.user!.id]);
        await db.query(`UPDATE playlists SET like_count = like_count + 1 WHERE id = $1`, [id]);
        res.json({ liked: true });
      }
    }),
  );

  return r;
}
