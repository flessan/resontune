/** Shared client-side domain types. */

export type Provider = 'hosted' | 'local' | 'youtube' | 'soundcloud' | 'other';

export interface TrackSource {
  provider: Provider;
  kind: 'direct_url' | 'embed' | 'external_link';
  url: string;
  mimeType?: string | null;
}

export interface ArtistRef {
  id: string;
  slug: string;
  name: string;
}

export interface AlbumRef {
  id: string;
  slug: string | null;
  title: string | null;
  artworkUrl?: string | null;
}

export interface LicenseInfo {
  id: string;
  name: string;
  url: string | null;
  requiresAttribution: boolean | null;
}

export interface Track {
  id: string;
  slug: string;
  title: string;
  trackNo: number | null;
  duration: number | null;
  artworkUrl: string | null;
  description: string | null;
  rightsHolder: string | null;
  credits: string | null;
  playCount: number;
  likeCount: number;
  createdAt: string;
  artist: ArtistRef;
  album: AlbumRef | null;
  license: LicenseInfo | null;
  sources: TrackSource[];
  genres: { id: string; name: string }[];
  tags: { id: string; name: string }[];
  lyrics?: { body: string; kind: string } | null;
  pickNote?: string | null;
}

export interface Artist {
  id: string;
  slug: string;
  name: string;
  bio?: string | null;
  imageUrl: string | null;
  location: string | null;
  plays?: number;
  trackCount?: number;
  links?: { kind: string; label: string; url: string }[];
  genres?: { id: string; name: string }[];
}

export interface Album {
  id: string;
  slug: string;
  title: string;
  type: string;
  artworkUrl: string | null;
  releasedOn: string | null;
  description?: string | null;
  trackCount?: number;
  artist: { name: string; slug: string };
}

export interface Playlist {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  isPublic: boolean;
  isCurated: boolean;
  likeCount: number;
  trackCount: number;
  ownerHandle: string | null;
  ownerId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface User {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  role: 'listener' | 'moderator' | 'admin';
  createdAt: string;
}

/**
 * A playable item in the queue. Either a remote catalog track or a local
 * file from the user's device — the origin is always explicit.
 */
export interface QueueItem {
  queueId: string;               // unique per queue entry
  origin: 'remote' | 'local';
  id: string;                    // track id (remote) or local track id
  title: string;
  artistName: string;
  artistSlug?: string;
  trackSlug?: string;
  albumTitle?: string | null;
  artworkUrl: string | null;     // may be an objectURL for local artwork
  duration: number | null;
  src: string;                   // resolvable audio URL (remote) — for local, resolved lazily
  mimeType?: string | null;
}

export interface LocalTrack {
  id: string;
  fileName: string;
  title: string;
  artist: string;
  album: string | null;
  duration: number | null;
  addedAt: number;
  favorite: boolean;
  size: number;
  mimeType: string;
  hasArtwork: boolean;
  genre?: string | null;
  year?: number | null;
}
