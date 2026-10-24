import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildProviderSearchLinks,
  normalizeLastFmTrack,
  normalizeMusicBrainzRecording,
  resetMusicDiscoveryForTests,
  searchMusicDiscovery,
} from './music-discovery.ts';

afterEach(() => {
  resetMusicDiscoveryForTests();
  vi.restoreAllMocks();
});

describe('multi-source music discovery', () => {
  it('builds encoded search URLs for provider sites', () => {
    const links = buildProviderSearchLinks('a & b');
    expect(links.map((link) => link.id)).toEqual([
      'youtube-music', 'soundcloud', 'bandcamp', 'youtube', 'lastfm', 'discogs', 'genius',
    ]);
    expect(links.find((link) => link.id === 'youtube-music')?.url).toContain('q=a%20%26%20b');
    expect(links.find((link) => link.id === 'discogs')?.url).toContain('q=a+%26+b');
  });

  it('normalizes MusicBrainz recording metadata', () => {
    expect(normalizeMusicBrainzRecording({
      id: 'recording-1',
      title: ' Example Song ',
      length: 184000,
      'artist-credit': [{ name: 'Example Artist', joinphrase: ' feat. ' }, { artist: { name: 'Guest' } }],
      releases: [{ title: 'Example Album', date: '2024-03-02' }],
    })).toEqual({
      id: 'recording-1', title: 'Example Song', artist: 'Example Artist feat. Guest',
      release: 'Example Album', releaseDate: '2024-03-02', durationSeconds: 184,
      url: 'https://musicbrainz.org/recording/recording-1', provider: 'musicbrainz',
    });
    expect(normalizeMusicBrainzRecording({ title: 'missing id' })).toBeNull();
  });

  it('normalizes Last.fm results and rejects non-HTTPS artwork and URLs', () => {
    expect(normalizeLastFmTrack({
      name: 'Example Song',
      artist: { name: 'Example Artist' },
      duration: '184000',
      listeners: '1200',
      url: 'https://www.last.fm/music/Example/+tracks/Example',
      image: [{ '#text': 'http://images.example/cover.jpg' }, { '#text': 'https://images.example/cover.jpg' }],
      album: { title: 'Example Album' },
    })).toMatchObject({
      title: 'Example Song', artist: 'Example Artist', album: 'Example Album',
      durationSeconds: 184, listeners: 1200, artworkUrl: 'https://images.example/cover.jpg', provider: 'lastfm',
    });
    expect(normalizeLastFmTrack({ name: 'Example', url: 'javascript:alert(1)' })?.url).toBe('https://www.last.fm/');
  });

  it('does not request providers for one-character queries', async () => {
    const fetcher = vi.fn() as unknown as typeof fetch;
    const response = await searchMusicDiscovery('x', { fetcher });
    expect(fetcher).not.toHaveBeenCalled();
    expect(response.musicBrainz.status).toBe('ok');
    expect(response.lastFm.status).toBe('not-configured');
  });

  it('keeps partial results when one provider is unavailable', async () => {
    const fetcher = vi.fn(async (input: string | URL) => {
      if (String(input).includes('musicbrainz.org')) {
        return Response.json({ recordings: [{ id: 'recording-1', title: 'Song', 'artist-credit': [{ name: 'Artist' }] }] });
      }
      return new Response('{}', { status: 503 });
    }) as unknown as typeof fetch;

    const response = await searchMusicDiscovery('Song', { lastFmApiKey: 'test-key', fetcher });
    expect(response.musicBrainz).toMatchObject({ status: 'ok', recordings: [{ title: 'Song' }] });
    expect(response.lastFm).toEqual({ status: 'unavailable', tracks: [] });
    expect(response.sources).toHaveLength(7);
  });
});
