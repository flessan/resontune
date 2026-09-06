/**
 * Moderation & catalog administration.
 *
 * Submission lifecycle: pending → reviewing → approved → published
 *                                        └──→ rejected
 * "approved" records the decision; "published" materializes real catalog
 * rows (artist/album/track/source) with source_type='community' and links
 * them back to the submission. Every transition is appended to
 * moderation_events — decisions are auditable and never silently rewritten.
 *
 * Notes: `note` (public) is shown to the submitter; `internalNote` is
 * moderation-team-only and never leaves this router's authz boundary.
 *
 * Takedowns: content states are separate from submission states. A track
 * can be unlisted / taken down / archived here regardless of how it entered
 * the catalog; the reason is stored in `takedowns` for auditing and the
 * catalog+playback layers enforce the state.
 *
 * Every route requires a server-verified moderator/admin session
 * (requireModerator) — roles come from the server (env allowlists or role
 * rows), never from anything the client sends.
 */
import { Router } from 'express';
import { z } from 'zod';
import { getDb, uuid, slugify } from '../db/index.ts';
import { asyncRoute, HttpError } from '../util/http.ts';
import { requireModerator } from '../auth.ts';

const UUID_RE = /^[0-9a-f-]{36}$/;

async function logEvent(
  submissionId: string,
  actorId: string,
  from: string,
  to: string,
  publicNote?: string | null,
  internalNote?: string | null,
) {
  const db = await getDb();
  await db.query(
    `INSERT INTO moderation_events (id, submission_id, actor_id, from_status, to_status, public_note, internal_note)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [uuid(), submissionId, actorId, from, to, publicNote ?? null, internalNote ?? null],
  );
}

export function moderationRouter(): Router {
  const r = Router();
  r.use(requireModerator);

  r.get(
    '/queue',
    asyncRoute(async (req, res) => {
      const status = ['pending', 'reviewing', 'approved', 'published', 'rejected'].includes(String(req.query.status))
        ? String(req.query.status)
        : 'pending';
      const db = await getDb();
      const rows = await db.query(
        `SELECT s.id, s.status, s.payload, s.moderator_note, s.internal_note, s.created_at,
                s.reviewed_at, s.resulting_track_id, u.handle AS submitter_handle
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
          internalNote: s.internal_note,
          submitterHandle: s.submitter_handle,
          createdAt: s.created_at,
          reviewedAt: s.reviewed_at,
          resultingTrackId: s.resulting_track_id,
        })),
      });
    }),
  );

  /** Full decision history for one submission (moderation-only). */
  r.get(
    '/queue/:id/history',
    asyncRoute(async (req, res) => {
      const id = String(req.params.id);
      if (!UUID_RE.test(id)) throw new HttpError(400, 'Bad submission id.');
      const db = await getDb();
      const rows = await db.query(
        `SELECT e.from_status, e.to_status, e.public_note, e.internal_note, e.created_at,
                u.handle AS actor_handle
           FROM moderation_events e LEFT JOIN users u ON u.id = e.actor_id
          WHERE e.submission_id = $1 ORDER BY e.created_at`,
        [id],
      );
      res.json({
        events: rows.map((e: any) => ({
          fromStatus: e.from_status,
          toStatus: e.to_status,
          publicNote: e.public_note,
          internalNote: e.internal_note,
          actorHandle: e.actor_handle,
          createdAt: e.created_at,
        })),
      });
    }),
  );

  const decisionSchema = z.object({
    action: z.enum(['reviewing', 'approve', 'publish', 'reject']),
    note: z.string().trim().max(600).optional(),          // visible to submitter
    internalNote: z.string().trim().max(1000).optional(), // moderation-only
  });

  r.post(
    '/queue/:id',
    asyncRoute(async (req, res) => {
      const id = String(req.params.id);
      if (!UUID_RE.test(id)) throw new HttpError(400, 'Bad submission id.');
      const parsed = decisionSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, 'Invalid decision.');
      const db = await getDb();
      const rows = await db.query(`SELECT * FROM submissions WHERE id = $1`, [id]);
      const sub: any = rows[0];
      if (!sub) throw new HttpError(404, 'Submission not found.');

      const { action, note, internalNote } = parsed.data;
      const actor = req.user!.id;

      if (action === 'reviewing') {
        if (sub.status !== 'pending') throw new HttpError(409, `Cannot start review from '${sub.status}'.`);
        await db.query(
          `UPDATE submissions SET status = 'reviewing', internal_note = COALESCE($2, internal_note) WHERE id = $1`,
          [id, internalNote ?? null],
        );
        await logEvent(id, actor, sub.status, 'reviewing', note, internalNote);
        return void res.json({ status: 'reviewing' });
      }

      if (action === 'reject') {
        if (sub.status === 'published') throw new HttpError(409, 'Already published — use a takedown instead.');
        await db.query(
          `UPDATE submissions SET status = 'rejected', moderator_note = $2,
                  internal_note = COALESCE($3, internal_note),
                  reviewed_by = $4, reviewed_at = now() WHERE id = $1`,
          [id, note ?? null, internalNote ?? null, actor],
        );
        await logEvent(id, actor, sub.status, 'rejected', note, internalNote);
        return void res.json({ status: 'rejected' });
      }

      if (action === 'approve') {
        if (sub.status !== 'pending' && sub.status !== 'reviewing') {
          throw new HttpError(409, `Cannot approve from '${sub.status}'.`);
        }
        await db.query(
          `UPDATE submissions SET status = 'approved', moderator_note = $2,
                  internal_note = COALESCE($3, internal_note),
                  reviewed_by = $4, reviewed_at = now() WHERE id = $1`,
          [id, note ?? null, internalNote ?? null, actor],
        );
        await logEvent(id, actor, sub.status, 'approved', note, internalNote);
        return void res.json({ status: 'approved' });
      }

      /* publish → materialize catalog rows */
      if (sub.status !== 'approved' && sub.status !== 'reviewing' && sub.status !== 'pending') {
        throw new HttpError(409, `Cannot publish from '${sub.status}'.`);
      }
      if (sub.resulting_track_id) throw new HttpError(409, 'Already published.');
      const p = typeof sub.payload === 'string' ? JSON.parse(sub.payload) : sub.payload;

      // artist (find or create by name; new artists are community artists)
      const artistRows = await db.query<{ id: string }>(
        `SELECT id FROM artists WHERE lower(name) = lower($1)`, [p.artistName],
      );
      let artistId = artistRows[0]?.id;
      if (!artistId) {
        artistId = uuid();
        let slug = slugify(p.artistName);
        const clash = await db.query(`SELECT 1 FROM artists WHERE slug = $1`, [slug]);
        if (clash.length) slug = `${slug}-${artistId.slice(0, 6)}`;
        await db.query(
          `INSERT INTO artists (id, slug, name, source_type) VALUES ($1, $2, $3, 'community')`,
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
            `INSERT INTO albums (id, slug, artist_id, title, artwork_url, source_type)
             VALUES ($1, $2, $3, $4, $5, 'community')`,
            [albumId, slug, artistId, p.albumTitle, p.artworkUrl || null],
          );
        }
      }

      // track — rights fields come from the submitter's declaration, recorded
      // verbatim; we never invent permissions the submitter didn't state.
      const trackId = uuid();
      let trackSlug = slugify(`${p.artistName} ${p.trackTitle}`);
      const slugClash = await db.query(`SELECT 1 FROM tracks WHERE slug = $1`, [trackSlug]);
      if (slugClash.length) trackSlug = `${trackSlug}-${trackId.slice(0, 6)}`;
      await db.query(
        `INSERT INTO tracks (id, slug, title, artist_id, album_id, artwork_url, description,
                             license_id, rights_holder, status, source_type,
                             streaming_permission, distribution_permission, attribution_text)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'published', 'community', true, false, $10)`,
        [trackId, trackSlug, p.trackTitle, artistId, albumId,
         p.artworkUrl || null, p.description || null, p.licenseId, p.rightsHolder,
         `${p.trackTitle} — ${p.artistName} (via ResonTune)`],
      );
      await db.query(
        `INSERT INTO track_sources (id, track_id, provider, kind, url, storage, source_type)
         VALUES ($1, $2, 'hosted', 'direct_url', $3, 'manual-url', 'community_hosted')`,
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
        `UPDATE submissions SET status = 'published', moderator_note = COALESCE($2, moderator_note),
                internal_note = COALESCE($3, internal_note),
                reviewed_by = $4, reviewed_at = now(), resulting_track_id = $5 WHERE id = $1`,
        [id, note ?? null, internalNote ?? null, actor, trackId],
      );
      await logEvent(id, actor, sub.status, 'published', note, internalNote);
      res.json({ status: 'published', trackId, trackSlug });
    }),
  );

  /* ------------------------- content state control ------------------------- */

  const stateSchema = z.object({
    status: z.enum(['published', 'unlisted', 'taken_down', 'archived']),
    reason: z.string().trim().min(3).max(600),
    requestedBy: z.string().trim().max(120).optional(),
  });

  r.post(
    '/tracks/:id/state',
    asyncRoute(async (req, res) => {
      const id = String(req.params.id);
      if (!UUID_RE.test(id)) throw new HttpError(400, 'Bad track id.');
      const parsed = stateSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, 'Invalid state change.');
      const db = await getDb();
      const rows = await db.query<{ status: string }>(`SELECT status FROM tracks WHERE id = $1`, [id]);
      if (!rows[0]) throw new HttpError(404, 'Track not found.');
      const { status, reason, requestedBy } = parsed.data;
      await db.query(`UPDATE tracks SET status = $2 WHERE id = $1`, [id, status]);
      await db.query(
        `INSERT INTO takedowns (id, entity_kind, entity_id, reason, requested_by, actor_id)
         VALUES ($1, 'track', $2, $3, $4, $5)`,
        [uuid(), id, `${rows[0].status} → ${status}: ${reason}`, requestedBy ?? null, req.user!.id],
      );
      res.json({ ok: true, status });
    }),
  );

  return r;
}
