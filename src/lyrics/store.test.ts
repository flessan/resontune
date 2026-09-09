import { beforeEach, describe, expect, it } from 'vitest';
import {
  CACHE_KEY,
  CACHE_LIMIT,
  NEGATIVE_TTL_MS,
  OVERRIDES_KEY,
  dropCached,
  getCached,
  getOverride,
  lyricsTrackKey,
  putCached,
  removeOverride,
  saveOverride,
} from './store';

beforeEach(() => localStorage.clear());

describe('track keys', () => {
  it('is deterministic and origin-scoped', () => {
    expect(lyricsTrackKey({ origin: 'remote', id: 'abc' })).toBe('remote:abc');
    expect(lyricsTrackKey({ origin: 'local', id: 'abc' })).toBe('local:abc');
    expect(lyricsTrackKey({ origin: 'remote', id: 'abc' }))
      .not.toBe(lyricsTrackKey({ origin: 'local', id: 'abc' }));
  });
});

describe('local overrides', () => {
  it('saves, loads and persists an edit', () => {
    expect(saveOverride('remote:t1', { plainLyrics: 'my words', syncedLyrics: null })).toBe(true);
    const o = getOverride('remote:t1');
    expect(o?.plainLyrics).toBe('my words');
    expect(o?.syncedLyrics).toBeNull();
    expect(o?.updatedAt).toBeGreaterThan(0);
    // survives a "reload": raw storage holds it
    const raw = JSON.parse(localStorage.getItem(OVERRIDES_KEY)!);
    expect(raw['remote:t1'].plainLyrics).toBe('my words');
  });

  it('reset deletes the override', () => {
    saveOverride('remote:t1', { plainLyrics: 'my words', syncedLyrics: null });
    removeOverride('remote:t1');
    expect(getOverride('remote:t1')).toBeNull();
    expect(JSON.parse(localStorage.getItem(OVERRIDES_KEY)!)['remote:t1']).toBeUndefined();
  });

  it('an empty edit removes the override instead of storing blank lyrics', () => {
    saveOverride('remote:t1', { plainLyrics: 'words', syncedLyrics: null });
    saveOverride('remote:t1', { plainLyrics: null, syncedLyrics: null });
    expect(getOverride('remote:t1')).toBeNull();
  });

  it('recovers from corrupt storage', () => {
    localStorage.setItem(OVERRIDES_KEY, '{broken json!!');
    expect(getOverride('remote:t1')).toBeNull();
    // and writing works again afterwards
    expect(saveOverride('remote:t1', { plainLyrics: 'fresh', syncedLyrics: null })).toBe(true);
    expect(getOverride('remote:t1')?.plainLyrics).toBe('fresh');
  });

  it('rejects corrupt individual entries', () => {
    localStorage.setItem(OVERRIDES_KEY, JSON.stringify({
      'remote:bad1': 'a string, not an object',
      'remote:bad2': { plainLyrics: 42, syncedLyrics: {} },
      'remote:good': { plainLyrics: 'ok', syncedLyrics: null, updatedAt: 1 },
    }));
    expect(getOverride('remote:bad1')).toBeNull();
    expect(getOverride('remote:bad2')).toBeNull();
    expect(getOverride('remote:good')?.plainLyrics).toBe('ok');
  });
});

describe('LRCLIB cache (separate from overrides)', () => {
  it('stores positive results and returns them', () => {
    putCached('remote:t1', { found: true, plainLyrics: 'remote words', syncedLyrics: null });
    const c = getCached('remote:t1');
    expect(c?.found).toBe(true);
    expect(c?.plainLyrics).toBe('remote words');
  });

  it('never lives in the overrides namespace - a cache entry is not an edit', () => {
    putCached('remote:t1', { found: true, plainLyrics: 'remote words', syncedLyrics: null });
    expect(getOverride('remote:t1')).toBeNull();
    expect(localStorage.getItem(OVERRIDES_KEY)).toBeNull();
    expect(JSON.parse(localStorage.getItem(CACHE_KEY)!)['remote:t1'].found).toBe(true);
  });

  it('expires negative results, keeps positives', () => {
    putCached('remote:none', { found: false, plainLyrics: null, syncedLyrics: null });
    expect(getCached('remote:none')?.found).toBe(false);
    // age the entry past the negative TTL
    const map = JSON.parse(localStorage.getItem(CACHE_KEY)!);
    map['remote:none'].fetchedAt = Date.now() - NEGATIVE_TTL_MS - 1000;
    localStorage.setItem(CACHE_KEY, JSON.stringify(map));
    expect(getCached('remote:none')).toBeNull();
  });

  it('stays bounded at CACHE_LIMIT entries (oldest evicted)', () => {
    for (let i = 0; i < CACHE_LIMIT + 15; i++) {
      putCached(`remote:t${i}`, { found: true, plainLyrics: `words ${i}`, syncedLyrics: null });
      // deterministic recency ordering
      const map = JSON.parse(localStorage.getItem(CACHE_KEY)!);
      map[`remote:t${i}`].fetchedAt = i;
      localStorage.setItem(CACHE_KEY, JSON.stringify(map));
    }
    const map = JSON.parse(localStorage.getItem(CACHE_KEY)!);
    expect(Object.keys(map).length).toBeLessThanOrEqual(CACHE_LIMIT);
    expect(map['remote:t0']).toBeUndefined();                       // oldest gone
    expect(map[`remote:t${CACHE_LIMIT + 14}`]).toBeDefined();       // newest kept
  });

  it('recovers from corrupt cache data', () => {
    localStorage.setItem(CACHE_KEY, '[[[[');
    expect(getCached('remote:t1')).toBeNull();
    putCached('remote:t1', { found: true, plainLyrics: 'ok', syncedLyrics: null });
    expect(getCached('remote:t1')?.plainLyrics).toBe('ok');
  });

  it('dropCached removes a single entry', () => {
    putCached('remote:t1', { found: true, plainLyrics: 'ok', syncedLyrics: null });
    dropCached('remote:t1');
    expect(getCached('remote:t1')).toBeNull();
  });
});
