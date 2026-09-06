/**
 * Catalog administration.
 *
 * Music intake happens through external community channels (see /submit in
 * the client), so there is no submission queue here. What remains is the
 * genuinely necessary administration of the real catalog:
 *
 * Content states: a published track can be unlisted / taken down / archived
 * regardless of how it entered the catalog. Every state change is recorded
 * in `takedowns` for auditing, and the catalog + playback layers enforce
 * the state.
 *
 * Every route requires a server-verified moderator/admin (requireModerator)
 * — roles come from the server (env allowlists or role rows), never from
 * anything the client sends.
 */
import { Router } from 'express';
import { z } from 'zod';
import { getDb, uuid } from '../db/index.ts';
import { asyncRoute, HttpError } from '../util/http.ts';
import { requireModerator } from '../auth.ts';

const UUID_RE = /^[0-9a-f-]{36}$/;

export function moderationRouter(): Router {
  const r = Router();
  r.use(requireModerator);

  /** Recent catalog tracks with their content state, for administration. */
  r.get(
    '/tracks',
    asyncRoute(async (req, res) => {
      const status = ['published', 'unlisted', 'taken_down', 'archived'].includes(String(req.query.status))
        ? String(req.query.status)
        : null;
      const db = await getDb();
      const rows = await db.query(
        `SELECT t.id, t.slug, t.title, t.status, t.source_type, t.created_at,
                a.name AS artist_name, a.slug AS artist_slug
           FROM tracks t JOIN artists a ON a.id = t.artist_id
          ${status ? 'WHERE t.status = $1' : ''}
          ORDER BY t.created_at DESC LIMIT 100`,
        status ? [status] : [],
      );
      res.json({
        tracks: rows.map((t: any) => ({
          id: t.id, slug: t.slug, title: t.title, status: t.status,
          sourceType: t.source_type, createdAt: t.created_at,
          artist: { name: t.artist_name, slug: t.artist_slug },
        })),
      });
    }),
  );

  /** Audit log of state changes. */
  r.get(
    '/takedowns',
    asyncRoute(async (_req, res) => {
      const db = await getDb();
      const rows = await db.query(
        `SELECT td.id, td.entity_kind, td.entity_id, td.reason, td.requested_by, td.created_at,
                u.handle AS actor_handle, t.title AS track_title, t.slug AS track_slug
           FROM takedowns td
           LEFT JOIN users u ON u.id = td.actor_id
           LEFT JOIN tracks t ON td.entity_kind = 'track' AND t.id = td.entity_id
          ORDER BY td.created_at DESC LIMIT 100`,
      );
      res.json({
        takedowns: rows.map((e: any) => ({
          id: e.id, entityKind: e.entity_kind, entityId: e.entity_id,
          reason: e.reason, requestedBy: e.requested_by, createdAt: e.created_at,
          actorHandle: e.actor_handle, trackTitle: e.track_title, trackSlug: e.track_slug,
        })),
      });
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
