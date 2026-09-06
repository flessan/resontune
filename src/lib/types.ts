/** Shared client-side domain types. */

export type Provider = 'hosted' | 'local' | 'youtube' | 'soundcloud' | 'other';

/** Provenance of a catalog entity: ResonTune Original, community, or external. */
export type SourceType = 'original' | 'community' | 'external';

/**
 * Descriptive source metadata (no raw URLs — playback URLs are resolved
 * server-side via GET /api/play/:trackId).
 */
export interface TrackSource {
  provider: Provider;
  kind: 'direct_url' | 'embed' | 'external_link';
  mimeType?: string | null;
  sourceType?: 'original_hosted' | 'community_hosted' | 'remote' | 'external';
  availability?: 'available' | 'processing' | 'unavailable';
}

/** Server-resolved playback descriptor. */
export type PlayResolution =
  | { mode: 'stream'; url: string; mimeType: string | null; sourceType: string; trackSourceType: SourceType }
  | { mode: 'external'; url: string; label: string; sourceType: string; trackSourceType: SourceType };

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
  sourceType: SourceType;
  attributionText?: string | null;
  territory?: string | null;
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
  links?: { kind?: string; provider?: string; label: string; url: string }[];
  genres?: { id: string; name: string }[];
  sourceType?: SourceType;
}

export interface Collection {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  artworkUrl: string | null;
  curatorName: string;
  itemCount: number;
  updatedAt?: string;
}

export interface CollectionItem {
  kind: 'track' | 'album' | 'artist';
  note: string | null;
  track?: Track | null;
  album?: Album | null;
  artist?: Artist | null;
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
  sourceType?: SourceType;
  catalogNo?: string | null;
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

export type Role = 'listener' | 'moderator' | 'admin';

/** A link on a profile or catalog entity (normalized `entity_links`). */
export interface EntityLink {
  provider: string;
  label: string;
  url: string;
}

/** The signed-in account, as reported by the server. */
export interface User {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  avatarThumbUrl?: string | null;
  bio?: string | null;
  location?: string | null;
  websiteUrl?: string | null;
  role: Role;
  createdAt: string;
}

/** A public ResonTune profile. */
export interface Profile {
  id: string;
  username: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  avatarThumbUrl: string | null;
  bio: string | null;
  location: string | null;
  websiteUrl: string | null;
  role: Role;
  joinedAt: string;
  createdAt: string;
  links: EntityLink[];
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
  mimeType?: string | null;
  /** Provenance chip shown in the player ('original' | 'community' | 'external'). */
  sourceType?: SourceType;
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
