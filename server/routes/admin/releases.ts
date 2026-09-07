/**
 * Admin: releases (albums, EPs, singles, compilations).
 *
 * Artwork is an externally hosted URL the administrator verified by hand -
 * ResonTune stores the address, never the image.
 */
import { Router } from 'express';
import { z } from 'zod';
import { getDb, uuid } from '../../db/index.ts';
import { asyncRoute, pagination, HttpError } from '../../util/http.ts';
import { requireAdmin } from '../../auth.ts';
import { listLinks, listLinksFor } from '../../db/links.ts';
import {
  CATALOG_STATUSES, SOURCE_TYPES, assertArtworkUrl, assertLinks, requireUuid, syncLinks, uniqueSlug,
} from './shared.ts';

const RELEASE_TYPES = ['album', 'ep', 'single', 'compilation'] as const;

const linkSchema = z.object({
  provider: z.string().trim().max(30).nullable().optional(),
  label: z.string().trim().max(40).nullable().optional(),
  url: z.string().trim().min(1).max(500),
});

const releaseSchema = z.object({
  title: z.string().trim().min(1).max(160),
  slug: z.string().trim().max(80).optional(),
  artistId: z.string().trim().min(1).max(40),
  type: z.enum(RELEASE_TYPES).optional(),
  releasedOn: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD release date.').nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  artworkUrl: z.string().trim().max(500).nullable().optional(),
  catalogNo: z.string().trim().max(40).nullable().optional(),
  sourceType: z.enum(SOURCE_TYPES).optional(),
  status: z.enum(CATALOG_STATUSES).optional(),
  links: z.array(linkSchema).max(10).optional(),
});

function serialize(row: any, links: { provider: string; label: string; url: string }[] = []) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    type: row.type,
    status: row.status,
    sourceType: row.source_type,
    releasedOn: row.released_on,
    description: row.description ?? null,
    artworkUrl: row.artwork_url ?? null,
    catalogNo: row.catalog_no ?? null,
    artistId: row.artist_id,
    artist: row.artist_name ? { id: row.artist_id, name: row.artist_name, slug: row.artist_slug } : null,
    trackCount: row.track_count == null ? undefined : Number(row.track_count),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    links: links.map((l) => ({ provider: l.provider, label: l.label, url: l.url })),
  };
}

async function assertArtist(artistId: string): Promise<string> {
  const id = requireUuid(artistId, 'artist id');
  const db = await getDb();
  const rows = await db.query(`SELECT 1 FROM artists WHERE id = $1`, [id]);
  if (!rows.length) throw new HttpError(400, 'Choose an existing artist.');
  return id;
}

export function adminReleasesRouter(): Router {
  const r = Router();

  r.get(
    '/',
    asyncRoute(async (req, res) => {
      const { limit, offset } = pagination(req, { limit: 40, max: 100 });
      const q = String(req.query.q ?? '').trim().slice(0, 60);
      const status = CATALOG_STATUSES.includes(String(req.query.status) as never)
        ? String(req.query.status) : null;
      const artistId = typeof req.query.artistId === 'string' && req.query.artistId
        ? requireUuid(req.query.artistId, 'artist id') : null;
      const params: unknown[] = [];
      const where: string[] = [];
      if (q) {
        params.push(`%${q.toLowerCase().replace(/[%_]/g, '')}%`);
        where.push(`(lower(al.title) LIKE $${params.length} OR lower(a.name) LIKE $${params.length})`);
      }
      if (status) {
        params.push(status);
        where.push(`al.status = $${params.length}`);
      }
      if (artistId) {
        params.push(artistId);
        where.push(`al.artist_id = $${params.length}`);
      }
      params.push(limit, offset);
      const db = await getDb();
      const rows = await db.query(
        `SELECT al.*, a.name AS artist_name, a.slug AS artist_slug,
                (SELECT count(*) FROM tracks t WHERE t.album_id = al.id) AS track_count
           FROM albums al JOIN artists a ON a.id = al.artist_id
          ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
          ORDER BY al.updated_at DESC
          LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );
      const links = await listLinksFor('album', rows.map((x: any) => x.id));
      res.json({ releases: rows.map((x: any) => serialize(x, links.get(x.id) ?? [])), limit, offset });
    }),
  );

  r.get(
    '/:id',
    asyncRoute(async (req, res) => {
      const id = requireUuid(req.params.id, 'release id');
      const db = await getDb();
      const rows = await db.query(
        `SELECT al.*, a.name AS artist_name, a.slug AS artist_slug
           FROM albums al JOIN artists a ON a.id = al.artist_id WHERE al.id = $1`,
        [id],
      );
      if (!rows[0]) throw new HttpError(404, 'Release not found.');
      const tracks = await db.query(
        `SELECT t.id, t.slug, t.title, t.status, t.track_no, t.duration_seconds, t.updated_at,
                (SELECT count(*) FROM track_sources ts WHERE ts.track_id = t.id) AS source_count
           FROM tracks t WHERE t.album_id = $1 ORDER BY t.track_no NULLS LAST, t.title`,
        [id],
      );
      res.json({
        release: serialize(rows[0], await listLinks('album', id)),
        tracks: tracks.map((t: any) => ({
          id: t.id, slug: t.slug, title: t.title, status: t.status, trackNo: t.track_no,
          duration: t.duration_seconds, updatedAt: t.updated_at,
          sourceCount: Number(t.source_count),
        })),
      });
    }),
  );

  r.post(
    '/',
    requireAdmin,
    asyncRoute(async (req, res) => {
      const parsed = releaseSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid release.');
      const data = parsed.data;
      if (data.artworkUrl) data.artworkUrl = assertArtworkUrl(data.artworkUrl);
      data.links = assertLinks(data.links);
      const artistId = await assertArtist(data.artistId);
      const id = uuid();
      const slug = await uniqueSlug('albums', data.slug || data.title);
      const db = await getDb();
      await db.query(
        `INSERT INTO albums (id, slug, artist_id, title, type, artwork_url, description,
                             released_on, source_type, status, catalog_no, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())`,
        [id, slug, artistId, data.title, data.type ?? 'album', data.artworkUrl || null,
          data.description || null, data.releasedOn || null, data.sourceType ?? 'community',
          data.status ?? 'published', data.catalogNo || null],
      );
      await syncLinks('album', id, data.links);
      const rows = await db.query(
        `SELECT al.*, a.name AS artist_name, a.slug AS artist_slug
           FROM albums al JOIN artists a ON a.id = al.artist_id WHERE al.id = $1`, [id],
      );
      res.status(201).json({ release: serialize(rows[0], await listLinks('album', id)) });
    }),
  );

  r.patch(
    '/:id',
    requireAdmin,
    asyncRoute(async (req, res) => {
      const id = requireUuid(req.params.id, 'release id');
      const parsed = releaseSchema.partial().safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid release.');
      const data = parsed.data;
      const db = await getDb();
      const existing = await db.query(`SELECT id FROM albums WHERE id = $1`, [id]);
      if (!existing.length) throw new HttpError(404, 'Release not found.');
      if (data.artworkUrl) data.artworkUrl = assertArtworkUrl(data.artworkUrl);
      data.links = assertLinks(data.links);

      const params: unknown[] = [id];
      const sets: string[] = [];
      const set = (column: string, value: unknown) => {
        params.push(value);
        sets.push(`${column} = $${params.length}`);
      };
      if (data.title !== undefined) set('title', data.title);
      if (data.slug !== undefined) set('slug', await uniqueSlug('albums', data.slug || data.title || 'release', id));
      if (data.artistId !== undefined) set('artist_id', await assertArtist(data.artistId));
      if (data.type !== undefined) set('type', data.type);
      if (data.releasedOn !== undefined) set('released_on', data.releasedOn || null);
      if (data.description !== undefined) set('description', data.description || null);
      if (data.artworkUrl !== undefined) set('artwork_url', data.artworkUrl || null);
      if (data.catalogNo !== undefined) set('catalog_no', data.catalogNo || null);
      if (data.sourceType !== undefined) set('source_type', data.sourceType);
      if (data.status !== undefined) set('status', data.status);
      if (sets.length) {
        await db.query(`UPDATE albums SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, params);
      } else {
        await db.query(`UPDATE albums SET updated_at = now() WHERE id = $1`, [id]);
      }
      await syncLinks('album', id, data.links);
      const rows = await db.query(
        `SELECT al.*, a.name AS artist_name, a.slug AS artist_slug
           FROM albums al JOIN artists a ON a.id = al.artist_id WHERE al.id = $1`, [id],
      );
      res.json({ release: serialize(rows[0], await listLinks('album', id)) });
    }),
  );

  /** Reorder the tracks of a release (writes track_no in the given order). */
  r.post(
    '/:id/reorder',
    requireAdmin,
    asyncRoute(async (req, res) => {
      const id = requireUuid(req.params.id, 'release id');
      const parsed = z.object({ trackIds: z.array(z.string().max(40)).max(200) }).safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, 'Invalid track order.');
      const db = await getDb();
      const owned = await db.query<{ id: string }>(`SELECT id FROM tracks WHERE album_id = $1`, [id]);
      const allowed = new Set(owned.map((t) => t.id));
      let position = 1;
      for (const raw of parsed.data.trackIds) {
        const trackId = requireUuid(raw, 'track id');
        if (!allowed.has(trackId)) continue;
        await db.query(`UPDATE tracks SET track_no = $2, updated_at = now() WHERE id = $1`, [trackId, position]);
        position += 1;
      }
      await db.query(`UPDATE albums SET updated_at = now() WHERE id = $1`, [id]);
      res.json({ ok: true });
    }),
  );

  /** Delete a release. Tracks survive and become standalone (album_id NULL). */
  r.delete(
    '/:id',
    requireAdmin,
    asyncRoute(async (req, res) => {
      const id = requireUuid(req.params.id, 'release id');
      const db = await getDb();
      const removed = await db.query(`DELETE FROM albums WHERE id = $1 RETURNING id`, [id]);
      if (!removed.length) throw new HttpError(404, 'Release not found.');
      await db.query(`DELETE FROM entity_links WHERE entity_kind = 'album' AND entity_id = $1`, [id]);
      res.json({ ok: true });
    }),
  );

  return r;
}
