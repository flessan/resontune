/**
 * The resolver contract: LRCLIB is the remote source, localStorage holds
 * personal edits, and nothing lyrics-related ever touches ResonTune's own
 * API. fetch is mocked - these tests never reach the network.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isRelevantMatch, normalizeForMatch } from './lrclib';
import {
  hasLocalLyrics,
  resetLocalLyrics,
  resolveLyrics,
  saveLocalLyrics,
  type LyricsTrackRef,
} from './resolver';
import { CACHE_KEY, OVERRIDES_KEY } from './store';

const TRACK: LyricsTrackRef = {
  origin: 'remote',
  id: 'trk-1',
  title: 'Night Drive',
  artistName: 'Resona',
  albumTitle: 'Open Roads',
  duration: 201,
};

const LRC = '[00:10.00]First line\n[00:20.00]Second line';

function lrclibResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('matching', () => {
  it('normalizes case, punctuation, diacritics and feat. suffixes', () => {
    expect(normalizeForMatch('Night Drive (feat. Aria)')).toBe('night drive');
    expect(normalizeForMatch('  CAFÉ—Nights!! ')).toBe('cafe nights');
  });

  it('accepts only genuinely relevant candidates', () => {
    const q = { title: 'Night Drive', artist: 'Resona', duration: 201 };
    expect(isRelevantMatch(q, { trackName: 'Night Drive', artistName: 'Resona', duration: 200 })).toBe(true);
    expect(isRelevantMatch(q, { trackName: 'Night Drive (Remastered)', artistName: 'Resona', duration: 202 })).toBe(true);
    // wrong song / wrong artist / wrong length
    expect(isRelevantMatch(q, { trackName: 'Day Drive', artistName: 'Resona', duration: 201 })).toBe(false);
    expect(isRelevantMatch(q, { trackName: 'Night Drive', artistName: 'Someone Else', duration: 201 })).toBe(false);
    expect(isRelevantMatch(q, { trackName: 'Night Drive', artistName: 'Resona', duration: 320 })).toBe(false);
    // missing metadata never matches blindly
    expect(isRelevantMatch(q, {})).toBe(false);
  });
});

describe('resolution', () => {
  it('normalizes a synced LRCLIB result (synced + derived plain)', async () => {
    fetchMock.mockResolvedValueOnce(lrclibResponse({
      trackName: 'Night Drive', artistName: 'Resona', duration: 201,
      plainLyrics: null, syncedLyrics: LRC,
    }));
    const r = await resolveLyrics(TRACK);
    expect(r?.source).toBe('lrclib');
    expect(r?.synced).toBe(true);
    expect(r?.lines).toHaveLength(2);
    expect(r?.lines[1]).toEqual({ time: 20, text: 'Second line' });
    expect(r?.plain).toBe('First line\nSecond line');
    expect(r?.syncedRaw).toBe(LRC);
  });

  it('normalizes a plain-only result without faking sync', async () => {
    fetchMock.mockResolvedValueOnce(lrclibResponse({
      trackName: 'Night Drive', artistName: 'Resona', duration: 201,
      plainLyrics: 'Only plain words\nSecond line', syncedLyrics: null,
    }));
    const r = await resolveLyrics(TRACK);
    expect(r?.synced).toBe(false);
    expect(r?.lines).toEqual([]);
    expect(r?.plain).toContain('Only plain words');
  });

  it('only talks to lrclib.net - never a ResonTune /api route', async () => {
    fetchMock.mockResolvedValueOnce(lrclibResponse({
      trackName: 'Night Drive', artistName: 'Resona', duration: 201,
      plainLyrics: 'words', syncedLyrics: null,
    }));
    await resolveLyrics(TRACK);
    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).toMatch(/^https:\/\/lrclib\.net\/api\//);
    }
  });

  it('returns null when /get misses and search has no relevant candidate', async () => {
    fetchMock
      .mockResolvedValueOnce(lrclibResponse(null, 404)) // /get
      .mockResolvedValueOnce(lrclibResponse([
        { trackName: 'A Different Song', artistName: 'Nobody', plainLyrics: 'irrelevant' },
      ]));
    const r = await resolveLyrics(TRACK);
    expect(r).toBeNull();
    // the "not found" is cached so the next open does not refetch
    expect(JSON.parse(localStorage.getItem(CACHE_KEY)!)['remote:trk-1'].found).toBe(false);
  });

  it('falls back to search and prefers synced, duration-closest candidates', async () => {
    fetchMock
      .mockResolvedValueOnce(lrclibResponse(null, 404)) // /get
      .mockResolvedValueOnce(lrclibResponse([
        { trackName: 'Night Drive', artistName: 'Resona', duration: 199, plainLyrics: 'plain only' },
        { trackName: 'Night Drive', artistName: 'Resona', duration: 202, syncedLyrics: LRC },
      ]));
    const r = await resolveLyrics(TRACK);
    expect(r?.synced).toBe(true);
  });

  it('survives network failure: resolves null, playback-side code unaffected, no negative cache', async () => {
    fetchMock.mockRejectedValue(new TypeError('network down'));
    const r = await resolveLyrics(TRACK);
    expect(r).toBeNull();
    expect(localStorage.getItem(CACHE_KEY)).toBeNull(); // retry next time
  });

  it('survives a malformed response body', async () => {
    fetchMock
      .mockResolvedValueOnce(lrclibResponse('what even is this'))
      .mockResolvedValueOnce(lrclibResponse({ definitely: 'not an array' }));
    const r = await resolveLyrics(TRACK);
    expect(r).toBeNull();
  });

  it('skips the network entirely with empty metadata', async () => {
    const r = await resolveLyrics({ ...TRACK, id: 'trk-empty', title: '  ', artistName: '' });
    expect(r).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('dedupes concurrent requests for the same track', async () => {
    let release!: (v: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((res) => { release = res; }));
    const [p1, p2] = [resolveLyrics(TRACK), resolveLyrics(TRACK)];
    expect(fetchMock).toHaveBeenCalledTimes(1);
    release(lrclibResponse({ trackName: 'Night Drive', artistName: 'Resona', duration: 201, plainLyrics: 'w', syncedLyrics: null }));
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1?.plain).toBe('w');
    expect(r2?.plain).toBe('w');
  });

  it('serves the cache on the second resolve without another fetch', async () => {
    fetchMock.mockResolvedValueOnce(lrclibResponse({
      trackName: 'Night Drive', artistName: 'Resona', duration: 201,
      plainLyrics: 'cached words', syncedLyrics: null,
    }));
    await resolveLyrics(TRACK);
    fetchMock.mockClear();
    const again = await resolveLyrics(TRACK);
    expect(again?.plain).toBe('cached words');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('local edits', () => {
  it('creates an override that wins over LRCLIB and persists', async () => {
    const saved = saveLocalLyrics(TRACK, { plain: 'my own words', syncedRaw: null });
    expect(saved?.source).toBe('local');
    expect(hasLocalLyrics(TRACK)).toBe(true);

    // resolution never hits the network while an override exists
    const r = await resolveLyrics(TRACK);
    expect(r?.source).toBe('local');
    expect(r?.plain).toBe('my own words');
    expect(fetchMock).not.toHaveBeenCalled();

    // "reload": storage still holds it
    expect(JSON.parse(localStorage.getItem(OVERRIDES_KEY)!)['remote:trk-1'].plainLyrics).toBe('my own words');
  });

  it('preserves timestamps when the user edits synced lyrics', () => {
    const saved = saveLocalLyrics(TRACK, {
      plain: '',
      syncedRaw: '[00:10.00]First line, my wording\n[00:20.00]Second line',
    });
    expect(saved?.synced).toBe(true);
    expect(saved?.lines[0]).toEqual({ time: 10, text: 'First line, my wording' });
  });

  it('a user edit is never sent anywhere', () => {
    saveLocalLyrics(TRACK, { plain: 'private words', syncedRaw: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reset deletes the override and returns fresh LRCLIB lyrics', async () => {
    saveLocalLyrics(TRACK, { plain: 'my own words', syncedRaw: null });
    fetchMock.mockResolvedValueOnce(lrclibResponse({
      trackName: 'Night Drive', artistName: 'Resona', duration: 201,
      plainLyrics: 'the remote original', syncedLyrics: null,
    }));
    const r = await resetLocalLyrics(TRACK);
    expect(hasLocalLyrics(TRACK)).toBe(false);
    expect(r?.source).toBe('lrclib');
    expect(r?.plain).toBe('the remote original');
  });

  it('an invalid stored override falls through to the remote path', async () => {
    localStorage.setItem(OVERRIDES_KEY, JSON.stringify({ 'remote:trk-1': { plainLyrics: 12345 } }));
    fetchMock.mockResolvedValueOnce(lrclibResponse({
      trackName: 'Night Drive', artistName: 'Resona', duration: 201,
      plainLyrics: 'remote words', syncedLyrics: null,
    }));
    const r = await resolveLyrics(TRACK);
    expect(r?.source).toBe('lrclib');
  });

  it('a cached remote entry is never presented as a local edit', async () => {
    fetchMock.mockResolvedValueOnce(lrclibResponse({
      trackName: 'Night Drive', artistName: 'Resona', duration: 201,
      plainLyrics: 'remote words', syncedLyrics: null,
    }));
    await resolveLyrics(TRACK);
    const again = await resolveLyrics(TRACK); // served from cache
    expect(again?.source).toBe('lrclib');
    expect(hasLocalLyrics(TRACK)).toBe(false);
  });
});
