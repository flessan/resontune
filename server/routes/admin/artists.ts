/**
 * Admin: artists.
 *
 * Artist records are independent of user accounts - an artist can exist in
 * the catalog without ever having signed in. `userId` optionally associates
 * a record with a ResonTune account, which is the seam a future "claim your
 * artist page" flow plugs into.
 */
import { Router } from 'express';
import { z } from 'zod';
import { getDb, uuid } from '../../db/index.ts';
import { asyncRoute, pagination, HttpError } from '../../util/http.ts';
import { requireAdmin } from '../../auth.ts';
import { listLinks, listLinksFor } from '../../db/links.ts';
import {
  CATALOG_STATUSES, SOURCE_TYPES, assertImageUrl, assertLinks, requireUuid, syncLinks, uniqueSlug,
} from './shared.ts';

const linkSchema = z.object({
  provider: z.string().trim().max(30).nullable().optional(),
  label: z.string().trim().max(40).nullable().optional(),
  url: z.string().trim().min(1).max(500),
});

const artistSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().max(80).optional(),
  bio: z.string().trim().max(2000).nullable().optional(),
  imageUrl: z.string().trim().max(500).nullable().optional(),
  location: z.string().trim().max(80).nullable().optional(),
  sourceType: z.enum(SOURCE_TYPES).optional(),
  status: z.enum(CATALOG_STATUSES).optional(),
  userId: z.string().trim().max(40).nullable().optional(),
  links: z.array(linkSchema).max(10).optional(),
});

function serialize(row: any, links: { provider: string; label: string; url: string }[] = []) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    bio: row.bio ?? null,
    imageUrl: row.image_url ?? null,
    location: row.location ?? null,
    sourceType: row.source_type,
    status: row.status,
    userId: row.user_id ?? null,
    userHandle: row.user_handle ?? null,
    trackCount: row.track_count == null ? undefined : Number(row.track_count),
    releaseCount: row.release_count == null ? undefined : Number(row.release_count),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    links: links.map((l) => ({ provider: l.provider, label: l.label, url: l.url })),
  };
}

async function assertUserExists(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  const id = requireUuid(userId, 'user id');
  const db = await getDb();
  const rows = await db.query(`SELECT 1 FROM users WHERE id = $1`, [id]);
  if (!rows.length) throw new HttpError(400, 'That ResonTune account does not exist.');
  return id;
}

export function adminArtistsRouter(): Router {
  const r = Router();

  /* ---------------------------------- read --------------------------------- */

  r.get(
    '/',
    asyncRoute(async (req, res) => {
      const { limit, offset } = pagination(req, { limit: 40, max: 100 });
      const q = String(req.query.q ?? '').trim().slice(0, 60);
      const status = CATALOG_STATUSES.includes(String(req.query.status) as never)
        ? String(req.query.status) : null;
      const params: unknown[] = [];
      const where: string[] = [];
      if (q) {
        params.push(`%${q.toLowerCase().replace(/[%_]/g, '')}%`);
        where.push(`lower(a.name) LIKE $${params.length}`);
      }
      if (status) {
        params.push(status);
        where.push(`a.status = $${params.length}`);
      }
      params.push(limit, offset);
      const db = await getDb();
      const rows = await db.query(
        `SELECT a.*, u.handle AS user_handle,
                (SELECT count(*) FROM tracks t WHERE t.artist_id = a.id) AS track_count,
                (SELECT count(*) FROM albums al WHERE al.artist_id = a.id) AS release_count
           FROM artists a LEFT JOIN users u ON u.id = a.user_id
          ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
          ORDER BY a.updated_at DESC, a.name
          LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );
      const links = await listLinksFor('artist', rows.map((a: any) => a.id));
      res.json({ artists: rows.map((a: any) => serialize(a, links.get(a.id) ?? [])), limit, offset });
    }),
  );

  r.get(
    '/:id',
    asyncRoute(async (req, res) => {
      const id = requireUuid(req.params.id, 'artist id');
      const db = await getDb();
      const rows = await db.query(
        `SELECT a.*, u.handle AS user_handle FROM artists a
           LEFT JOIN users u ON u.id = a.user_id WHERE a.id = $1`,
        [id],
      );
      if (!rows[0]) throw new HttpError(404, 'Artist not found.');
      const [links, releases, tracks] = await Promise.all([
        listLinks('artist', id),
        db.query(
          `SELECT id, slug, title, type, status, released_on, artwork_url
             FROM albums WHERE artist_id = $1 ORDER BY released_on DESC NULLS LAST`,
          [id],
        ),
        db.query(
          `SELECT id, slug, title, status, track_no, album_id, updated_at
             FROM tracks WHERE artist_id = $1 ORDER BY updated_at DESC LIMIT 100`,
          [id],
        ),
      ]);
      res.json({
        artist: serialize(rows[0], links),
        releases: releases.map((al: any) => ({
          id: al.id, slug: al.slug, title: al.title, type: al.type, status: al.status,
          releasedOn: al.released_on, artworkUrl: al.artwork_url,
        })),
        tracks: tracks.map((t: any) => ({
          id: t.id, slug: t.slug, title: t.title, status: t.status,
          trackNo: t.track_no, releaseId: t.album_id, updatedAt: t.updated_at,
        })),
      });
    }),
  );

  /* --------------------------------- write --------------------------------- */

  r.post(
    '/',
    requireAdmin,
    asyncRoute(async (req, res) => {
      const parsed = artistSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid artist.');
      const data = parsed.data;
      if (data.imageUrl) data.imageUrl = assertImageUrl(data.imageUrl, 'Image URL');
      data.links = assertLinks(data.links);
      const userId = await assertUserExists(data.userId);
      const id = uuid();
      const slug = await uniqueSlug('artists', data.slug || data.name);
      const db = await getDb();
      await db.query(
        `INSERT INTO artists (id, slug, name, bio, image_url, location, source_type, status, user_id, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())`,
        [id, slug, data.name, data.bio || null, data.imageUrl || null, data.location || null,
          data.sourceType ?? 'community', data.status ?? 'published', userId],
      );
      await syncLinks('artist', id, data.links);
      const rows = await db.query(`SELECT * FROM artists WHERE id = $1`, [id]);
      res.status(201).json({ artist: serialize(rows[0], await listLinks('artist', id)) });
    }),
  );

  r.patch(
    '/:id',
    requireAdmin,
    asyncRoute(async (req, res) => {
      const id = requireUuid(req.params.id, 'artist id');
      const parsed = artistSchema.partial().safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid artist.');
      const data = parsed.data;
      const db = await getDb();
      const existing = await db.query<{ id: string }>(`SELECT id FROM artists WHERE id = $1`, [id]);
      if (!existing.length) throw new HttpError(404, 'Artist not found.');
      if (data.imageUrl) data.imageUrl = assertImageUrl(data.imageUrl, 'Image URL');
      data.links = assertLinks(data.links);

      const params: unknown[] = [id];
      const sets: string[] = [];
      const set = (column: string, value: unknown) => {
        params.push(value);
        sets.push(`${column} = $${params.length}`);
      };
      if (data.name !== undefined) set('name', data.name);
      if (data.slug !== undefined) set('slug', await uniqueSlug('artists', data.slug || data.name || 'artist', id));
      if (data.bio !== undefined) set('bio', data.bio || null);
      if (data.imageUrl !== undefined) set('image_url', data.imageUrl || null);
      if (data.location !== undefined) set('location', data.location || null);
      if (data.sourceType !== undefined) set('source_type', data.sourceType);
      if (data.status !== undefined) set('status', data.status);
      if (data.userId !== undefined) set('user_id', await assertUserExists(data.userId));
      if (sets.length) {
        await db.query(`UPDATE artists SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, params);
      } else {
        await db.query(`UPDATE artists SET updated_at = now() WHERE id = $1`, [id]);
      }
      await syncLinks('artist', id, data.links);
      const rows = await db.query(
        `SELECT a.*, u.handle AS user_handle FROM artists a
           LEFT JOIN users u ON u.id = a.user_id WHERE a.id = $1`, [id],
      );
      res.json({ artist: serialize(rows[0], await listLinks('artist', id)) });
    }),
  );

  /**
   * Delete an artist. Refused while releases or tracks still reference it -
   * a destructive cascade is never the quiet default. Archive instead, or
   * remove the catalog entries first.
   */
  r.delete(
    '/:id',
    requireAdmin,
    asyncRoute(async (req, res) => {
      const id = requireUuid(req.params.id, 'artist id');
      const db = await getDb();
      const counts = await db.query<{ tracks: string; releases: string }>(
        `SELECT (SELECT count(*) FROM tracks WHERE artist_id = $1) AS tracks,
                (SELECT count(*) FROM albums WHERE artist_id = $1) AS releases`,
        [id],
      );
      const tracks = Number(counts[0]?.tracks ?? 0);
      const releases = Number(counts[0]?.releases ?? 0);
      if (tracks || releases) {
        throw new HttpError(
          409,
          `This artist still has ${tracks} track(s) and ${releases} release(s). Remove or reassign them first, or archive the artist instead.`,
        );
      }
      const removed = await db.query(`DELETE FROM artists WHERE id = $1 RETURNING id`, [id]);
      if (!removed.length) throw new HttpError(404, 'Artist not found.');
      await db.query(`DELETE FROM entity_links WHERE entity_kind = 'artist' AND entity_id = $1`, [id]);
      res.json({ ok: true });
    }),
  );

  return r;
}
