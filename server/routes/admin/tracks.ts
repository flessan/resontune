/**
 * Admin: tracks.
 *
 * A track row is metadata plus two administrator-verified, externally hosted
 * URLs: the audio file and (optionally) artwork. ResonTune does not upload,
 * mirror, fetch or proxy either one - the admin decides where approved media
 * lives, validates it in their own browser, and pastes the direct address.
 */
import { Router } from 'express';
import { z } from 'zod';
import { getDb, uuid } from '../../db/index.ts';
import { asyncRoute, pagination, HttpError } from '../../util/http.ts';
import { requireAdmin } from '../../auth.ts';
import { listLinks, listLinksFor } from '../../db/links.ts';
import {
  CATALOG_STATUSES, SOURCE_TYPES, assertArtworkUrl, assertAudioUrl, assertExternalUrl, assertLinks,
  readTrackSources, requireUuid, setTrackSources, syncLinks, syncTrackGenres, uniqueSlug,
} from './shared.ts';

const linkSchema = z.object({
  provider: z.string().trim().max(30).nullable().optional(),
  label: z.string().trim().max(40).nullable().optional(),
  url: z.string().trim().min(1).max(500),
});

const trackSchema = z.object({
  title: z.string().trim().min(1).max(160),
  slug: z.string().trim().max(80).optional(),
  artistId: z.string().trim().min(1).max(40),
  releaseId: z.string().trim().max(40).nullable().optional(),
  trackNo: z.number().int().min(0).max(999).nullable().optional(),
  duration: z.number().int().min(0).max(86_400).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  genres: z.array(z.string().trim().max(40)).max(8).optional(),
  audioUrl: z.string().trim().max(500).nullable().optional(),
  externalUrl: z.string().trim().max(500).nullable().optional(),
  artworkUrl: z.string().trim().max(500).nullable().optional(),
  explicit: z.boolean().optional(),
  licenseId: z.string().trim().max(40).nullable().optional(),
  rightsHolder: z.string().trim().max(160).nullable().optional(),
  credits: z.string().trim().max(600).nullable().optional(),
  attributionText: z.string().trim().max(300).nullable().optional(),
  territory: z.string().trim().max(60).optional(),
  rightsNotes: z.string().trim().max(600).nullable().optional(),
  streamingPermission: z.boolean().optional(),
  distributionPermission: z.boolean().optional(),
  sourceType: z.enum(SOURCE_TYPES).optional(),
  status: z.enum(CATALOG_STATUSES).optional(),
  links: z.array(linkSchema).max(10).optional(),
});

function serialize(
  row: any,
  extra: {
    audioUrl?: string | null; externalUrl?: string | null; mimeType?: string | null;
    genres?: { id: string; name: string }[];
    links?: { provider: string; label: string; url: string }[];
  } = {},
) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    status: row.status,
    sourceType: row.source_type,
    trackNo: row.track_no,
    duration: row.duration_seconds,
    description: row.description ?? null,
    artworkUrl: row.artwork_url ?? null,
    inheritedArtworkUrl: row.album_artwork ?? null,
    explicit: Boolean(row.explicit),
    licenseId: row.license_id ?? null,
    licenseName: row.license_name ?? null,
    rightsHolder: row.rights_holder ?? null,
    credits: row.credits ?? null,
    attributionText: row.attribution_text ?? null,
    territory: row.territory ?? 'worldwide',
    rightsNotes: row.rights_notes ?? null,
    streamingPermission: row.streaming_permission ?? true,
    distributionPermission: row.distribution_permission ?? false,
    artistId: row.artist_id,
    artist: row.artist_name ? { id: row.artist_id, name: row.artist_name, slug: row.artist_slug } : null,
    releaseId: row.album_id ?? null,
    release: row.album_id ? { id: row.album_id, title: row.album_title, slug: row.album_slug } : null,
    playCount: Number(row.play_count ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    audioUrl: extra.audioUrl ?? null,
    externalUrl: extra.externalUrl ?? null,
    mimeType: extra.mimeType ?? null,
    genres: extra.genres ?? [],
    links: extra.links ?? [],
  };
}

const TRACK_ADMIN_SELECT = `
  t.*, a.name AS artist_name, a.slug AS artist_slug,
  al.title AS album_title, al.slug AS album_slug, al.artwork_url AS album_artwork,
  l.name AS license_name
`;
const TRACK_ADMIN_FROM = `
  FROM tracks t
  JOIN artists a ON a.id = t.artist_id
  LEFT JOIN albums al ON al.id = t.album_id
  LEFT JOIN licenses l ON l.id = t.license_id
`;

async function assertArtist(artistId: string): Promise<string> {
  const id = requireUuid(artistId, 'artist id');
  const db = await getDb();
  const rows = await db.query(`SELECT 1 FROM artists WHERE id = $1`, [id]);
  if (!rows.length) throw new HttpError(400, 'Choose an existing artist.');
  return id;
}

async function assertRelease(releaseId: string | null | undefined): Promise<string | null> {
  if (!releaseId) return null;
  const id = requireUuid(releaseId, 'release id');
  const db = await getDb();
  const rows = await db.query(`SELECT 1 FROM albums WHERE id = $1`, [id]);
  if (!rows.length) throw new HttpError(400, 'Choose an existing release.');
  return id;
}

async function assertLicense(licenseId: string | null | undefined): Promise<string | null> {
  if (!licenseId) return null;
  const db = await getDb();
  const rows = await db.query(`SELECT 1 FROM licenses WHERE id = $1`, [licenseId]);
  if (!rows.length) throw new HttpError(400, 'Unknown license.');
  return licenseId;
}

/** Normalizes every URL field in place, rejecting anything unsafe. */
function validateMediaFields(data: Partial<z.infer<typeof trackSchema>>) {
  if (data.audioUrl) data.audioUrl = assertAudioUrl(data.audioUrl);
  if (data.artworkUrl) data.artworkUrl = assertArtworkUrl(data.artworkUrl);
  if (data.externalUrl) data.externalUrl = assertExternalUrl(data.externalUrl, 'External page URL');
  data.links = assertLinks(data.links);
}

async function genresFor(trackId: string) {
  const db = await getDb();
  return db.query<{ id: string; name: string }>(
    `SELECT g.id, g.name FROM track_genres tg JOIN genres g ON g.id = tg.genre_id
      WHERE tg.track_id = $1 ORDER BY g.name`,
    [trackId],
  );
}

export function adminTracksRouter(): Router {
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
      const releaseId = typeof req.query.releaseId === 'string' && req.query.releaseId
        ? requireUuid(req.query.releaseId, 'release id') : null;
      const missingAudio = req.query.missingAudio === '1';

      const params: unknown[] = [];
      const where: string[] = [];
      if (q) {
        params.push(`%${q.toLowerCase().replace(/[%_]/g, '')}%`);
        where.push(`(lower(t.title) LIKE $${params.length} OR lower(a.name) LIKE $${params.length})`);
      }
      if (status) {
        params.push(status);
        where.push(`t.status = $${params.length}`);
      }
      if (artistId) {
        params.push(artistId);
        where.push(`t.artist_id = $${params.length}`);
      }
      if (releaseId) {
        params.push(releaseId);
        where.push(`t.album_id = $${params.length}`);
      }
      if (missingAudio) {
        // "No playable audio": an external page link alone cannot be streamed.
        where.push(
          `NOT EXISTS (SELECT 1 FROM track_sources ts WHERE ts.track_id = t.id AND ts.kind = 'direct_url')`,
        );
      }
      params.push(limit, offset);
      const db = await getDb();
      const rows = await db.query(
        `SELECT ${TRACK_ADMIN_SELECT} ${TRACK_ADMIN_FROM}
          ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
          ORDER BY t.updated_at DESC
          LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );
      const ids = rows.map((t: any) => t.id);
      const [sources, links] = await Promise.all([
        ids.length
          ? db.query<{ track_id: string; kind: string; url: string }>(
            `SELECT track_id, kind, url FROM track_sources WHERE track_id = ANY($1) ORDER BY priority`,
            [ids],
          )
          : Promise.resolve([]),
        listLinksFor('track', ids),
      ]);
      const byTrack = new Map<string, { audioUrl: string | null; externalUrl: string | null }>();
      for (const s of sources) {
        const entry = byTrack.get(s.track_id) ?? { audioUrl: null, externalUrl: null };
        if (s.kind === 'direct_url' && !entry.audioUrl) entry.audioUrl = s.url;
        if (s.kind !== 'direct_url' && !entry.externalUrl) entry.externalUrl = s.url;
        byTrack.set(s.track_id, entry);
      }
      res.json({
        tracks: rows.map((t: any) =>
          serialize(t, { ...(byTrack.get(t.id) ?? {}), links: links.get(t.id) ?? [] }),
        ),
        limit,
        offset,
      });
    }),
  );

  r.get(
    '/:id',
    asyncRoute(async (req, res) => {
      const id = requireUuid(req.params.id, 'track id');
      const db = await getDb();
      const rows = await db.query(`SELECT ${TRACK_ADMIN_SELECT} ${TRACK_ADMIN_FROM} WHERE t.id = $1`, [id]);
      if (!rows[0]) throw new HttpError(404, 'Track not found.');
      const [sources, genres, links] = await Promise.all([
        readTrackSources(id), genresFor(id), listLinks('track', id),
      ]);
      res.json({ track: serialize(rows[0], { ...sources, genres, links }) });
    }),
  );

  r.post(
    '/',
    requireAdmin,
    asyncRoute(async (req, res) => {
      const parsed = trackSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid track.');
      const data = parsed.data;
      validateMediaFields(data);
      const artistId = await assertArtist(data.artistId);
      const releaseId = await assertRelease(data.releaseId);
      const licenseId = await assertLicense(data.licenseId);
      const id = uuid();
      const slug = await uniqueSlug('tracks', data.slug || data.title);
      const db = await getDb();
      await db.query(
        `INSERT INTO tracks (id, slug, title, artist_id, album_id, track_no, duration_seconds,
                             artwork_url, description, license_id, rights_holder, credits,
                             explicit, status, source_type, attribution_text, territory,
                             rights_notes, streaming_permission, distribution_permission, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, now())`,
        [id, slug, data.title, artistId, releaseId, data.trackNo ?? null, data.duration ?? null,
          data.artworkUrl || null, data.description || null, licenseId, data.rightsHolder || null,
          data.credits || null, data.explicit ?? false, data.status ?? 'published',
          data.sourceType ?? 'community', data.attributionText || null, data.territory || 'worldwide',
          data.rightsNotes || null, data.streamingPermission ?? true, data.distributionPermission ?? false],
      );
      await setTrackSources(id, data.audioUrl || null, data.externalUrl || null);
      await syncTrackGenres(id, data.genres);
      await syncLinks('track', id, data.links);
      if (releaseId) await db.query(`UPDATE albums SET updated_at = now() WHERE id = $1`, [releaseId]);
      const rows = await db.query(`SELECT ${TRACK_ADMIN_SELECT} ${TRACK_ADMIN_FROM} WHERE t.id = $1`, [id]);
      res.status(201).json({
        track: serialize(rows[0], {
          ...(await readTrackSources(id)),
          genres: await genresFor(id),
          links: await listLinks('track', id),
        }),
      });
    }),
  );

  r.patch(
    '/:id',
    requireAdmin,
    asyncRoute(async (req, res) => {
      const id = requireUuid(req.params.id, 'track id');
      const parsed = trackSchema.partial().safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid track.');
      const data = parsed.data;
      const db = await getDb();
      const existing = await db.query<{ id: string; status: string }>(
        `SELECT id, status FROM tracks WHERE id = $1`, [id],
      );
      if (!existing.length) throw new HttpError(404, 'Track not found.');
      validateMediaFields(data);

      const params: unknown[] = [id];
      const sets: string[] = [];
      const set = (column: string, value: unknown) => {
        params.push(value);
        sets.push(`${column} = $${params.length}`);
      };
      if (data.title !== undefined) set('title', data.title);
      if (data.slug !== undefined) set('slug', await uniqueSlug('tracks', data.slug || data.title || 'track', id));
      if (data.artistId !== undefined) set('artist_id', await assertArtist(data.artistId));
      if (data.releaseId !== undefined) set('album_id', await assertRelease(data.releaseId));
      if (data.trackNo !== undefined) set('track_no', data.trackNo);
      if (data.duration !== undefined) set('duration_seconds', data.duration);
      if (data.description !== undefined) set('description', data.description || null);
      if (data.artworkUrl !== undefined) set('artwork_url', data.artworkUrl || null);
      if (data.explicit !== undefined) set('explicit', data.explicit);
      if (data.licenseId !== undefined) set('license_id', await assertLicense(data.licenseId));
      if (data.rightsHolder !== undefined) set('rights_holder', data.rightsHolder || null);
      if (data.credits !== undefined) set('credits', data.credits || null);
      if (data.attributionText !== undefined) set('attribution_text', data.attributionText || null);
      if (data.territory !== undefined) set('territory', data.territory || 'worldwide');
      if (data.rightsNotes !== undefined) set('rights_notes', data.rightsNotes || null);
      if (data.streamingPermission !== undefined) set('streaming_permission', data.streamingPermission);
      if (data.distributionPermission !== undefined) set('distribution_permission', data.distributionPermission);
      if (data.sourceType !== undefined) set('source_type', data.sourceType);
      if (data.status !== undefined) set('status', data.status);
      if (sets.length) {
        await db.query(`UPDATE tracks SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, params);
      } else {
        await db.query(`UPDATE tracks SET updated_at = now() WHERE id = $1`, [id]);
      }

      // Media URLs are replaced only when the editor sent them.
      if (data.audioUrl !== undefined || data.externalUrl !== undefined) {
        const current = await readTrackSources(id);
        await setTrackSources(
          id,
          data.audioUrl !== undefined ? data.audioUrl || null : current.audioUrl,
          data.externalUrl !== undefined ? data.externalUrl || null : current.externalUrl,
        );
      }
      await syncTrackGenres(id, data.genres);
      await syncLinks('track', id, data.links);

      // Publication-state changes stay auditable, exactly like moderation ones.
      if (data.status !== undefined && data.status !== existing[0].status) {
        await db.query(
          `INSERT INTO takedowns (id, entity_kind, entity_id, reason, requested_by, actor_id)
           VALUES ($1, 'track', $2, $3, 'catalog manager', $4)`,
          [uuid(), id, `${existing[0].status} → ${data.status}`, req.user!.id],
        );
      }

      const rows = await db.query(`SELECT ${TRACK_ADMIN_SELECT} ${TRACK_ADMIN_FROM} WHERE t.id = $1`, [id]);
      const album = (rows[0] as any).album_id;
      if (album) await db.query(`UPDATE albums SET updated_at = now() WHERE id = $1`, [album]);
      res.json({
        track: serialize(rows[0], {
          ...(await readTrackSources(id)),
          genres: await genresFor(id),
          links: await listLinks('track', id),
        }),
      });
    }),
  );

  r.delete(
    '/:id',
    requireAdmin,
    asyncRoute(async (req, res) => {
      const id = requireUuid(req.params.id, 'track id');
      const db = await getDb();
      const removed = await db.query(`DELETE FROM tracks WHERE id = $1 RETURNING id`, [id]);
      if (!removed.length) throw new HttpError(404, 'Track not found.');
      await db.query(`DELETE FROM entity_links WHERE entity_kind = 'track' AND entity_id = $1`, [id]);
      res.json({ ok: true });
    }),
  );

  return r;
}
