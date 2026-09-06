/** Fixtures for the contextual-action tests. */
import type { Album, Artist, Playlist, QueueItem, Role, Track, User } from '@/lib/types';

export function makeTrack(over: Partial<Track> = {}): Track {
  return {
    id: 'trk-1',
    slug: 'night-bus',
    title: 'Night Bus',
    trackNo: 1,
    duration: 214,
    artworkUrl: null,
    description: null,
    rightsHolder: null,
    credits: null,
    playCount: 12,
    likeCount: 3,
    createdAt: '2026-01-01T00:00:00.000Z',
    sourceType: 'original',
    artist: { id: 'art-1', slug: 'ayo-ronin', name: 'Ayo Ronin' },
    album: { id: 'alb-1', slug: 'harmattan-sessions', title: 'Harmattan Sessions' },
    license: null,
    sources: [{ provider: 'other', kind: 'direct_url', availability: 'available' }],
    genres: [],
    tags: [],
    ...over,
  };
}

export function makeArtist(over: Partial<Artist> = {}): Artist {
  return { id: 'art-1', slug: 'ayo-ronin', name: 'Ayo Ronin', imageUrl: null, location: 'Lagos', ...over };
}

export function makeAlbum(over: Partial<Album> = {}): Album {
  return {
    id: 'alb-1',
    slug: 'harmattan-sessions',
    title: 'Harmattan Sessions',
    type: 'album',
    artworkUrl: null,
    releasedOn: '2026-02-02',
    artist: { slug: 'ayo-ronin', name: 'Ayo Ronin' },
    ...over,
  };
}

export function makePlaylist(over: Partial<Playlist> = {}): Playlist {
  return {
    id: 'pl-1',
    slug: 'late-shift',
    title: 'Late Shift',
    description: null,
    isPublic: true,
    isCurated: false,
    likeCount: 2,
    trackCount: 8,
    ownerHandle: 'kira-listener',
    ownerId: 'user-2',
    ...over,
  };
}

export function makeQueueItem(over: Partial<QueueItem> = {}): QueueItem {
  return {
    queueId: 'q-1',
    origin: 'remote',
    id: 'trk-1',
    title: 'Night Bus',
    artistName: 'Ayo Ronin',
    artistSlug: 'ayo-ronin',
    trackSlug: 'night-bus',
    albumTitle: 'Harmattan Sessions',
    albumSlug: 'harmattan-sessions',
    artworkUrl: null,
    duration: 214,
    sourceType: 'original',
    ...over,
  };
}

export function makeUser(over: Partial<User> = {}): User {
  return {
    id: 'user-1',
    handle: 'kira-listener',
    displayName: 'Kira',
    avatarUrl: null,
    role: 'listener' as Role,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}
