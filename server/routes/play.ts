/**
 * Server-side playback resolution.
 *
 * The client never plays straight from database fields. It asks
 * GET /api/play/:trackId and receives a resolved playback descriptor -
 * which lets the server enforce content state (taken_down/archived),
 * streaming permission, source availability and, later, signed CDN URLs,
 * without any client changes.
 *
 * Response shapes:
 *   { mode: 'stream',   url, mimeType, sourceType }
 *   { mode: 'external', url, label,    sourceType }   // official external playback
 *   404/451-style errors when playback is not permitted
 */
import { Router } from 'express';
import { getDb } from '../db/index.ts';
import { asyncRoute, HttpError } from '../util/http.ts';

const UUID_RE = /^[0-9a-f-]{36}$/;

interface SourceRow {
  source_type: 'original_hosted' | 'community_hosted' | 'remote' | 'external';
  kind: string;
  url: string;
  object_key: string | null;
  mime_type: string | null;
  availability: string;
  provider: string;
  priority: number;
}

/**
 * Turn a track_sources row into a playable URL.
 * Hosted sources may be stored as an object key; today that maps onto the
 * local /media path, in production onto object storage / CDN (optionally a
 * signed URL) - this is the single place that mapping lives.
 */
function urlForSource(s: SourceRow): string {
  if ((s.source_type === 'original_hosted' || s.source_type === 'community_hosted') && s.object_key) {
    const base = process.env.AUDIO_CDN_BASE ?? '/media/audio';
    return `${base}/${s.object_key}`;
  }
  return s.url;
}

export function playRouter(): Router {
  const r = Router();

  r.get(
    '/:trackId',
    asyncRoute(async (req, res) => {
      const trackId = String(req.params.trackId);
      if (!UUID_RE.test(trackId)) throw new HttpError(400, 'Bad track id.');
      const db = await getDb();
      const trackRows = await db.query<{
        status: string; streaming_permission: boolean; source_type: string;
        artist_status: string; album_status: string | null;
      }>(
        `SELECT t.status, t.streaming_permission, t.source_type,
                a.status AS artist_status, al.status AS album_status
           FROM tracks t
           JOIN artists a ON a.id = t.artist_id
           LEFT JOIN albums al ON al.id = t.album_id
          WHERE t.id = $1`,
        [trackId],
      );
      const track = trackRows[0];
      if (!track) throw new HttpError(404, 'Track not found.');

      // Only genuinely available catalog entries resolve. Unlisted tracks stay
      // playable from a direct link; withdrawn ones - including tracks whose
      // artist or release was withdrawn - never do.
      const withdrawn = (status: string | null | undefined) =>
        status === 'taken_down' || status === 'archived';
      if (track.status !== 'published' && track.status !== 'unlisted') {
        throw new HttpError(410, 'This track is no longer available.');
      }
      if (withdrawn(track.artist_status) || withdrawn(track.album_status)) {
        throw new HttpError(410, 'This track is no longer available.');
      }
      if (!track.streaming_permission) {
        throw new HttpError(403, 'Streaming is not permitted for this track.');
      }

      const sources = await db.query<SourceRow>(
        `SELECT source_type, kind, url, object_key, mime_type, availability, provider, priority
           FROM track_sources WHERE track_id = $1 AND availability = 'available'
          ORDER BY priority`,
        [trackId],
      );
      for (const s of sources) {
        if (s.kind === 'direct_url') {
          res.setHeader('Cache-Control', 'private, max-age=30');
          return void res.json({
            mode: 'stream',
            url: urlForSource(s),
            mimeType: s.mime_type,
            sourceType: s.source_type,
            trackSourceType: track.source_type,
          });
        }
        if (s.kind === 'external_link' || s.kind === 'embed') {
          return void res.json({
            mode: 'external',
            url: s.url,
            label:
              s.provider === 'youtube' ? 'Watch on YouTube'
                : s.provider === 'soundcloud' ? 'Listen on SoundCloud'
                  : 'Open source',
            sourceType: s.source_type,
            trackSourceType: track.source_type,
          });
        }
      }
      throw new HttpError(404, 'No playable source for this track.');
    }),
  );

  return r;
}
