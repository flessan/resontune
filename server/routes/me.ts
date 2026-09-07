/**
 * The signed-in account: profile, avatar, favorites, history, stats, export.
 *
 * Every route here is authorized from the verified session (`req.user`) —
 * ownership is never read from the request body, so a client cannot edit
 * another account by sending a different id.
 */
import { Router, raw } from 'express';
import { z } from 'zod';
import { getDb, uuid } from '../db/index.ts';
import { asyncMiddleware, asyncRoute, pagination, HttpError, ACCOUNT_GONE_MESSAGE } from '../util/http.ts';
import {
  markIdentityDeleted, requireAuth, tombstoneStatements,
  SESSION_USER_COLUMNS, publicUser, type SessionUser,
} from '../auth.ts';
import { deleteNeonAuthIdentity } from '../util/neonAuthAdmin.ts';
import { queryTracks } from './catalog.ts';
import { listLinks, replaceLinks } from '../db/links.ts';
import { PROFILE_COLUMNS, serializeProfile, type ProfileRow } from '../util/profile.ts';
import { checkUsername } from '../util/username.ts';
import { validateLinkUrl, validateMediaUrl, coerceHttps } from '../util/urlSafety.ts';
import {
  AVATAR_ALLOWED_MIME, AVATAR_MAX_BYTES, ImgbbError, imgbbConfigured,
  sniffImageMime, uploadAvatarToImgbb,
} from '../util/imgbb.ts';

const UUID_RE = /^[0-9a-f-]{36}$/;

/* --------------------------------- schemas -------------------------------- */

const linkSchema = z.object({
  provider: z.string().trim().max(30).optional().nullable(),
  label: z.string().trim().max(40).optional().nullable(),
  url: z.string().trim().min(1).max(500),
});

const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(60).optional(),
  username: z.string().trim().min(1).max(40).optional(),
  bio: z.string().trim().max(600).nullable().optional(),
  location: z.string().trim().max(80).nullable().optional(),
  websiteUrl: z.string().trim().max(500).nullable().optional(),
  links: z.array(linkSchema).max(8).optional(),
});

async function readOwnProfile(userId: string) {
  const db = await getDb();
  const rows = await db.query<ProfileRow>(
    `SELECT ${PROFILE_COLUMNS} FROM users u WHERE u.id = $1`, [userId],
  );
  if (!rows[0]) throw new HttpError(404, 'Account not found.');
  return serializeProfile(rows[0], await listLinks('user', userId));
}

export function meRouter(): Router {
  const r = Router();
  r.use(requireAuth);

  /**
   * The account may have been deleted a moment after this request was
   * authenticated — by another tab, or by another server instance. The
   * verified token alone cannot know that, so anything that writes (or
   * exports) re-checks that the account still exists and answers 401 rather
   * than writing orphans or exporting a shell. One indexed lookup, on write
   * paths only; reads and playback are untouched.
   *
   * The deletion route itself is exempt: running twice must be harmless, not
   * an error.
   */
  r.use(
    asyncMiddleware(async (req) => {
      const isDeletion = req.method === 'DELETE' && (req.path === '/' || req.path === '');
      if (req.method === 'GET' && req.path !== '/export') return;
      if (isDeletion) return;
      const db = await getDb();
      const rows = await db.query(`SELECT 1 FROM users WHERE id = $1`, [req.user!.id]);
      if (!rows.length) throw new HttpError(401, ACCOUNT_GONE_MESSAGE);
    }),
  );

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

  /* --------------------------------- account -------------------------------- */

  /** The signed-in account record (profile fields + external links). */
  r.get(
    '/',
    asyncRoute(async (req, res) => {
      res.json({ profile: await readOwnProfile(req.user!.id) });
    }),
  );

  /**
   * Edit your own profile. The account is taken from the verified session;
   * nothing in the body can change which row is written.
   */
  r.patch(
    '/profile',
    asyncRoute(async (req, res) => {
      const parsed = profileSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid profile.');
      }
      const patch = parsed.data;
      const db = await getDb();
      const uid = req.user!.id;

      /* username: normalized, validated, unique, never a reserved route */
      let handle: string | null = null;
      if (patch.username !== undefined) {
        const check = checkUsername(patch.username);
        if (!check.ok) throw new HttpError(400, check.error);
        handle = check.value;
        if (handle !== req.user!.handle) {
          const clash = await db.query(
            `SELECT 1 FROM users WHERE lower(handle) = $1 AND id <> $2`, [handle, uid],
          );
          if (clash.length) throw new HttpError(409, 'That username is already taken.');
        }
      }

      // A typed value may omit the scheme; assume https, then validate.
      if (patch.websiteUrl) {
        patch.websiteUrl = coerceHttps(patch.websiteUrl);
        const err = validateMediaUrl(patch.websiteUrl);
        if (err) throw new HttpError(400, `Website: ${err}`);
      }
      if (patch.links) {
        patch.links = patch.links.map((l) => ({ ...l, url: coerceHttps(l.url) }));
        for (const link of patch.links) {
          const err = validateLinkUrl(link.url);
          if (err) throw new HttpError(400, `Link ${link.url.slice(0, 40)}: ${err}`);
        }
      }

      const sets: string[] = [];
      const params: unknown[] = [uid];
      const set = (column: string, value: unknown) => {
        params.push(value);
        sets.push(`${column} = $${params.length}`);
      };
      if (handle) set('handle', handle);
      if (patch.displayName !== undefined) set('display_name', patch.displayName);
      if (patch.bio !== undefined) set('bio', patch.bio || null);
      if (patch.location !== undefined) set('location', patch.location || null);
      if (patch.websiteUrl !== undefined) set('website_url', patch.websiteUrl || null);
      if (sets.length) {
        await db.query(
          `UPDATE users SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, params,
        );
      }
      if (patch.links) await replaceLinks('user', uid, patch.links);

      const fresh = await db.query<SessionUser>(
        `SELECT ${SESSION_USER_COLUMNS} FROM users WHERE id = $1`, [uid],
      );
      res.json({
        profile: await readOwnProfile(uid),
        user: fresh[0] ? publicUser({ ...fresh[0], role: req.user!.role }) : null,
      });
    }),
  );

  /** Username availability, for live feedback in the profile editor. */
  r.get(
    '/username-available',
    asyncRoute(async (req, res) => {
      const check = checkUsername(String(req.query.username ?? ''));
      if (!check.ok) return void res.json({ available: false, reason: check.error, username: null });
      if (check.value === req.user!.handle) {
        return void res.json({ available: true, reason: null, username: check.value });
      }
      const db = await getDb();
      const clash = await db.query(
        `SELECT 1 FROM users WHERE lower(handle) = $1 AND id <> $2`, [check.value, req.user!.id],
      );
      res.json({
        available: !clash.length,
        reason: clash.length ? 'That username is already taken.' : null,
        username: check.value,
      });
    }),
  );

  /* --------------------------- avatar (ImgBB only) -------------------------- */

  /**
   * Upload a profile photo.
   *
   * The browser POSTs the raw image bytes with an image/* content type; the
   * server validates size and real file type (magic bytes, not just the
   * header), forwards it to ImgBB using the server-side IMGBB_API_KEY, and
   * stores only the resulting URL. The key never reaches the client and no
   * image data is written to the database.
   */
  const rawAvatarBody = raw({ type: () => true, limit: AVATAR_MAX_BYTES });

  r.post(
    '/avatar',
    // Translate the body parser's own limit error into the same 413 the
    // explicit size check produces, so oversized files never surface as 500s.
    (req, res, next) => rawAvatarBody(req, res, (err?: unknown) => {
      if (err && typeof err === 'object' && (err as { type?: string }).type === 'entity.too.large') {
        return next(new HttpError(413, 'Image is larger than 4 MB.'));
      }
      next(err as Error | undefined);
    }),
    asyncRoute(async (req, res) => {
      if (!imgbbConfigured()) {
        throw new HttpError(503, 'Profile photo uploads are not configured on this deployment.');
      }
      const declared = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
      if (!AVATAR_ALLOWED_MIME.includes(declared as never)) {
        throw new HttpError(415, 'Use a JPEG, PNG, WebP or GIF image.');
      }
      const body = req.body;
      if (!Buffer.isBuffer(body) || !body.length) throw new HttpError(400, 'No image received.');
      if (body.length > AVATAR_MAX_BYTES) throw new HttpError(413, 'Image is larger than 4 MB.');
      const sniffed = sniffImageMime(body);
      if (!sniffed) throw new HttpError(415, 'That file is not a supported image.');
      if (sniffed !== declared) {
        throw new HttpError(415, 'The file contents do not match the image type.');
      }

      try {
        const uploaded = await uploadAvatarToImgbb(body, `resontune-${req.user!.handle}`);
        const db = await getDb();
        await db.query(
          `UPDATE users SET avatar_url = $2, avatar_thumb_url = $3, avatar_provider_id = $4,
                            avatar_source = 'imgbb', avatar_updated_at = now(), updated_at = now()
            WHERE id = $1`,
          [req.user!.id, uploaded.url, uploaded.thumbUrl, uploaded.id],
        );
        res.json({ avatarUrl: uploaded.url, avatarThumbUrl: uploaded.thumbUrl });
      } catch (err) {
        if (err instanceof ImgbbError) throw new HttpError(err.status, err.message);
        throw err;
      }
    }),
  );

  /** Remove the profile photo (falls back to initials everywhere). */
  r.delete(
    '/avatar',
    asyncRoute(async (req, res) => {
      const db = await getDb();
      await db.query(
        `UPDATE users SET avatar_url = NULL, avatar_thumb_url = NULL, avatar_provider_id = NULL,
                          avatar_source = NULL, avatar_updated_at = now(), updated_at = now()
          WHERE id = $1`,
        [req.user!.id],
      );
      res.json({ avatarUrl: null, avatarThumbUrl: null });
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
        profile: await readOwnProfile(uid),
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

  /* -------------------------------- export --------------------------------
   *
   * Everything ResonTune holds about the signed-in account, in one JSON
   * file, always scoped to `req.user.id` — the request cannot name another
   * account. Deliberately excluded (and stated in the file itself):
   * credentials, the Neon Auth subject identifier, other people's data and
   * server-side operational logs.
   */

  const EXPORT_HISTORY_LIMIT = 10_000;

  r.get(
    '/export',
    asyncRoute(async (req, res) => {
      const db = await getDb();
      const uid = req.user!.id;

      const [profile, playlists, favorites, likedPlaylists, history, artists] = await Promise.all([
        readOwnProfile(uid),
        db.query(
          `SELECT p.id, p.slug, p.title, p.description, p.is_public, p.created_at, p.updated_at
             FROM playlists p WHERE p.owner_id = $1 ORDER BY p.created_at`, [uid],
        ),
        db.query(
          `SELECT f.track_id, f.created_at, t.title, t.slug, a.name AS artist_name
             FROM favorites f JOIN tracks t ON t.id = f.track_id JOIN artists a ON a.id = t.artist_id
            WHERE f.user_id = $1 ORDER BY f.created_at`, [uid],
        ),
        db.query(
          `SELECT pl.slug, pl.title, pl.is_public, l.created_at
             FROM playlist_likes l JOIN playlists pl ON pl.id = l.playlist_id
            WHERE l.user_id = $1 ORDER BY l.created_at`, [uid],
        ),
        db.query(
          `SELECT ph.played_at, t.slug, t.title, a.name AS artist_name
             FROM play_history ph JOIN tracks t ON t.id = ph.track_id
             JOIN artists a ON a.id = t.artist_id
            WHERE ph.user_id = $1 ORDER BY ph.played_at DESC LIMIT $2`,
          [uid, EXPORT_HISTORY_LIMIT],
        ),
        db.query(
          `SELECT a.slug, a.name FROM artists a WHERE a.user_id = $1 ORDER BY a.created_at`, [uid],
        ),
      ]);

      const playlistData = [] as unknown[];
      for (const p of playlists as any[]) {
        const items = await db.query(
          `SELECT pt.position, pt.added_at, t.slug, t.title, a.name AS artist_name, t.duration_seconds
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
          updatedAt: p.updated_at,
          tracks: (items as any[]).map((i) => ({
            position: i.position, slug: i.slug, title: i.title,
            artist: i.artist_name, duration: i.duration_seconds, addedAt: i.added_at,
          })),
        });
      }

      res.setHeader('Content-Disposition', 'attachment; filename="resontune-export.json"');
      res.json({
        format: 'resontune-export',
        version: 2,
        exportedAt: new Date().toISOString(),
        account: {
          id: profile.id,
          username: profile.username,
          displayName: profile.displayName,
          bio: profile.bio,
          location: profile.location,
          websiteUrl: profile.websiteUrl,
          avatarUrl: profile.avatarUrl,
          avatarThumbUrl: profile.avatarThumbUrl,
          role: profile.role,
          joinedAt: profile.joinedAt,
          links: profile.links,
        },
        playlists: playlistData,
        favorites: (favorites as any[]).map((f) => ({
          slug: f.slug, title: f.title, artist: f.artist_name, favoritedAt: f.created_at,
        })),
        likedPlaylists: (likedPlaylists as any[]).map((p) => ({
          slug: p.slug, title: p.title, isPublic: p.is_public, likedAt: p.created_at,
        })),
        listeningHistory: (history as any[]).map((h) => ({
          playedAt: h.played_at, slug: h.slug, title: h.title, artist: h.artist_name,
        })),
        // Catalog pages this account is credited on. The pages themselves
        // belong to the catalog, not to the account.
        linkedArtistPages: (artists as any[]).map((a) => ({ slug: a.slug, name: a.name })),
        // Everything named here is genuinely absent from the payload above.
        notIncluded: [
          'Authentication credentials and the Neon Auth identity — email address, password and the '
            + 'provider subject id are held by Neon Auth, and the subject id is never exported.',
          'Other people\u2019s data. Playlists you liked are listed as a reference (title, link, when '
            + 'you liked it); the tracks inside someone else\u2019s playlist are theirs, not yours.',
          'Catalog records (artists, releases, tracks) — public data maintained by ResonTune editors. '
            + 'Your playlists and favorites reference them by slug and title.',
          'Avatar image bytes: the profile photo lives at the image host, and only its URL is stored '
            + 'and exported.',
          'Moderation and editorial audit records, and the anonymous play counter, which has no user '
            + 'column to select on.',
          'Music you added from your own device: it never leaves your browser, so ResonTune has no copy.',
          `Listening history beyond the most recent ${EXPORT_HISTORY_LIMIT.toLocaleString('en-US')} plays.`,
        ],
      });
    }),
  );

  /* ---------------------------- listening history --------------------------- */

  /** Erase your own listening history. Anonymous play counts are unaffected. */
  r.delete(
    '/history',
    asyncRoute(async (req, res) => {
      const db = await getDb();
      await db.query(`DELETE FROM play_history WHERE user_id = $1`, [req.user!.id]);
      res.json({ cleared: true });
    }),
  );

  /* ---------------------------- account deletion ---------------------------- */

  /**
   * Delete the signed-in account's ResonTune data, then the sign-in identity
   * when this deployment can.
   *
   * Deliberate by construction: the request must repeat the account's own
   * username. Scope is the account and the things it owns — playlists,
   * favorites, likes, listening history, profile links. Shared catalog
   * records are never removed: an artist page linked to this account keeps
   * existing with its `user_id` cleared (ON DELETE SET NULL), and the same
   * is true of curator/moderation references, which stay as anonymous audit
   * trail. Nothing here touches another account's rows.
   *
   * Everything destructive happens in one transaction, and the tombstone is
   * written inside it: there is no instant at which the account row is gone
   * while the refusal of its still-valid tokens is missing. A second,
   * concurrent delete finds nothing to remove and answers the same way
   * instead of failing.
   *
   * The identity half is attempted here only when the operator configured a
   * Neon administrative credential (see server/util/neonAuthAdmin.ts).
   * Otherwise it stays what it always was: the browser's own self-service
   * request, made from the user's own Neon Auth session — and the response
   * says plainly which of the two happened.
   */
  r.delete(
    '/',
    asyncRoute(async (req, res) => {
      const uid = req.user!.id;
      const handle = req.user!.handle;
      const confirm = String(
        (req.body as { confirm?: unknown } | undefined)?.confirm ?? req.query.confirm ?? '',
      ).trim().toLowerCase();
      if (confirm !== handle.toLowerCase()) {
        throw new HttpError(400, `Type your username (${handle}) to confirm deletion.`);
      }

      const db = await getDb();

      // The provider subject, read before the row goes away, so the identity
      // can be addressed after the account no longer exists.
      const subjectRows = await db.query<{ auth_subject: string | null }>(
        `SELECT auth_subject FROM users WHERE id = $1`, [uid],
      );
      const subject = subjectRows[0]?.auth_subject ?? null;

      const results = await db.transaction<{ id: string }>([
        // Tombstone first — inside the transaction, derived from the row
        // itself, so it can never name anyone else's identity.
        ...tombstoneStatements(uid),
        // Public counters are derived numbers, not history: keep them honest
        // before the owning rows disappear.
        {
          text: `UPDATE tracks SET like_count = greatest(like_count - 1, 0)
                  WHERE id IN (SELECT track_id FROM favorites WHERE user_id = $1)`,
          params: [uid],
        },
        {
          text: `UPDATE playlists SET like_count = greatest(like_count - 1, 0)
                  WHERE id IN (SELECT playlist_id FROM playlist_likes WHERE user_id = $1)`,
          params: [uid],
        },
        // entity_links is a polymorphic table with no foreign key to users.
        {
          text: `DELETE FROM entity_links WHERE entity_kind = 'user' AND entity_id = $1`,
          params: [uid],
        },
        // The row itself. Every other reference is either ON DELETE CASCADE
        // (things the account owns) or ON DELETE SET NULL (shared records).
        { text: `DELETE FROM users WHERE id = $1 RETURNING id`, params: [uid] },
      ]);
      /** False when a concurrent request had already deleted this account. */
      const removedNow = (results[results.length - 1] ?? []).length > 0;

      if (subject) markIdentityDeleted(subject);

      const identity = await deleteNeonAuthIdentity(subject ?? '');
      const identityDeleted = identity.deleted;

      res.json({
        deleted: true,
        alreadyDeleted: !removedNow,
        scope: identityDeleted ? 'resontune-application-data-and-identity' : 'resontune-application-data',
        deletedData: [
          'profile (display name, username, bio, location, website, avatar URL, profile links)',
          'playlists and their contents',
          'favorites and playlist likes',
          'listening history',
          ...(identityDeleted ? ['your Neon Auth sign-in identity, including the email address it held'] : []),
        ],
        retainedData: [
          'catalog records you are credited on — the artist page, releases and tracks stay published with the link to your account cleared',
          'moderation and editorial records, with the account reference cleared',
          'anonymous play counts, which never referenced your account',
          'database backups, until the provider\u2019s retention window passes',
          ...(identityDeleted ? [] : ['your Neon Auth sign-in identity and its email address, until it is deleted at the provider']),
        ],
        identity: {
          provider: 'neon-auth',
          status: identity.status,
          deletedByServer: identityDeleted,
          /** The browser's own self-service attempt is still worth making. */
          clientShouldAttempt: !identityDeleted,
          reason: identity.detail,
        },
        note:
          'Your ResonTune data has been deleted. Tokens issued before now are refused by every '
          + 'instance of this server, so nothing recreates the account behind your back; signing in '
          + 'again with the same identity creates a new, empty ResonTune account.',
      });
    }),
  );

  return r;
}
