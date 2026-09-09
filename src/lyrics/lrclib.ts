/**
 * LRCLIB client - the one place ResonTune talks to lrclib.net.
 *
 * https://lrclib.net/docs
 *   GET /api/get?track_name&artist_name&album_name&duration  → exact match
 *   GET /api/search?track_name&artist_name                   → candidates
 *
 * Read-only. ResonTune never publishes anything to LRCLIB, and nothing
 * from these calls ever reaches ResonTune's own servers or database.
 */

export interface LrclibRecord {
  id?: number;
  trackName?: string;
  artistName?: string;
  albumName?: string;
  duration?: number;
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
}

export interface LyricsQuery {
  title: string;
  artist: string;
  album?: string | null;
  /** seconds, when known - LRCLIB matches within ±2s on /get */
  duration?: number | null;
}

const BASE = 'https://lrclib.net/api';
const HEADERS = {
  // LRCLIB politely asks clients to identify themselves.
  'Lrclib-Client': 'ResonTune (https://github.com/flessan/resontune)',
};

async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { headers: HEADERS, signal });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`LRCLIB ${res.status}`);
  return res.json();
}

function asRecord(v: unknown): LrclibRecord | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  return v as LrclibRecord;
}

/** Loose text normalization for matching: case, punctuation, whitespace. */
export function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\((feat|ft|with)\.?[^)]*\)/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * Is this candidate actually the requested song? Title and artist must
 * agree after normalization (one containing the other is fine - remaster
 * suffixes etc.), and when both durations are known they must be within
 * ±4s. Prevents "the API returned *something*" from becoming wrong lyrics.
 */
export function isRelevantMatch(query: LyricsQuery, rec: LrclibRecord): boolean {
  const qt = normalizeForMatch(query.title);
  const rt = normalizeForMatch(rec.trackName ?? '');
  const qa = normalizeForMatch(query.artist);
  const ra = normalizeForMatch(rec.artistName ?? '');
  if (!qt || !rt || !qa || !ra) return false;
  const titleOk = qt === rt || rt.includes(qt) || qt.includes(rt);
  const artistOk = qa === ra || ra.includes(qa) || qa.includes(ra);
  if (!titleOk || !artistOk) return false;
  if (
    query.duration != null && Number.isFinite(query.duration) && query.duration > 0 &&
    rec.duration != null && Number.isFinite(rec.duration) && rec.duration > 0 &&
    Math.abs(query.duration - rec.duration) > 4
  ) return false;
  return true;
}

function hasLyrics(rec: LrclibRecord): boolean {
  return Boolean(
    (typeof rec.syncedLyrics === 'string' && rec.syncedLyrics.trim()) ||
    (typeof rec.plainLyrics === 'string' && rec.plainLyrics.trim()),
  );
}

/**
 * Fetch the best lyrics record for a track. Tries the exact /get signature
 * first, then falls back to /search and picks the most relevant candidate.
 * Returns null for "no (relevant) lyrics"; throws only on network failure.
 */
export async function fetchLyrics(
  query: LyricsQuery,
  signal?: AbortSignal,
): Promise<LrclibRecord | null> {
  if (!query.title.trim() || !query.artist.trim()) return null;

  // 1. Exact signature lookup.
  const p = new URLSearchParams({
    track_name: query.title,
    artist_name: query.artist,
  });
  if (query.album) p.set('album_name', query.album);
  if (query.duration != null && Number.isFinite(query.duration) && query.duration > 0) {
    p.set('duration', String(Math.round(query.duration)));
  }
  try {
    const exact = asRecord(await getJson(`${BASE}/get?${p}`, signal));
    if (exact && !exact.instrumental && hasLyrics(exact) && isRelevantMatch(query, exact)) {
      return exact;
    }
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err;
    // fall through to search - /get 5xx should not end the attempt
  }

  // 2. Fuzzy search, filtered to genuinely relevant candidates.
  const sp = new URLSearchParams({ track_name: query.title, artist_name: query.artist });
  const found = await getJson(`${BASE}/search?${sp}`, signal);
  if (!Array.isArray(found)) return null;
  const candidates = found
    .map(asRecord)
    .filter((r): r is LrclibRecord => !!r && !r.instrumental && hasLyrics(r) && isRelevantMatch(query, r));
  if (!candidates.length) return null;
  // Prefer synced lyrics, then the closest duration.
  candidates.sort((a, b) => {
    const syncedA = a.syncedLyrics ? 0 : 1;
    const syncedB = b.syncedLyrics ? 0 : 1;
    if (syncedA !== syncedB) return syncedA - syncedB;
    const target = query.duration ?? 0;
    if (target > 0) {
      return Math.abs((a.duration ?? target) - target) - Math.abs((b.duration ?? target) - target);
    }
    return 0;
  });
  return candidates[0];
}
