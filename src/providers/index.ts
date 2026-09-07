/**
 * Playback source resolution.
 *
 * Remote catalog tracks are resolved through the server -
 * GET /api/play/:trackId - which enforces content state (takedowns),
 * streaming permission and source availability, and maps hosted object keys
 * onto storage/CDN URLs. The client never derives playback URLs from raw
 * database fields, so storage can move (S3/R2/signed URLs) without touching
 * the player.
 *
 * Local device files are a separate world: they resolve to session-scoped
 * object URLs and never leave the device.
 *
 * External services (YouTube, SoundCloud, …) are only ever handled through
 * permitted mechanisms - the server returns { mode: 'external' } with an
 * official link, never a scraped or proxied stream.
 */
import type { Track, QueueItem, LocalTrack, PlayResolution } from '@/lib/types';
import { api, ApiError } from '@/lib/api';
import { getLocalBlob, getLocalArtwork } from '@/local/db';

export type Resolution =
  | { type: 'stream'; url: string; mimeType?: string | null }
  | { type: 'external'; url: string; label: string }
  | { type: 'unavailable'; reason: string };

/** Ask the server how (and whether) a catalog track may be played. */
export async function resolveRemotePlayback(trackId: string): Promise<Resolution> {
  try {
    const r = await api.get<PlayResolution>(`/play/${trackId}`);
    if (r.mode === 'stream') return { type: 'stream', url: r.url, mimeType: r.mimeType };
    return { type: 'external', url: r.url, label: r.label };
  } catch (err) {
    // Map failures to calm, human copy; technical details stay in the console.
    console.warn('[player] playback resolution failed', err);
    let reason = 'This track is temporarily unavailable. Try again in a moment.';
    if (err instanceof ApiError) {
      if (err.status === 404) reason = 'This track is no longer available.';
      else if (err.status === 410) reason = 'This track was removed at the rights holder’s request.';
      else if (err.status === 403) reason = 'This track can’t be played from this source.';
      else if (err.status >= 400 && err.status < 500 && err.message) reason = err.message;
    } else if (err instanceof TypeError) {
      reason = 'You appear to be offline. Reconnect and try again.';
    }
    return { type: 'unavailable', reason };
  }
}

/* ------------------------------ queue building ---------------------------- */

export function trackToQueueItem(track: Track): QueueItem | null {
  const playable = (track.sources ?? []).some(
    (s) => s.availability !== 'unavailable',
  );
  if (!playable) return null;
  return {
    queueId: crypto.randomUUID(),
    origin: 'remote',
    id: track.id,
    title: track.title,
    artistName: track.artist.name,
    artistSlug: track.artist.slug,
    trackSlug: track.slug,
    albumTitle: track.album?.title ?? null,
    albumSlug: track.album?.slug ?? null,
    artworkUrl: track.artworkUrl,
    duration: track.duration,
    sourceType: track.sourceType,
  };
}

/** Local provider: resolve device files into object URLs on demand. */
const objectUrlCache = new Map<string, string>();

export async function resolveLocalSrc(localId: string): Promise<string | null> {
  const cached = objectUrlCache.get(localId);
  if (cached) return cached;
  const blob = await getLocalBlob(localId);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  // Keep the cache bounded: revoke oldest beyond 12 entries.
  if (objectUrlCache.size >= 12) {
    const first = objectUrlCache.keys().next().value as string | undefined;
    if (first) {
      URL.revokeObjectURL(objectUrlCache.get(first)!);
      objectUrlCache.delete(first);
    }
  }
  objectUrlCache.set(localId, url);
  return url;
}

const artworkUrlCache = new Map<string, string>();

export async function resolveLocalArtworkUrl(localId: string): Promise<string | null> {
  const cached = artworkUrlCache.get(localId);
  if (cached) return cached;
  const blob = await getLocalArtwork(localId);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  artworkUrlCache.set(localId, url);
  return url;
}

export function localTrackToQueueItem(t: LocalTrack, artworkUrl: string | null): QueueItem {
  return {
    queueId: crypto.randomUUID(),
    origin: 'local',
    id: t.id,
    title: t.title,
    artistName: t.artist,
    albumTitle: t.album,
    artworkUrl,
    duration: t.duration,
    mimeType: t.mimeType,
  };
}
