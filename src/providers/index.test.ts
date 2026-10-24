import { describe, expect, it } from 'vitest';
import { trackToQueueItem } from './index';
import type { Track } from '@/lib/types';

function catalogTrack(sources?: Track['sources']): Track {
  return {
    id: 'track-1', slug: 'ja-ikuu', title: 'ja-ikuu', trackNo: 1, duration: 180,
    artworkUrl: null, description: null, rightsHolder: null, credits: null,
    playCount: 0, likeCount: 0, createdAt: '', sourceType: 'community',
    artist: { id: 'artist-1', slug: 'artist', name: 'Artist' }, album: null,
    license: null, sources, genres: [], tags: [],
  };
}

describe('trackToQueueItem', () => {
  it('admits catalog tracks when source metadata is omitted', () => {
    expect(trackToQueueItem(catalogTrack()).id).toBe('track-1');
  });

  it('admits catalog tracks when a list explicitly contains an empty sources array', () => {
    expect(trackToQueueItem(catalogTrack([])).id).toBe('track-1');
  });

  it('does not preflight or reinterpret available and unavailable source metadata', () => {
    expect(trackToQueueItem(catalogTrack([
      { provider: 'hosted', kind: 'direct_url', availability: 'available' },
    ])).id).toBe('track-1');
    // The server decides whether this is genuinely unavailable and supplies
    // the user-facing reason through the playback resolver.
    expect(trackToQueueItem(catalogTrack([
      { provider: 'hosted', kind: 'direct_url', availability: 'unavailable' },
    ])).id).toBe('track-1');
  });
});
