/**
 * The lyrics resolver - ResonTune's single source of lyrics truth.
 *
 *   Track metadata
 *        ↓
 *   local override?  ──yes──►  the user's own edit (this browser only)
 *        │no
 *   local cache?     ──yes──►  the cached LRCLIB result
 *        │no
 *   LRCLIB (client-side fetch, read-only)
 *        ↓
 *   Normalized ResolvedLyrics
 *
 * Lyrics are NEVER stored in or served from ResonTune's database. User
 * edits are NEVER transmitted anywhere. In-flight requests are deduped per
 * track so several views of the same song share one network call.
 */
import { fetchLyrics, type LyricsQuery } from './lrclib';
import { parseLrc, type LyricLine } from './lrc';
import {
  getCached,
  getOverride,
  lyricsTrackKey,
  putCached,
  removeOverride,
  saveOverride,
  dropCached,
} from './store';

export type LyricsSource = 'lrclib' | 'local';

export interface ResolvedLyrics {
  source: LyricsSource;
  /** true when synced timestamps are available (lines is non-empty) */
  synced: boolean;
  /** parsed, time-sorted lines - empty for plain lyrics */
  lines: LyricLine[];
  /** the raw LRC text when synced (preserved for editing) */
  syncedRaw: string | null;
  /** plain text body - always present (derived from synced when needed) */
  plain: string;
}

export interface LyricsTrackRef {
  origin: 'remote' | 'local';
  id: string;
  title: string;
  artistName: string;
  albumTitle?: string | null;
  duration?: number | null;
}

function normalize(
  source: LyricsSource,
  plainLyrics: string | null,
  syncedLyrics: string | null,
): ResolvedLyrics | null {
  const lines = parseLrc(syncedLyrics);
  const synced = lines.length > 0;
  const plain = plainLyrics?.trim()
    ? plainLyrics
    : synced ? lines.map((l) => l.text).join('\n') : '';
  if (!plain.trim() && !synced) return null;
  return {
    source,
    synced,
    lines,
    syncedRaw: synced ? syncedLyrics : null,
    plain,
  };
}

const inflight = new Map<string, Promise<ResolvedLyrics | null>>();

/**
 * Resolve lyrics for a track. Override → cache → LRCLIB. Network failures
 * resolve to null (the player just shows no lyrics); they are not cached,
 * so the next visit retries.
 */
export function resolveLyrics(track: LyricsTrackRef, signal?: AbortSignal): Promise<ResolvedLyrics | null> {
  const key = lyricsTrackKey(track);

  const override = getOverride(key);
  if (override) {
    return Promise.resolve(normalize('local', override.plainLyrics, override.syncedLyrics));
  }

  const cached = getCached(key);
  if (cached) {
    return Promise.resolve(cached.found ? normalize('lrclib', cached.plainLyrics, cached.syncedLyrics) : null);
  }

  const existing = inflight.get(key);
  if (existing) return existing;

  const query: LyricsQuery = {
    title: track.title,
    artist: track.artistName,
    album: track.albumTitle ?? null,
    duration: track.duration ?? null,
  };
  const job = (async (): Promise<ResolvedLyrics | null> => {
    try {
      const rec = await fetchLyrics(query, signal);
      const plainLyrics = typeof rec?.plainLyrics === 'string' ? rec.plainLyrics : null;
      const syncedLyrics = typeof rec?.syncedLyrics === 'string' ? rec.syncedLyrics : null;
      const result = rec ? normalize('lrclib', plainLyrics, syncedLyrics) : null;
      putCached(key, {
        found: result != null,
        plainLyrics: result ? plainLyrics : null,
        syncedLyrics: result ? syncedLyrics : null,
      });
      return result;
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') throw err;
      // Network / provider failure: no lyrics this time, no negative cache.
      return null;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, job);
  return job;
}

/**
 * Save a personal edit for this track. localStorage only - never sent to
 * ResonTune or LRCLIB. Returns the resolved local version (or null when
 * the edit emptied the lyrics, which removes the override).
 */
export function saveLocalLyrics(
  track: LyricsTrackRef,
  edit: { plain: string; syncedRaw: string | null },
): ResolvedLyrics | null {
  const key = lyricsTrackKey(track);
  const syncedLyrics = edit.syncedRaw?.trim() ? edit.syncedRaw : null;
  const plainLyrics = edit.plain.trim() ? edit.plain : null;
  saveOverride(key, { plainLyrics, syncedLyrics });
  return normalize('local', plainLyrics, syncedLyrics);
}

/**
 * Reset to LRCLIB: delete the local override (and the cached copy, so the
 * next resolve fetches fresh) and return the remote lyrics.
 */
export async function resetLocalLyrics(track: LyricsTrackRef): Promise<ResolvedLyrics | null> {
  const key = lyricsTrackKey(track);
  removeOverride(key);
  dropCached(key);
  return resolveLyrics(track);
}

export function hasLocalLyrics(track: LyricsTrackRef): boolean {
  return getOverride(lyricsTrackKey(track)) != null;
}
