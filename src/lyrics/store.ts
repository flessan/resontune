/**
 * Local lyrics storage. Two strictly separate namespaces:
 *
 *  - `resontune-lyrics-overrides`  the user's own edits. Personal, local,
 *    permanent until reset. NEVER sent to ResonTune servers or LRCLIB,
 *    never synced, never mixed with fetched data.
 *  - `resontune-lyrics-cache`      recently fetched LRCLIB results, so a
 *    track does not re-hit the network on every open. Bounded, disposable,
 *    and a cache entry is never treated as a user edit.
 *
 * Both parse defensively: corrupt JSON or a corrupt entry degrades to
 * "nothing stored", never to a crash.
 */

export const OVERRIDES_KEY = 'resontune-lyrics-overrides';
export const CACHE_KEY = 'resontune-lyrics-cache';

/** Newest-first cap on cached LRCLIB results (localStorage stays bounded). */
export const CACHE_LIMIT = 40;
/** Cached "no lyrics found" answers expire so new uploads can appear. */
export const NEGATIVE_TTL_MS = 24 * 60 * 60 * 1000;

export interface LyricsOverride {
  version: 1;
  updatedAt: number;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

export interface LyricsCacheEntry {
  version: 1;
  fetchedAt: number;
  found: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

/**
 * Deterministic per-track identity for lyric storage. Remote tracks key on
 * the ResonTune track id; local files on the local library id. The origin
 * prefix keeps the two spaces from ever colliding.
 */
export function lyricsTrackKey(item: { origin: 'remote' | 'local'; id: string }): string {
  return `${item.origin}:${item.id}`;
}

function readMap<T>(key: string): Record<string, T> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, T>;
    }
  } catch {
    /* corrupt storage → behave as empty */
  }
  return {};
}

function writeMap<T>(key: string, map: Record<string, T>): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(map));
    return true;
  } catch {
    // Quota exceeded / storage disabled: lyrics editing degrades, the
    // app must not.
    return false;
  }
}

function asText(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/* ------------------------------- overrides ------------------------------ */

function validOverride(v: unknown): LyricsOverride | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const plainLyrics = asText(o.plainLyrics);
  const syncedLyrics = asText(o.syncedLyrics);
  if (!plainLyrics && !syncedLyrics) return null; // an empty override is no override
  return {
    version: 1,
    updatedAt: typeof o.updatedAt === 'number' ? o.updatedAt : 0,
    plainLyrics,
    syncedLyrics,
  };
}

export function getOverride(trackKey: string): LyricsOverride | null {
  return validOverride(readMap<unknown>(OVERRIDES_KEY)[trackKey]);
}

export function saveOverride(
  trackKey: string,
  data: { plainLyrics: string | null; syncedLyrics: string | null },
): boolean {
  const entry = validOverride({ ...data, updatedAt: Date.now(), version: 1 });
  if (!entry) return removeOverride(trackKey);
  const map = readMap<unknown>(OVERRIDES_KEY);
  map[trackKey] = entry;
  return writeMap(OVERRIDES_KEY, map);
}

export function removeOverride(trackKey: string): boolean {
  const map = readMap<unknown>(OVERRIDES_KEY);
  if (!(trackKey in map)) return true;
  delete map[trackKey];
  return writeMap(OVERRIDES_KEY, map);
}

/* --------------------------------- cache -------------------------------- */

function validCacheEntry(v: unknown): LyricsCacheEntry | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.fetchedAt !== 'number' || typeof o.found !== 'boolean') return null;
  return {
    version: 1,
    fetchedAt: o.fetchedAt,
    found: o.found,
    plainLyrics: asText(o.plainLyrics),
    syncedLyrics: asText(o.syncedLyrics),
  };
}

export function getCached(trackKey: string): LyricsCacheEntry | null {
  const entry = validCacheEntry(readMap<unknown>(CACHE_KEY)[trackKey]);
  if (!entry) return null;
  // Stale negatives expire; positives are kept (lyrics rarely change).
  if (!entry.found && Date.now() - entry.fetchedAt > NEGATIVE_TTL_MS) return null;
  return entry;
}

export function putCached(
  trackKey: string,
  data: { found: boolean; plainLyrics: string | null; syncedLyrics: string | null },
): void {
  const map = readMap<unknown>(CACHE_KEY);
  const entries: [string, LyricsCacheEntry][] = [];
  for (const [k, v] of Object.entries(map)) {
    const e = validCacheEntry(v);
    if (e) entries.push([k, e]);
  }
  entries.push([trackKey, { version: 1, fetchedAt: Date.now(), ...data }]);
  // Keep the newest CACHE_LIMIT entries; the map stays bounded forever.
  entries.sort((a, b) => b[1].fetchedAt - a[1].fetchedAt);
  const bounded: Record<string, LyricsCacheEntry> = {};
  for (const [k, e] of entries.slice(0, CACHE_LIMIT)) {
    if (!(k in bounded)) bounded[k] = e;
  }
  writeMap(CACHE_KEY, bounded);
}

export function dropCached(trackKey: string): void {
  const map = readMap<unknown>(CACHE_KEY);
  if (trackKey in map) {
    delete map[trackKey];
    writeMap(CACHE_KEY, map);
  }
}
