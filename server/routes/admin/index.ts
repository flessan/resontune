/**
 * Admin catalog manager API.
 *
 * A small internal music CMS, not a generic dashboard:
 *   /api/admin/overview            catalog counts, recent changes, warnings
 *   /api/admin/licenses            license vocabulary for the editors
 *   /api/admin/artists   …         artist records
 *   /api/admin/releases  …         releases / albums
 *   /api/admin/tracks    …         tracks + manually verified media URLs
 *   /api/admin/users/search        find an account to associate with an artist
 *
 * Authorization is server-side and unconditional: reads require a verified
 * moderator or admin, every mutation requires an admin. Hiding UI is never
 * the control.
 */
import { Router } from 'express';
import { getDb } from '../../db/index.ts';
import { asyncRoute } from '../../util/http.ts';
import { requireModerator } from '../../auth.ts';
import { adminArtistsRouter } from './artists.ts';
import { adminReleasesRouter } from './releases.ts';
import { adminTracksRouter } from './tracks.ts';

export function adminRouter(): Router {
  const r = Router();
  r.use(requireModerator);

  /** Catalog overview: what exists, what changed, what needs attention. */
  r.get(
    '/overview',
    asyncRoute(async (_req, res) => {
      const db = await getDb();
      const [artistCounts, releaseCounts, trackCounts, recentTracks, recentReleases, recentArtists, warnings] =
        await Promise.all([
          db.query<{ status: string; n: string }>(`SELECT status, count(*)::text AS n FROM artists GROUP BY status`),
          db.query<{ status: string; n: string }>(`SELECT status, count(*)::text AS n FROM albums GROUP BY status`),
          db.query<{ status: string; n: string }>(`SELECT status, count(*)::text AS n FROM tracks GROUP BY status`),
          db.query(
            `SELECT t.id, t.title, t.status, t.updated_at, a.name AS artist_name
               FROM tracks t JOIN artists a ON a.id = t.artist_id
              ORDER BY t.updated_at DESC LIMIT 6`,
          ),
          db.query(
            `SELECT al.id, al.title, al.status, al.updated_at, a.name AS artist_name
               FROM albums al JOIN artists a ON a.id = al.artist_id
              ORDER BY al.updated_at DESC LIMIT 6`,
          ),
          db.query(`SELECT id, name, status, updated_at FROM artists ORDER BY updated_at DESC LIMIT 6`),
          db.query<{ missing_audio: string; empty_releases: string; no_license: string }>(
            `SELECT
               (SELECT count(*) FROM tracks t
                 WHERE t.status = 'published'
                   AND NOT EXISTS (SELECT 1 FROM track_sources ts
                                    WHERE ts.track_id = t.id AND ts.kind = 'direct_url'))::text AS missing_audio,
               (SELECT count(*) FROM albums al
                 WHERE al.status = 'published'
                   AND NOT EXISTS (SELECT 1 FROM tracks t WHERE t.album_id = al.id))::text AS empty_releases,
               (SELECT count(*) FROM tracks t
                 WHERE t.status = 'published' AND t.license_id IS NULL)::text AS no_license`,
          ),
        ]);

      const tally = (rows: { status: string; n: string }[]) => {
        const out: Record<string, number> = { total: 0, published: 0, unlisted: 0, taken_down: 0, archived: 0 };
        for (const row of rows) {
          out[row.status] = Number(row.n);
          out.total += Number(row.n);
        }
        return out;
      };

      res.json({
        counts: {
          artists: tally(artistCounts),
          releases: tally(releaseCounts),
          tracks: tally(trackCounts),
        },
        recent: [
          ...recentTracks.map((t: any) => ({
            kind: 'track' as const, id: t.id, title: t.title, status: t.status,
            subtitle: t.artist_name, updatedAt: t.updated_at,
          })),
          ...recentReleases.map((al: any) => ({
            kind: 'release' as const, id: al.id, title: al.title, status: al.status,
            subtitle: al.artist_name, updatedAt: al.updated_at,
          })),
          ...recentArtists.map((a: any) => ({
            kind: 'artist' as const, id: a.id, title: a.name, status: a.status,
            subtitle: null, updatedAt: a.updated_at,
          })),
        ]
          .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
          .slice(0, 10),
        warnings: {
          tracksMissingAudio: Number(warnings[0]?.missing_audio ?? 0),
          releasesWithoutTracks: Number(warnings[0]?.empty_releases ?? 0),
          publishedWithoutLicense: Number(warnings[0]?.no_license ?? 0),
        },
      });
    }),
  );

  /** License vocabulary (structural reference data, not content). */
  r.get(
    '/licenses',
    asyncRoute(async (_req, res) => {
      const db = await getDb();
      const rows = await db.query(
        `SELECT id, name, url, summary, requires_attribution FROM licenses ORDER BY name`,
      );
      res.json({
        licenses: rows.map((l: any) => ({
          id: l.id, name: l.name, url: l.url, summary: l.summary,
          requiresAttribution: l.requires_attribution,
        })),
      });
    }),
  );

  /** Look up accounts to associate an artist record with (admin surface). */
  r.get(
    '/users/search',
    asyncRoute(async (req, res) => {
      const q = String(req.query.q ?? '').trim().toLowerCase().replace(/[%_]/g, '').slice(0, 40);
      if (q.length < 2) return void res.json({ users: [] });
      const db = await getDb();
      const rows = await db.query(
        `SELECT id, handle, display_name, avatar_url FROM users
          WHERE lower(handle) LIKE $1 OR lower(display_name) LIKE $1
          ORDER BY handle LIMIT 10`,
        [`%${q}%`],
      );
      res.json({
        users: rows.map((u: any) => ({
          id: u.id, username: u.handle, displayName: u.display_name, avatarUrl: u.avatar_url,
        })),
      });
    }),
  );

  r.use('/artists', adminArtistsRouter());
  r.use('/releases', adminReleasesRouter());
  r.use('/tracks', adminTracksRouter());

  return r;
}
