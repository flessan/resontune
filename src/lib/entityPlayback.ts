/**
 * Playing catalog entities (artist / release / playlist) from anywhere.
 *
 * These helpers are the one place that turns "an entity" into queue items:
 * they fetch through the normal API and hand off to the existing player
 * store. No queue state is duplicated here, and no playback URL is ever
 * derived on the client - `playQueue`/`enqueue` still resolve every item
 * through `GET /api/play/:id`.
 */
import type { Track, QueueItem } from '@/lib/types';
import { api } from '@/lib/api';
import { trackToQueueItem } from '@/providers';
import { usePlayer } from '@/player/store';
import { toast } from '@/stores/toast';

/** Playable queue items for a list of tracks (unplayable ones drop out). */
export function queueItemsFor(tracks: Track[]): QueueItem[] {
  return tracks.map(trackToQueueItem).filter(Boolean) as QueueItem[];
}

export async function fetchArtistTracks(slug: string): Promise<Track[]> {
  const r = await api.get<{ popularTracks: Track[] }>(`/artists/${slug}`);
  return r.popularTracks ?? [];
}

export async function fetchReleaseTracks(slug: string): Promise<Track[]> {
  const r = await api.get<{ tracks: Track[] }>(`/albums/${slug}`);
  return r.tracks ?? [];
}

export async function fetchPlaylistTracks(slug: string): Promise<Track[]> {
  const r = await api.get<{ tracks: Track[] }>(`/playlists/${slug}`);
  return r.tracks ?? [];
}

type Loader = () => Promise<Track[]>;

async function load(loader: Loader): Promise<QueueItem[] | null> {
  try {
    const items = queueItemsFor(await loader());
    if (!items.length) {
      toast('Nothing playable here yet.');
      return null;
    }
    return items;
  } catch {
    toast('Could not load those tracks.');
    return null;
  }
}

/** Replace the queue with this entity's tracks and start playing. */
export async function playEntity(loader: Loader): Promise<void> {
  const items = await load(loader);
  if (items) await usePlayer.getState().playQueue(items, 0);
}

/** Append this entity's tracks to the end of the queue. */
export async function queueEntity(loader: Loader, label = 'Added to queue'): Promise<void> {
  const items = await load(loader);
  if (!items) return;
  usePlayer.getState().enqueue(items);
  toast(items.length > 1 ? `${label} · ${items.length} tracks` : label);
}

/** Insert this entity's tracks straight after whatever is playing. */
export async function playEntityNext(loader: Loader): Promise<void> {
  const items = await load(loader);
  if (!items) return;
  usePlayer.getState().insertNext(items);
  toast(items.length > 1 ? `Playing next · ${items.length} tracks` : 'Playing next');
}
