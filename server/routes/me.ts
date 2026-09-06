/**
 * Authenticated user features: favorites, history, profile stats,
 * submissions, and export.
 */
import { Router } from 'express';
import { z } from 'zod';
import { getDb, uuid } from '../db/index.ts';
import { asyncRoute, pagination, HttpError } from '../util/http.ts';
import { requireAuth } from '../auth.ts';
import { queryTracks } from './catalog.ts';
import { validateMediaUrl } from '../util/urlSafety.ts';

const UUID_RE = /^[0-9a-f-]{36}$/;

export function meRouter(): Router {
  const r = Router();
  r.use(requireAuth);

  /* ------------------------------- favorites ------------------------------ */

  r.get(
    '/favorites',
    asyncRoute(async (req, res) => {
      const db = await getDb();
      const order = await db.query<{ track_id: string }>(
        `SELECT track_id FROM favorites WHERE user_id = $1 ORDER BY created_at DESC LIMIT 500`,
        [req.user!.id],
      );
      const ids = order.map((o) => o.track_id);
      const tracks = ids.length ? await queryTracks(`AND t.id = ANY($1)`, [ids], '') : [];
      const byId = new Map(tracks.map((t: any) => [t.id, t]));
      res.json({ tracks: ids.map((id) => byId.get(id)).filter(Boolean) });
    }),
  );

  r.get(
    '/favorites/ids',
    asyncRoute(async (req, res) => {
      const db = await getDb();
      const rows = await db.query<{ track_id: string }>(
        `SELECT track_id FROM favorites WHERE user_id = $1`, [req.user!.id],
      );
      res.json({ ids: rows.map((r) => r.track_id) });
    }),
  );

  r.post(
    '/favorites/:trackId',
    asyncRoute(async (req, res) => {
      const trackId = String(req.params.trackId);
      if (!UUID_RE.test(trackId)) throw new HttpError(400, 'Bad track id.');
      const db = await getDb();
      const found = await db.query(`SELECT 1 FROM tracks WHERE id = $1 AND status='published'`, [trackId]);
      if (!found.length) throw new HttpError(404, 'Track not found.');
      const existing = await db.query(
        `SELECT 1 FROM favorites WHERE user_id = $1 AND track_id = $2`, [req.user!.id, trackId],
      );
      if (existing.length) {
        await db.query(`DELETE FROM favorites WHERE user_id = $1 AND track_id = $2`, [req.user!.id, trackId]);
        await db.query(`UPDATE tracks SET like_count = greatest(like_count - 1, 0) WHERE id = $1`, [trackId]);
        res.json({ favorited: false });
      } else {
        await db.query(`INSERT INTO favorites (user_id, track_id) VALUES ($1, $2)`, [req.user!.id, trackId]);
        await db.query(`UPDATE tracks SET like_count = like_count + 1 WHERE id = $1`, [trackId]);
        res.json({ favorited: true });
      }
    }),
  );

  /* -------------------------------- history ------------------------------- */

  r.get(
    '/history',
    asyncRoute(async (req, res) => {
      const { limit, offset } = pagination(req, { limit: 30, max: 100 });
      const db = await getDb();
      const rows = await db.query<{ track_id: string; played_at: string }>(
        `SELECT track_id, max(played_at) AS played_at FROM play_history
          WHERE user_id = $1 GROUP BY track_id ORDER BY played_at DESC LIMIT $2 OFFSET $3`,
        [req.user!.id, limit, offset],
      );
      const ids = rows.map((r) => r.track_id);
      const tracks = ids.length ? await queryTracks(`AND t.id = ANY($1)`, [ids], '') : [];
      const byId = new Map(tracks.map((t: any) => [t.id, t]));
      res.json({
        history: rows
          .map((r) => ({ playedAt: r.played_at, track: byId.get(r.track_id) }))
          .filter((h) => h.track),
      });
    }),
  );

  /* -------------------------------- profile ------------------------------- */

  r.get(
    '/profile',
    asyncRoute(async (req, res) => {
      const db = await getDb();
      const uid = req.user!.id;
      const [plays, artists, genres, playlists, favorites] = await Promise.all([
        db.query<{ n: string }>(`SELECT count(*)::text AS n FROM play_history WHERE user_id = $1`, [uid]),
        db.query<{ n: string }>(
          `SELECT count(DISTINCT t.artist_id)::text AS n FROM play_history ph
             JOIN tracks t ON t.id = ph.track_id WHERE ph.user_id = $1`, [uid],
        ),
        db.query<{ id: string; name: string; n: string }>(
          `SELECT g.id, g.name, count(*)::text AS n FROM play_history ph
             JOIN track_genres tg ON tg.track_id = ph.track_id
             JOIN genres g ON g.id = tg.genre_id
            WHERE ph.user_id = $1 GROUP BY g.id, g.name ORDER BY count(*) DESC LIMIT 5`, [uid],
        ),
        db.query(
          `SELECT p.id, p.slug, p.title, p.is_public, p.like_count,
                  (SELECT count(*) FROM playlist_tracks pt WHERE pt.playlist_id = p.id) AS track_count
             FROM playlists p WHERE p.owner_id = $1 ORDER BY p.updated_at DESC`, [uid],
        ),
        db.query<{ n: string }>(`SELECT count(*)::text AS n FROM favorites WHERE user_id = $1`, [uid]),
      ]);
      res.json({
        stats: {
          tracksPlayed: Number(plays[0]?.n ?? 0),
          artistsDiscovered: Number(artists[0]?.n ?? 0),
          favorites: Number(favorites[0]?.n ?? 0),
          memberSince: req.user!.created_at,
        },
        topGenres: genres.map((g) => ({ id: g.id, name: g.name, plays: Number(g.n) })),
        playlists: playlists.map((p: any) => ({
          id: p.id, slug: p.slug, title: p.title, isPublic: p.is_public,
          likeCount: Number(p.like_count), trackCount: Number(p.track_count),
        })),
      });
    }),
  );

  /* ------------------------------ submissions ----------------------------- */

  const submissionSchema = z.object({
    artistName: z.string().trim().min(1).max(120),
    trackTitle: z.string().trim().min(1).max(160),
    albumTitle: z.string().trim().max(160).optional().or(z.literal('')),
    genre: z.string().trim().max(40).optional().or(z.literal('')),
    description: z.string().trim().max(1200).optional().or(z.literal('')),
    artworkUrl: z.string().trim().url().max(500).optional().or(z.literal('')),
    audioUrl: z.string().trim().url().max(500),
    lyrics: z.string().trim().max(12000).optional().or(z.literal('')),
    licenseId: z.string().trim().max(40),
    rightsHolder: z.string().trim().min(1).max(200),
    externalLinks: z.string().trim().max(1000).optional().or(z.literal('')),
    rightsConfirmed: z.literal(true, { error: 'You must confirm you have the rights to submit this music.' }),
    // Rights declarations recorded verbatim — never invented on the artist's behalf.
    streamingPermission: z.boolean().optional().default(true),
    distributionPermission: z.boolean().optional().default(false),
    rightsNotes: z.string().trim().max(600).optional().or(z.literal('')),
  });

  r.get(
    '/submissions',
    asyncRoute(async (req, res) => {
      const db = await getDb();
      const rows = await db.query(
        `SELECT id, status, payload, moderator_note, created_at, reviewed_at, resulting_track_id
           FROM submissions WHERE submitter_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [req.user!.id],
      );
      res.json({
        submissions: rows.map((s: any) => ({
          id: s.id,
          status: s.status,
          payload: typeof s.payload === 'string' ? JSON.parse(s.payload) : s.payload,
          moderatorNote: s.moderator_note,
          createdAt: s.created_at,
          reviewedAt: s.reviewed_at,
          resultingTrackId: s.resulting_track_id,
        })),
      });
    }),
  );

  r.post(
    '/submissions',
    asyncRoute(async (req, res) => {
      const parsed = submissionSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid submission.');
      }
      const db = await getDb();
      // Submission cooldown: max 5 pending, min 60s between submissions.
      const recent = await db.query<{ created_at: string }>(
        `SELECT created_at FROM submissions WHERE submitter_id = $1
          ORDER BY created_at DESC LIMIT 1`,
        [req.user!.id],
      );
      if (recent[0] && Date.now() - new Date(recent[0].created_at).getTime() < 60_000) {
        throw new HttpError(429, 'Please wait a minute between submissions.');
      }
      const pending = await db.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM submissions
          WHERE submitter_id = $1 AND status IN ('pending','reviewing')`,
        [req.user!.id],
      );
      if (Number(pending[0]?.n ?? 0) >= 5) {
        throw new HttpError(429, 'You already have 5 submissions awaiting review.');
      }
      const license = await db.query(`SELECT 1 FROM licenses WHERE id = $1`, [parsed.data.licenseId]);
      if (!license.length) throw new HttpError(400, 'Unknown license.');
      // Media URL safety: https-only, no credentials, no private/internal hosts.
      const audioErr = validateMediaUrl(parsed.data.audioUrl);
      if (audioErr) throw new HttpError(400, `Audio URL: ${audioErr}`);
      if (parsed.data.artworkUrl) {
        const artErr = validateMediaUrl(parsed.data.artworkUrl);
        if (artErr) throw new HttpError(400, `Artwork URL: ${artErr}`);
      }
      // Duplicate guard: same audio URL already pending/published by anyone.
      const dupe = await db.query(
        `SELECT 1 FROM submissions
          WHERE payload->>'audioUrl' = $1 AND status IN ('pending','reviewing','approved','published') LIMIT 1`,
        [parsed.data.audioUrl],
      );
      if (dupe.length) throw new HttpError(409, 'This audio URL has already been submitted.');
      const id = uuid();
      await db.query(
        `INSERT INTO submissions (id, submitter_id, payload) VALUES ($1, $2, $3)`,
        [id, req.user!.id, JSON.stringify(parsed.data)],
      );
      res.status(201).json({ id, status: 'pending' });
    }),
  );

  /* -------------------------------- export -------------------------------- */

  r.get(
    '/export',
    asyncRoute(async (req, res) => {
      const db = await getDb();
      const uid = req.user!.id;
      const [playlists, favorites] = await Promise.all([
        db.query(
          `SELECT p.id, p.slug, p.title, p.description, p.is_public, p.created_at FROM playlists p
            WHERE p.owner_id = $1`, [uid],
        ),
        db.query(
          `SELECT f.track_id, f.created_at, t.title, t.slug, a.name AS artist_name
             FROM favorites f JOIN tracks t ON t.id = f.track_id JOIN artists a ON a.id = t.artist_id
            WHERE f.user_id = $1`, [uid],
        ),
      ]);
      const playlistData = [] as any[];
      for (const p of playlists as any[]) {
        const items = await db.query(
          `SELECT pt.position, t.slug, t.title, a.name AS artist_name, t.duration_seconds
             FROM playlist_tracks pt JOIN tracks t ON t.id = pt.track_id
             JOIN artists a ON a.id = t.artist_id
            WHERE pt.playlist_id = $1 ORDER BY pt.position`,
          [p.id],
        );
        playlistData.push({
          title: p.title,
          slug: p.slug,
          description: p.description,
          isPublic: p.is_public,
          createdAt: p.created_at,
          tracks: (items as any[]).map((i) => ({
            position: i.position, slug: i.slug, title: i.title,
            artist: i.artist_name, duration: i.duration_seconds,
          })),
        });
      }
      res.setHeader('Content-Disposition', 'attachment; filename="resontune-export.json"');
      res.json({
        format: 'resontune-export',
        version: 1,
        exportedAt: new Date().toISOString(),
        user: { handle: req.user!.handle },
        playlists: playlistData,
        favorites: (favorites as any[]).map((f) => ({
          slug: f.slug, title: f.title, artist: f.artist_name, favoritedAt: f.created_at,
        })),
      });
    }),
  );

  return r;
}
