/**
 * Cross-source discovery for ResonTune.
 * Queries public metadata APIs and provides official search links where direct APIs are unavailable.
 * This layer does not scrape service pages or resolve protected audio streams.
 */
export interface ProviderSearchLink { id: string; label: string; description: string; url: string }
export interface ExternalRecording {
  id: string; title: string; artist: string; release: string | null;
  releaseDate: string | null; durationSeconds: number | null; url: string; provider: 'musicbrainz';
}
export interface LastFmTrack {
  id: string; title: string; artist: string; album: string | null; artworkUrl: string | null;
  listeners: number | null; durationSeconds: number | null; url: string; provider: 'lastfm';
}
export interface MusicDiscoveryResponse {
  query: string; sources: ProviderSearchLink[];
  musicBrainz: { status: 'ok' | 'unavailable'; recordings: ExternalRecording[] };
  lastFm: { status: 'ok' | 'unavailable' | 'not-configured'; tracks: LastFmTrack[] };
}
interface MusicBrainzRecording {
  id?: string; title?: string; length?: number;
  'artist-credit'?: Array<{ name?: string; joinphrase?: string; artist?: { name?: string } } | string>;
  releases?: Array<{ title?: string; date?: string }>;
}
interface LastFmPayload {
  name?: string; artist?: string | { name?: string }; url?: string; mbid?: string;
  duration?: string | number; listeners?: string | number;
  image?: Array<{ '#text'?: string }>; album?: { title?: string };
}
interface CacheEntry { expiresAt: number; value: MusicDiscoveryResponse }
interface Options { lastFmApiKey?: string; fetcher?: typeof fetch }
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 45_000;
let musicBrainzQueue: Promise<unknown> = Promise.resolve();
let lastMusicBrainzRequestAt = 0;

export function buildProviderSearchLinks(rawQuery: string): ProviderSearchLink[] {
  const q = rawQuery.trim();
  const encoded = encodeURIComponent(q);
  const lastFm = new URL('https://www.last.fm/search');
  lastFm.searchParams.set('q', q);
  const discogs = new URL('https://www.discogs.com/search/');
  discogs.searchParams.set('q', q);
  discogs.searchParams.set('type', 'all');
  return [
    { id: 'youtube-music', label: 'YouTube Music', description: 'Find tracks and music videos', url: 'https://music.youtube.com/search?q=' + encoded },
    { id: 'soundcloud', label: 'SoundCloud', description: 'Discover independent artists and mixes', url: 'https://soundcloud.com/search/sounds?q=' + encoded },
    { id: 'bandcamp', label: 'Bandcamp', description: 'Explore releases and support artists', url: 'https://bandcamp.com/search?q=' + encoded },
    { id: 'youtube', label: 'YouTube', description: 'Find official videos and performances', url: 'https://www.youtube.com/results?search_query=' + encoded },
    { id: 'lastfm', label: 'Last.fm', description: 'Explore listening stats and similar artists', url: lastFm.toString() },
    { id: 'discogs', label: 'Discogs', description: 'Explore editions, releases and credits', url: discogs.toString() },
    { id: 'genius', label: 'Genius', description: 'Search lyrics and annotations', url: 'https://genius.com/search?q=' + encoded },
  ];
}

function numeric(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function normalizeMusicBrainzRecording(r: MusicBrainzRecording): ExternalRecording | null {
  if (!r.id || !r.title?.trim()) return null;
  const artist = (r['artist-credit'] ?? []).map((credit) => {
    if (typeof credit === 'string') return credit;
    return (credit.name ?? credit.artist?.name ?? '') + (credit.joinphrase ?? '');
  }).join('').trim() || 'Unknown artist';
  const release = r.releases?.[0];
  const lengthMs = numeric(r.length);
  return {
    id: r.id, title: r.title.trim(), artist,
    release: release?.title?.trim() || null, releaseDate: release?.date?.slice(0, 10) || null,
    durationSeconds: lengthMs === null ? null : Math.round(lengthMs / 1000),
    url: 'https://musicbrainz.org/recording/' + encodeURIComponent(r.id), provider: 'musicbrainz',
  };
}

export function normalizeLastFmTrack(t: LastFmPayload): LastFmTrack | null {
  if (!t.name?.trim()) return null;
  const artist = typeof t.artist === 'string' ? t.artist : t.artist?.name;
  const artworkUrl = [...(t.image ?? [])].reverse().find((i) => {
    try { return Boolean(i['#text'] && new URL(i['#text']).protocol === 'https:'); }
    catch { return false; }
  })?.['#text'] ?? null;
  const rawDuration = numeric(t.duration);
  const durationSeconds = rawDuration === null || rawDuration === 0 ? null : Math.round(rawDuration >= 10_000 ? rawDuration / 1000 : rawDuration);
  let url = 'https://www.last.fm/';
  try {
    const parsed = new URL(t.url ?? '');
    if (parsed.protocol === 'https:' && (parsed.hostname === 'last.fm' || parsed.hostname.endsWith('.last.fm'))) url = parsed.toString();
  } catch { /* use safe default */ }
  return {
    id: t.mbid?.trim() || url + t.name.trim(), title: t.name.trim(), artist: artist?.trim() || 'Unknown artist',
    album: t.album?.title?.trim() || null, artworkUrl, listeners: numeric(t.listeners),
    durationSeconds, url, provider: 'lastfm',
  };
}

async function fetchJson<T>(url: string, fetcher: typeof fetch, headers: Record<string, string> = {}): Promise<T> {
  const response = await fetcher(url, { headers: { Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(5_500) });
  if (!response.ok) throw new Error('Metadata provider returned HTTP ' + response.status);
  return response.json() as Promise<T>;
}

/** MusicBrainz asks clients to stay at or below one request per second. */
function fetchMusicBrainz<T>(url: string, fetcher: typeof fetch): Promise<T> {
  const request = musicBrainzQueue.then(async () => {
    const waitMs = Math.max(0, 1_100 - (Date.now() - lastMusicBrainzRequestAt));
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    lastMusicBrainzRequestAt = Date.now();
    return fetchJson<T>(url, fetcher, { 'User-Agent': 'ResonTune/0.1.0 (https://github.com/flessan/resontune)' });
  });
  musicBrainzQueue = request.then(() => undefined, () => undefined);
  return request;
}

async function searchMusicBrainz(q: string, fetcher: typeof fetch): Promise<ExternalRecording[]> {
  const url = new URL('https://musicbrainz.org/ws/2/recording/');
  url.searchParams.set('query', q); url.searchParams.set('fmt', 'json'); url.searchParams.set('limit', '8');
  const payload = await fetchMusicBrainz<{ recordings?: MusicBrainzRecording[] }>(url.toString(), fetcher);
  return (payload.recordings ?? []).map(normalizeMusicBrainzRecording).filter((r): r is ExternalRecording => r !== null);
}

async function searchLastFm(q: string, key: string, fetcher: typeof fetch): Promise<LastFmTrack[]> {
  const url = new URL('https://ws.audioscrobbler.com/2.0/');
  url.searchParams.set('method', 'track.search'); url.searchParams.set('track', q);
  url.searchParams.set('api_key', key); url.searchParams.set('format', 'json'); url.searchParams.set('limit', '8');
  const payload = await fetchJson<{ results?: { trackmatches?: { track?: LastFmPayload[] | LastFmPayload } } }>(url.toString(), fetcher);
  const matches = payload.results?.trackmatches?.track;
  if (!matches) return [];
  return (Array.isArray(matches) ? matches : [matches]).map(normalizeLastFmTrack).filter((t): t is LastFmTrack => t !== null);
}

export async function searchMusicDiscovery(rawQuery: string, options: Options = {}): Promise<MusicDiscoveryResponse> {
  const query = rawQuery.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  const sources = buildProviderSearchLinks(query);
  const apiKey = options.lastFmApiKey?.trim() ?? '';
  const empty: MusicDiscoveryResponse = {
    query, sources, musicBrainz: { status: 'ok', recordings: [] },
    lastFm: { status: apiKey ? 'ok' : 'not-configured', tracks: [] },
  };
  if (query.length < 2) return empty;

  const key = query.toLocaleLowerCase('en-US') + '|lastfm:' + Boolean(apiKey);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return { ...cached.value, query, sources };
  const fetcher = options.fetcher ?? fetch;
  const [mb, lf] = await Promise.allSettled([
    searchMusicBrainz(query, fetcher),
    apiKey ? searchLastFm(query, apiKey, fetcher) : Promise.resolve([] as LastFmTrack[]),
  ]);
  const result: MusicDiscoveryResponse = {
    query, sources,
    musicBrainz: mb.status === 'fulfilled' ? { status: 'ok', recordings: mb.value } : { status: 'unavailable', recordings: [] },
    lastFm: !apiKey ? { status: 'not-configured', tracks: [] }
      : lf.status === 'fulfilled' ? { status: 'ok', tracks: lf.value } : { status: 'unavailable', tracks: [] },
  };
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value: result });
  while (cache.size > 100) {
    const first = cache.keys().next().value;
    if (!first) break;
    cache.delete(first);
  }
  return result;
}

export function resetMusicDiscoveryForTests(): void {
  cache.clear(); musicBrainzQueue = Promise.resolve(); lastMusicBrainzRequestAt = 0;
}
