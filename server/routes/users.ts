/**
 * Public profiles — `/api/users/:username`.
 *
 * A ResonTune profile is a music-platform page, not an account dump: display
 * name, username, bio, location, links, join date, role, public playlists,
 * and the catalog artist page the account is associated with (if any).
 * Private signals (history, favorites, email, auth identifiers) never appear
 * here.
 */
import { Router } from 'express';
import { getDb } from '../db/index.ts';
import { asyncRoute, HttpError } from '../util/http.ts';
import { listLinks } from '../db/links.ts';
import { PROFILE_COLUMNS, serializeProfile, type ProfileRow } from '../util/profile.ts';
import { normalizeUsername } from '../util/username.ts';

export function usersRouter(): Router {
  const r = Router();

  r.get(
    '/:username',
    asyncRoute(async (req, res) => {
      const username = normalizeUsername(String(req.params.username));
      if (!username) throw new HttpError(404, 'Profile not found.');
      const db = await getDb();
      const rows = await db.query<ProfileRow>(
        `SELECT ${PROFILE_COLUMNS} FROM users u WHERE lower(u.handle) = $1`,
        [username],
      );
      const row = rows[0];
      if (!row) throw new HttpError(404, 'Profile not found.');

      const [links, playlists, artistRows, favCount] = await Promise.all([
        listLinks('user', row.id),
        db.query(
          `SELECT p.id, p.slug, p.title, p.description, p.like_count, p.updated_at,
                  (SELECT count(*) FROM playlist_tracks pt WHERE pt.playlist_id = p.id) AS track_count
             FROM playlists p
            WHERE p.owner_id = $1 AND p.is_public
            ORDER BY p.updated_at DESC LIMIT 24`,
          [row.id],
        ),
        db.query(
          `SELECT a.id, a.slug, a.name, a.image_url, a.location, a.source_type,
                  (SELECT count(*) FROM tracks t WHERE t.artist_id = a.id AND t.status = 'published') AS track_count
             FROM artists a
            WHERE a.user_id = $1 AND a.status IN ('published', 'unlisted')
            ORDER BY a.created_at LIMIT 4`,
          [row.id],
        ),
        db.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM favorites WHERE user_id = $1`, [row.id],
        ),
      ]);

      res.setHeader('Cache-Control', 'public, max-age=30');
      res.json({
        profile: serializeProfile(row, links),
        stats: {
          publicPlaylists: playlists.length,
          favorites: Number(favCount[0]?.n ?? 0),
        },
        playlists: playlists.map((p: any) => ({
          id: p.id, slug: p.slug, title: p.title, description: p.description,
          likeCount: Number(p.like_count), trackCount: Number(p.track_count),
          isPublic: true, updatedAt: p.updated_at,
        })),
        artists: artistRows.map((a: any) => ({
          id: a.id, slug: a.slug, name: a.name, imageUrl: a.image_url,
          location: a.location, sourceType: a.source_type,
          trackCount: Number(a.track_count),
        })),
      });
    }),
  );

  return r;
}
