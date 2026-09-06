/**
 * Moderation queue. Moderators/admins review community submissions and
 * approve them into the catalog. Approval creates real artist/album/track/
 * source/lyrics rows — the submission payload is the single source of truth.
 */
import { Router } from 'express';
import { z } from 'zod';
import { getDb, uuid, slugify } from '../db/index.ts';
import { asyncRoute, HttpError } from '../util/http.ts';
import { requireModerator } from '../auth.ts';

export function moderationRouter(): Router {
  const r = Router();
  r.use(requireModerator);

  r.get(
    '/queue',
    asyncRoute(async (req, res) => {
      const status = ['pending', 'reviewing', 'approved', 'rejected'].includes(String(req.query.status))
        ? String(req.query.status)
        : 'pending';
      const db = await getDb();
      const rows = await db.query(
        `SELECT s.id, s.status, s.payload, s.moderator_note, s.created_at, s.reviewed_at,
                u.handle AS submitter_handle
           FROM submissions s LEFT JOIN users u ON u.id = s.submitter_id
          WHERE s.status = $1 ORDER BY s.created_at ASC LIMIT 100`,
        [status],
      );
      res.json({
        submissions: rows.map((s: any) => ({
          id: s.id,
          status: s.status,
          payload: typeof s.payload === 'string' ? JSON.parse(s.payload) : s.payload,
          moderatorNote: s.moderator_note,
          submitterHandle: s.submitter_handle,
          createdAt: s.created_at,
          reviewedAt: s.reviewed_at,
        })),
      });
    }),
  );

  const decisionSchema = z.object({
    action: z.enum(['reviewing', 'approve', 'reject']),
    note: z.string().trim().max(600).optional(),
  });

  r.post(
    '/queue/:id',
    asyncRoute(async (req, res) => {
      const id = String(req.params.id);
      if (!/^[0-9a-f-]{36}$/.test(id)) throw new HttpError(400, 'Bad submission id.');
      const parsed = decisionSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, 'Invalid decision.');
      const db = await getDb();
      const rows = await db.query(`SELECT * FROM submissions WHERE id = $1`, [id]);
      const sub: any = rows[0];
      if (!sub) throw new HttpError(404, 'Submission not found.');
      if (sub.status === 'approved') throw new HttpError(409, 'Already approved.');

      const { action, note } = parsed.data;

      if (action === 'reviewing') {
        await db.query(`UPDATE submissions SET status = 'reviewing' WHERE id = $1`, [id]);
        return void res.json({ status: 'reviewing' });
      }

      if (action === 'reject') {
        await db.query(
          `UPDATE submissions SET status = 'rejected', moderator_note = $2,
                  reviewed_by = $3, reviewed_at = now() WHERE id = $1`,
          [id, note ?? null, req.user!.id],
        );
        return void res.json({ status: 'rejected' });
      }

      /* approve → materialize catalog rows */
      const p = typeof sub.payload === 'string' ? JSON.parse(sub.payload) : sub.payload;

      // artist (find or create by name)
      let artistRows = await db.query<{ id: string }>(
        `SELECT id FROM artists WHERE lower(name) = lower($1)`, [p.artistName],
      );
      let artistId = artistRows[0]?.id;
      if (!artistId) {
        artistId = uuid();
        let slug = slugify(p.artistName);
        const clash = await db.query(`SELECT 1 FROM artists WHERE slug = $1`, [slug]);
        if (clash.length) slug = `${slug}-${artistId.slice(0, 6)}`;
        await db.query(
          `INSERT INTO artists (id, slug, name) VALUES ($1, $2, $3)`,
          [artistId, slug, p.artistName],
        );
      }

      // album (optional, find or create)
      let albumId: string | null = null;
      if (p.albumTitle) {
        const albumRows = await db.query<{ id: string }>(
          `SELECT id FROM albums WHERE artist_id = $1 AND lower(title) = lower($2)`,
          [artistId, p.albumTitle],
        );
        albumId = albumRows[0]?.id ?? null;
        if (!albumId) {
          albumId = uuid();
          let slug = slugify(`${p.artistName} ${p.albumTitle}`);
          const clash = await db.query(`SELECT 1 FROM albums WHERE slug = $1`, [slug]);
          if (clash.length) slug = `${slug}-${albumId.slice(0, 6)}`;
          await db.query(
            `INSERT INTO albums (id, slug, artist_id, title, artwork_url)
             VALUES ($1, $2, $3, $4, $5)`,
            [albumId, slug, artistId, p.albumTitle, p.artworkUrl || null],
          );
        }
      }

      // track
      const trackId = uuid();
      let trackSlug = slugify(`${p.artistName} ${p.trackTitle}`);
      const slugClash = await db.query(`SELECT 1 FROM tracks WHERE slug = $1`, [trackSlug]);
      if (slugClash.length) trackSlug = `${trackSlug}-${trackId.slice(0, 6)}`;
      await db.query(
        `INSERT INTO tracks (id, slug, title, artist_id, album_id, artwork_url, description,
                             license_id, rights_holder, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'published')`,
        [trackId, trackSlug, p.trackTitle, artistId, albumId,
         p.artworkUrl || null, p.description || null, p.licenseId, p.rightsHolder],
      );
      await db.query(
        `INSERT INTO track_sources (id, track_id, provider, kind, url, storage)
         VALUES ($1, $2, 'hosted', 'direct_url', $3, 'manual-url')`,
        [uuid(), trackId, p.audioUrl],
      );
      if (p.lyrics) {
        await db.query(`INSERT INTO lyrics (track_id, body) VALUES ($1, $2)`, [trackId, p.lyrics]);
      }
      if (p.genre) {
        const gid = slugify(p.genre);
        await db.query(
          `INSERT INTO genres (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`,
          [gid, p.genre],
        );
        await db.query(
          `INSERT INTO track_genres (track_id, genre_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [trackId, gid],
        );
      }

      await db.query(
        `UPDATE submissions SET status = 'approved', moderator_note = $2,
                reviewed_by = $3, reviewed_at = now(), resulting_track_id = $4 WHERE id = $1`,
        [id, note ?? null, req.user!.id, trackId],
      );
      res.json({ status: 'approved', trackId, trackSlug });
    }),
  );

  return r;
}
