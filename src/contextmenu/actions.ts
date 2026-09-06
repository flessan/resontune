/**
 * Deriving actions from a target.
 *
 * Everything contextual in ResonTune comes through this function: the
 * desktop right-click menu, the ⋮ overflow button and the mobile action
 * sheet all render `buildActions(target, ctx)`. Actions call the same
 * player store, auth store and API the pages call — no playback, queue,
 * playlist or navigation logic is reimplemented here.
 *
 * Two rules shape the lists below:
 *  - only offer what is actually valid right now (no decorative disabled
 *    rows, no "Go to release" for a standalone track);
 *  - client-side visibility is courtesy, not security. Every mutation is
 *    still authorized on the server.
 */
import type { NavigateFunction } from 'react-router-dom';
import type { QueueItem, Track, User } from '@/lib/types';
import { usePlayer } from '@/player/store';
import { useAuth } from '@/stores/auth';
import { toast } from '@/stores/toast';
import { api } from '@/lib/api';
import { trackToQueueItem } from '@/providers';
import { canonicalUrl, copyText, shareLink } from '@/lib/share';
import {
  fetchArtistTracks, fetchPlaylistTracks, fetchReleaseTracks, playEntity, playEntityNext, queueEntity, queueItemsFor,
} from '@/lib/entityPlayback';
import { dialogs } from '@/stores/dialogs';
import {
  IconDisc, IconEdit, IconExternal, IconEye, IconEyeOff, IconHeart, IconLink, IconMic, IconPause,
  IconPlay, IconPlaylist, IconPlus, IconQueue, IconShare, IconTop, IconTrash, IconWave,
} from '@/components/Icons';
import type { ContextTarget, MenuAction } from './types';

/** Live application state the action list depends on. */
export interface ActionContext {
  navigate: NavigateFunction;
  pathname: string;
  user: User | null;
  isFavorite: (trackId: string) => boolean;
  queue: QueueItem[];
  queueIndex: number;
  playing: boolean;
}

/* --------------------------------- sharing -------------------------------- */

async function share(path: string, title: string) {
  const result = await shareLink({ title, url: canonicalUrl(path) });
  if (result === 'copied') toast('Link copied');
  if (result === 'failed') toast('Could not share that link.');
}

async function copyLink(path: string) {
  toast((await copyText(canonicalUrl(path))) ? 'Link copied' : 'Could not copy that link.');
}

function shareActions(path: string, title: string): MenuAction[] {
  return [
    { id: 'share', label: 'Share', icon: IconShare, group: 'share', run: () => share(path, title) },
    { id: 'copy-link', label: 'Copy link', icon: IconLink, group: 'share', run: () => copyLink(path) },
  ];
}

/* --------------------------------- tracks --------------------------------- */

function favoriteAction(trackId: string, ctx: ActionContext): MenuAction {
  const liked = ctx.isFavorite(trackId);
  return {
    id: 'favorite',
    label: liked ? 'Remove from favorites' : 'Add to favorites',
    icon: IconHeart,
    group: 'library',
    run: async () => {
      if (!ctx.user) return toast('Sign in to save favorites.');
      const fav = await useAuth.getState().toggleFavorite(trackId);
      toast(fav ? 'Added to favorites' : 'Removed from favorites');
    },
  };
}

function trackActions(target: Extract<ContextTarget, { type: 'track' }>, ctx: ActionContext): MenuAction[] {
  const { track } = target;
  const player = usePlayer.getState();
  const current = ctx.queue[ctx.queueIndex];
  const isCurrent = current?.origin === 'remote' && current.id === track.id;
  const alreadyQueued = ctx.queue.some((q) => q.origin === 'remote' && q.id === track.id);
  const playable = trackToQueueItem(track) !== null;
  const actions: MenuAction[] = [];

  if (playable) {
    actions.push({
      id: 'play',
      label: isCurrent && ctx.playing ? 'Pause' : isCurrent ? 'Resume' : 'Play',
      icon: isCurrent && ctx.playing ? IconPause : IconPlay,
      group: 'playback',
      run: () => {
        if (isCurrent) return void player.toggle();
        const list = target.context?.length ? target.context : [track];
        const items = queueItemsFor(list);
        const start = items.findIndex((i) => i.id === track.id);
        if (start === -1) return toast('This track has no playable source.');
        void player.playQueue(items, start);
      },
    });
    actions.push({
      id: 'play-next',
      label: 'Play next',
      icon: IconQueue,
      group: 'queue',
      run: () => {
        const item = trackToQueueItem(track);
        if (!item) return toast('This track has no playable source.');
        player.playNext(item);
        toast('Playing next');
      },
    });
    actions.push({
      id: 'add-queue',
      label: alreadyQueued ? 'Add to queue again' : 'Add to queue',
      icon: IconPlus,
      group: 'queue',
      run: () => {
        const item = trackToQueueItem(track);
        if (!item) return toast('This track has no playable source.');
        player.enqueue([item]);
        toast('Added to queue');
      },
    });
  }

  actions.push({
    id: 'add-playlist',
    label: 'Add to playlist',
    icon: IconPlaylist,
    group: 'library',
    run: () => {
      if (!ctx.user) return toast('Sign in to build playlists.');
      dialogs.addToPlaylist([track.id], track.title);
    },
  });
  actions.push(favoriteAction(track.id, ctx));

  if (target.playlist?.owned) {
    const { id: playlistId, title } = target.playlist;
    actions.push({
      id: 'remove-from-playlist',
      label: 'Remove from this playlist',
      icon: IconTrash,
      group: 'library',
      run: async () => {
        try {
          await api.del(`/playlists/${playlistId}/tracks/${track.id}`);
          toast(`Removed from “${title}”`);
          target.onChanged?.();
        } catch (err: any) {
          toast(err?.message ?? 'Could not remove that track.');
        }
      },
    });
  }

  if (ctx.pathname !== `/track/${track.slug}`) {
    actions.push({
      id: 'go-track',
      label: 'Track details',
      icon: IconDisc,
      group: 'navigate',
      run: () => ctx.navigate(`/track/${track.slug}`),
    });
  }
  actions.push({
    id: 'go-artist',
    label: 'Go to artist',
    icon: IconMic,
    group: 'navigate',
    hint: track.artist.name,
    run: () => ctx.navigate(`/artist/${track.artist.slug}`),
  });
  if (track.album?.slug) {
    actions.push({
      id: 'go-release',
      label: 'Go to release',
      icon: IconDisc,
      group: 'navigate',
      hint: track.album.title ?? undefined,
      run: () => ctx.navigate(`/release/${track.album!.slug}`),
    });
  }

  actions.push(...shareActions(`/track/${track.slug}`, track.title));
  return actions;
}

/* --------------------------------- artists -------------------------------- */

function artistActions(target: Extract<ContextTarget, { type: 'artist' }>, ctx: ActionContext): MenuAction[] {
  const { slug, name } = target.artist;
  const load = () => fetchArtistTracks(slug);
  const actions: MenuAction[] = [
    { id: 'play-artist', label: 'Play artist', icon: IconPlay, group: 'playback', run: () => playEntity(load) },
    {
      id: 'artist-radio',
      label: 'Start artist radio',
      icon: IconWave,
      group: 'playback',
      run: () => playEntity(async () => {
        const r = await api.get<{ tracks: Track[] }>(`/radio?station=artist:${slug}`);
        return r.tracks ?? [];
      }),
    },
    { id: 'play-next', label: 'Play next', icon: IconQueue, group: 'queue', run: () => playEntityNext(load) },
    { id: 'add-queue', label: 'Add to queue', icon: IconPlus, group: 'queue', run: () => queueEntity(load) },
  ];
  if (ctx.pathname !== `/artist/${slug}`) {
    actions.push({ id: 'go-artist', label: 'Go to artist', icon: IconMic, group: 'navigate', run: () => ctx.navigate(`/artist/${slug}`) });
  }
  actions.push(...shareActions(`/artist/${slug}`, name));
  return actions;
}

/* -------------------------------- releases -------------------------------- */

function releaseActions(target: Extract<ContextTarget, { type: 'release' }>, ctx: ActionContext): MenuAction[] {
  const { slug, title, artist } = target.release;
  const load = () => fetchReleaseTracks(slug);
  const actions: MenuAction[] = [
    { id: 'play-release', label: 'Play release', icon: IconPlay, group: 'playback', run: () => playEntity(load) },
    { id: 'play-next', label: 'Play next', icon: IconQueue, group: 'queue', run: () => playEntityNext(load) },
    { id: 'add-queue', label: 'Add to queue', icon: IconPlus, group: 'queue', run: () => queueEntity(load) },
    {
      id: 'add-playlist',
      label: 'Add to playlist',
      icon: IconPlaylist,
      group: 'library',
      run: async () => {
        if (!ctx.user) return toast('Sign in to build playlists.');
        try {
          const tracks = await load();
          if (!tracks.length) return toast('This release has no tracks yet.');
          dialogs.addToPlaylist(tracks.map((t) => t.id), title);
        } catch {
          toast('Could not load that release.');
        }
      },
    },
  ];
  if (ctx.pathname !== `/release/${slug}`) {
    actions.push({ id: 'go-release', label: 'Open release', icon: IconDisc, group: 'navigate', run: () => ctx.navigate(`/release/${slug}`) });
  }
  if (artist?.slug) {
    actions.push({
      id: 'go-artist', label: 'Go to artist', icon: IconMic, group: 'navigate', hint: artist.name,
      run: () => ctx.navigate(`/artist/${artist.slug}`),
    });
  }
  actions.push(...shareActions(`/release/${slug}`, title));
  return actions;
}

/* -------------------------------- playlists ------------------------------- */

function playlistActions(target: Extract<ContextTarget, { type: 'playlist' }>, ctx: ActionContext): MenuAction[] {
  const { playlist } = target;
  const owned = Boolean(ctx.user && playlist.ownerId && playlist.ownerId === ctx.user.id);
  const load = () => fetchPlaylistTracks(playlist.slug);
  const actions: MenuAction[] = [];

  if (playlist.trackCount > 0) {
    actions.push({ id: 'play', label: 'Play', icon: IconPlay, group: 'playback', run: () => playEntity(load) });
    actions.push({ id: 'play-next', label: 'Play next', icon: IconQueue, group: 'queue', run: () => playEntityNext(load) });
    actions.push({ id: 'add-queue', label: 'Add to queue', icon: IconPlus, group: 'queue', run: () => queueEntity(load) });
  }

  if (ctx.pathname !== `/playlist/${playlist.slug}`) {
    actions.push({ id: 'open', label: 'Open playlist', icon: IconPlaylist, group: 'navigate', run: () => ctx.navigate(`/playlist/${playlist.slug}`) });
  }

  if (ctx.user && !owned) {
    actions.push({
      id: 'duplicate',
      label: 'Save a copy',
      icon: IconPlus,
      group: 'library',
      run: async () => {
        try {
          const r = await api.post<{ playlist: { slug: string } }>(`/playlists/${playlist.id}/duplicate`);
          toast('Playlist duplicated');
          ctx.navigate(`/playlist/${r.playlist.slug}`);
        } catch (err: any) {
          toast(err?.message ?? 'Could not duplicate that playlist.');
        }
      },
    });
  }

  // Ownership-only actions. The server enforces this too — these simply do
  // not appear for people who cannot use them.
  if (owned) {
    actions.push({
      id: 'rename',
      label: 'Rename',
      icon: IconEdit,
      group: 'manage',
      run: async () => {
        const title = await dialogs.prompt({
          title: 'Rename playlist', label: 'Playlist name', value: playlist.title, confirmLabel: 'Rename',
        });
        if (!title || title === playlist.title) return;
        try {
          await api.patch(`/playlists/${playlist.id}`, { title });
          toast('Playlist renamed');
          target.onChanged?.();
        } catch (err: any) {
          toast(err?.message ?? 'Could not rename that playlist.');
        }
      },
    });
    actions.push({
      id: 'visibility',
      label: playlist.isPublic ? 'Make private' : 'Make public',
      icon: playlist.isPublic ? IconEyeOff : IconEye,
      group: 'manage',
      run: async () => {
        try {
          await api.patch(`/playlists/${playlist.id}`, { isPublic: !playlist.isPublic });
          toast(playlist.isPublic ? 'Playlist is now private' : 'Playlist is now public');
          target.onChanged?.();
        } catch (err: any) {
          toast(err?.message ?? 'Could not change that playlist.');
        }
      },
    });
    actions.push({
      id: 'delete',
      label: 'Delete playlist',
      icon: IconTrash,
      group: 'danger',
      danger: true,
      run: async () => {
        const ok = await dialogs.confirm({
          title: `Delete “${playlist.title}”?`,
          body: 'The playlist is removed for everyone it was shared with. This cannot be undone.',
          confirmLabel: 'Delete',
          danger: true,
        });
        if (!ok) return;
        try {
          await api.del(`/playlists/${playlist.id}`);
          toast('Playlist deleted');
          target.onChanged?.();
          if (ctx.pathname === `/playlist/${playlist.slug}`) ctx.navigate('/playlists');
        } catch (err: any) {
          toast(err?.message ?? 'Could not delete that playlist.');
        }
      },
    });
  }

  if (playlist.isPublic || owned) actions.push(...shareActions(`/playlist/${playlist.slug}`, playlist.title));
  return actions;
}

/* ------------------------------- queue items ------------------------------ */

function queueActions(target: Extract<ContextTarget, { type: 'queue-item' }>, ctx: ActionContext): MenuAction[] {
  const { item } = target;
  const player = usePlayer.getState();
  // Resolve the row's position from the live queue, never from a stale prop.
  const index = ctx.queue.findIndex((q) => q.queueId === item.queueId);
  if (index === -1) return [];
  const isCurrent = index === ctx.queueIndex;
  const actions: MenuAction[] = [
    {
      id: 'play-now',
      label: isCurrent && ctx.playing ? 'Pause' : isCurrent ? 'Resume' : 'Play now',
      icon: isCurrent && ctx.playing ? IconPause : IconPlay,
      group: 'playback',
      run: () => (isCurrent ? void player.toggle() : void player.jumpTo(index)),
    },
  ];

  if (!isCurrent && index !== ctx.queueIndex + 1) {
    actions.push({
      id: 'play-next',
      label: 'Play next',
      icon: IconQueue,
      group: 'queue',
      run: () => {
        // Destination = the slot straight after the playing entry. Moving an
        // earlier item leaves the current one one position lower, so the
        // target index differs by direction.
        const dest = ctx.queueIndex < 0 ? 0 : index > ctx.queueIndex ? ctx.queueIndex + 1 : ctx.queueIndex;
        player.moveInQueue(item.queueId, dest);
        toast('Playing next');
      },
    });
  }
  if (!isCurrent && index > 0) {
    actions.push({
      id: 'move-top',
      label: 'Move to top',
      icon: IconTop,
      group: 'queue',
      run: () => {
        player.moveInQueue(item.queueId, 0);
        toast('Moved to the top of the queue');
      },
    });
  }
  actions.push({
    id: 'remove',
    label: 'Remove from queue',
    icon: IconTrash,
    group: 'queue',
    run: () => player.removeFromQueue(item.queueId),
  });

  if (item.origin === 'remote') {
    actions.push({
      id: 'add-playlist',
      label: 'Add to playlist',
      icon: IconPlaylist,
      group: 'library',
      run: () => {
        if (!ctx.user) return toast('Sign in to build playlists.');
        dialogs.addToPlaylist([item.id], item.title);
      },
    });
    actions.push(favoriteAction(item.id, ctx));
    if (item.artistSlug) {
      actions.push({
        id: 'go-artist', label: 'Go to artist', icon: IconMic, group: 'navigate', hint: item.artistName,
        run: () => ctx.navigate(`/artist/${item.artistSlug}`),
      });
    }
    if (item.albumSlug) {
      actions.push({
        id: 'go-release', label: 'Go to release', icon: IconDisc, group: 'navigate', hint: item.albumTitle ?? undefined,
        run: () => ctx.navigate(`/release/${item.albumSlug}`),
      });
    }
    if (item.trackSlug) actions.push(...shareActions(`/track/${item.trackSlug}`, item.title));
  }
  return actions;
}

/* ------------------------------ admin catalog ----------------------------- */

const ADMIN_ROUTE = { 'admin-artist': 'artists', 'admin-release': 'releases', 'admin-track': 'tracks' } as const;
const PUBLIC_ROUTE = { 'admin-artist': 'artist', 'admin-release': 'release', 'admin-track': 'track' } as const;
const API_ROUTE = { 'admin-artist': 'artists', 'admin-release': 'releases', 'admin-track': 'tracks' } as const;

function adminActions(
  target: Extract<ContextTarget, { type: 'admin-artist' | 'admin-release' | 'admin-track' }>,
  ctx: ActionContext,
): MenuAction[] {
  const role = ctx.user?.role;
  // Moderators read the catalog; only administrators change it. The API
  // enforces exactly the same split.
  if (role !== 'admin' && role !== 'moderator') return [];
  const canEdit = role === 'admin';
  const { entity } = target;
  const kind = target.type;
  const live = entity.status === 'published' || entity.status === 'unlisted';

  const actions: MenuAction[] = [
    {
      id: 'edit',
      label: canEdit ? 'Edit' : 'Open',
      icon: IconEdit,
      group: 'manage',
      run: () => ctx.navigate(`/admin/${ADMIN_ROUTE[kind]}/${entity.id}`),
    },
  ];

  if (entity.slug && live) {
    actions.push({
      id: 'preview',
      label: 'Preview public page',
      icon: IconExternal,
      group: 'navigate',
      run: () => ctx.navigate(`/${PUBLIC_ROUTE[kind]}/${entity.slug}`),
    });
  }

  if (canEdit) {
    const publish = entity.status !== 'published';
    actions.push({
      id: 'publish',
      label: publish ? 'Publish' : kind === 'admin-artist' ? 'Withdraw' : 'Unpublish',
      icon: publish ? IconEye : IconEyeOff,
      group: 'manage',
      run: async () => {
        try {
          await api.patch(`/admin/${API_ROUTE[kind]}/${entity.id}`, {
            status: publish ? 'published' : 'unlisted',
          });
          toast(publish ? 'Published' : 'Hidden from the public catalog');
          target.onChanged?.();
        } catch (err: any) {
          toast(err?.message ?? 'Could not change that status.');
        }
      },
    });
  }

  if (entity.slug) {
    actions.push({
      id: 'copy-link',
      label: 'Copy public link',
      icon: IconLink,
      group: 'share',
      run: () => copyLink(`/${PUBLIC_ROUTE[kind]}/${entity.slug}`),
    });
  }

  if (canEdit) {
    actions.push({
      id: 'delete',
      label: 'Delete',
      icon: IconTrash,
      group: 'danger',
      danger: true,
      run: async () => {
        const ok = await dialogs.confirm({
          title: `Delete “${entity.title}”?`,
          body: 'The catalog record is removed permanently. Withdrawing instead keeps the history.',
          confirmLabel: 'Delete',
          danger: true,
        });
        if (!ok) return;
        try {
          await api.del(`/admin/${API_ROUTE[kind]}/${entity.id}`);
          toast('Deleted');
          target.onChanged?.();
        } catch (err: any) {
          toast(err?.message ?? 'Could not delete that record.');
        }
      },
    });
  }
  return actions;
}

/* --------------------------------- entry ---------------------------------- */

export function buildActions(target: ContextTarget, ctx: ActionContext): MenuAction[] {
  switch (target.type) {
    case 'track': return trackActions(target, ctx);
    case 'artist': return artistActions(target, ctx);
    case 'release': return releaseActions(target, ctx);
    case 'playlist': return playlistActions(target, ctx);
    case 'queue-item': return queueActions(target, ctx);
    default: return adminActions(target, ctx);
  }
}
