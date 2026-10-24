/**
 * Contextual interaction model.
 *
 * A *target* describes what the user acted on; an *action* is one thing they
 * can do to it. Actions are derived from the target (see `actions.ts`), so
 * the desktop right-click menu, the ⋮ overflow menu and the mobile action
 * sheet all render the same list - there is one source of truth.
 */
import type { ComponentType, SVGProps } from 'react';
import type { Album, Artist, Playlist, QueueItem, Track } from '@/lib/types';
import type { CatalogStatus } from '@/pages/admin/types';

/** Just enough of an artist to act on one, wherever it came from. */
export interface ArtistRef {
  id?: string;
  slug: string;
  name: string;
}

/** Just enough of a release/album to act on one. */
export interface ReleaseRef {
  id?: string;
  slug: string;
  title: string;
  artist?: { slug: string; name: string } | null;
}

export const artistRef = (a: Artist | ArtistRef): ArtistRef => ({ id: a.id, slug: a.slug, name: a.name });
export const releaseRef = (a: Album | ReleaseRef): ReleaseRef => ({
  id: a.id,
  slug: a.slug,
  title: a.title,
  artist: a.artist ? { slug: a.artist.slug, name: a.artist.name } : null,
});

/** Just enough of a playlist to act on one (profile lists carry a subset). */
export interface PlaylistRef {
  id: string;
  slug: string;
  title: string;
  isPublic: boolean;
  trackCount: number;
  ownerId?: string | null;
}

export const playlistRef = (p: Playlist | PlaylistRef): PlaylistRef => ({
  id: p.id,
  slug: p.slug,
  title: p.title,
  isPublic: p.isPublic,
  trackCount: p.trackCount,
  ownerId: p.ownerId ?? null,
});

/** A catalog row as the admin manager knows it. */
export interface AdminEntityRef {
  id: string;
  title: string;
  status: CatalogStatus;
  /** Public slug, when the entity has a public page. */
  slug?: string | null;
}

export type ContextTarget =
  /** A catalog track. `context` is the list it was played from, if any. */
  | {
    type: 'track';
    track: Track;
    context?: Track[];
    /** Set when the row lives in a playlist the signed-in user can edit. */
    playlist?: { id: string; title: string; owned: boolean };
    onChanged?: () => void;
  }
  | { type: 'artist'; artist: ArtistRef }
  | { type: 'release'; release: ReleaseRef }
  | { type: 'playlist'; playlist: PlaylistRef; onChanged?: () => void }
  /** A row of the live queue - actions operate on the real player queue. */
  | { type: 'queue-item'; item: QueueItem; index: number }
  | { type: 'admin-artist'; entity: AdminEntityRef; onChanged?: () => void }
  | { type: 'admin-release'; entity: AdminEntityRef; onChanged?: () => void }
  | { type: 'admin-track'; entity: AdminEntityRef; onChanged?: () => void };

export type ContextTargetType = ContextTarget['type'];

/**
 * Groups exist to separate *kinds* of action, not to decorate the menu.
 * Separators are drawn between groups that are actually present.
 */
export type ActionGroup = 'playback' | 'queue' | 'library' | 'navigate' | 'share' | 'manage' | 'danger';

export const GROUP_ORDER: ActionGroup[] = ['playback', 'queue', 'library', 'navigate', 'share', 'manage', 'danger'];

export interface MenuAction {
  id: string;
  label: string;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  group: ActionGroup;
  /** Rendered in the error colour and confirmed before it runs. */
  danger?: boolean;
  /** Extra context, e.g. the destination of "Go to artist". */
  hint?: string;
  run: () => void | Promise<void>;
}

/** A human label for the target, used as the mobile sheet's heading. */
export function targetLabel(target: ContextTarget): string {
  switch (target.type) {
    case 'track': return target.track.title;
    case 'artist': return target.artist.name;
    case 'release': return target.release.title;
    case 'playlist': return target.playlist.title;
    case 'queue-item': return target.item.title;
    default: return target.entity.title;
  }
}

/** A short kind label ("Track", "Release", …) for the sheet subtitle. */
export function targetKind(target: ContextTarget): string {
  switch (target.type) {
    case 'track': return 'Track';
    case 'artist': return 'Artist';
    case 'release': return 'Release';
    case 'playlist': return 'Playlist';
    case 'queue-item': return 'In queue';
    case 'admin-artist': return 'Artist · catalog';
    case 'admin-release': return 'Release · catalog';
    case 'admin-track': return 'Track · catalog';
  }
}
