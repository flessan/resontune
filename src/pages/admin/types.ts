/** Shapes returned by the admin catalog API (`/api/admin/*`). */

export type CatalogStatus = 'published' | 'unlisted' | 'taken_down' | 'archived';
export type CatalogSource = 'original' | 'community' | 'external';

export interface AdminLink {
  provider: string;
  label: string;
  url: string;
}

export interface AdminArtist {
  id: string;
  slug: string;
  name: string;
  bio: string | null;
  imageUrl: string | null;
  location: string | null;
  sourceType: CatalogSource;
  status: CatalogStatus;
  userId: string | null;
  userHandle: string | null;
  trackCount?: number;
  releaseCount?: number;
  createdAt: string;
  updatedAt: string;
  links: AdminLink[];
}

export interface AdminRelease {
  id: string;
  slug: string;
  title: string;
  type: 'album' | 'ep' | 'single' | 'compilation';
  status: CatalogStatus;
  sourceType: CatalogSource;
  releasedOn: string | null;
  description: string | null;
  artworkUrl: string | null;
  catalogNo: string | null;
  artistId: string;
  artist: { id: string; name: string; slug: string } | null;
  trackCount?: number;
  createdAt: string;
  updatedAt: string;
  links: AdminLink[];
}

export interface AdminTrack {
  id: string;
  slug: string;
  title: string;
  status: CatalogStatus;
  sourceType: CatalogSource;
  trackNo: number | null;
  duration: number | null;
  description: string | null;
  artworkUrl: string | null;
  inheritedArtworkUrl: string | null;
  explicit: boolean;
  licenseId: string | null;
  licenseName: string | null;
  rightsHolder: string | null;
  credits: string | null;
  attributionText: string | null;
  territory: string;
  rightsNotes: string | null;
  streamingPermission: boolean;
  distributionPermission: boolean;
  artistId: string;
  artist: { id: string; name: string; slug: string } | null;
  releaseId: string | null;
  release: { id: string; title: string; slug: string } | null;
  playCount: number;
  createdAt: string;
  updatedAt: string;
  audioUrl: string | null;
  externalUrl: string | null;
  mimeType: string | null;
  genres: { id: string; name: string }[];
  links: AdminLink[];
}

export interface AdminLicense {
  id: string;
  name: string;
  url: string | null;
  summary: string | null;
  requiresAttribution: boolean;
}

export interface CatalogOverview {
  counts: Record<'artists' | 'releases' | 'tracks', Record<string, number>>;
  recent: {
    kind: 'artist' | 'release' | 'track';
    id: string;
    title: string;
    subtitle: string | null;
    status: CatalogStatus;
    updatedAt: string;
  }[];
  warnings: {
    tracksMissingAudio: number;
    releasesWithoutTracks: number;
    publishedWithoutLicense: number;
  };
}

export const STATUS_LABEL: Record<CatalogStatus, string> = {
  published: 'Published',
  unlisted: 'Unlisted',
  taken_down: 'Taken down',
  archived: 'Archived',
};

export const STATUSES: CatalogStatus[] = ['published', 'unlisted', 'taken_down', 'archived'];

export const SOURCE_LABEL: Record<CatalogSource, string> = {
  original: 'ResonTune Original',
  community: 'Community',
  external: 'External',
};
