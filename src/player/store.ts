/**
 * Player state (zustand). Coarse state only - time updates flow through
 * engine.onTime subscriptions so the React tree isn't re-rendered every
 * frame. Queue + position persist to IndexedDB so a reload resumes where
 * you left off.
 */
import { create } from 'zustand';
import type { QueueItem } from '@/lib/types';
import { engine } from './engine';
import { resolveLocalSrc, resolveRemotePlayback } from '@/providers';
import { kvGet, kvSet } from '@/local/db';
import { api } from '@/lib/api';

export type RepeatMode = 'off' | 'all' | 'one';
export type PlayerView = 'compact' | 'expanded' | 'immersive';

interface PlayerState {
  queue: QueueItem[];
  index: number;
  playing: boolean;
  loading: boolean;
  duration: number;
  volume: number;
  muted: boolean;
  rate: number;
  shuffle: boolean;
  repeat: RepeatMode;
  view: PlayerView;
  error: string | null;
  /** Set when the current item can only be played on its official external page. */
  externalLink: { url: string; label: string } | null;

  current: () => QueueItem | null;
  playQueue: (items: QueueItem[], startIndex?: number) => Promise<void>;
  playNow: (item: QueueItem) => Promise<void>;
  enqueue: (items: QueueItem[]) => void;
  playNext: (item: QueueItem) => void;
  /** Insert items directly after the current one (batch form of playNext). */
  insertNext: (items: QueueItem[]) => void;
  /** Move an existing queue entry to another position, keeping playback. */
  moveInQueue: (queueId: string, toIndex: number) => void;
  removeFromQueue: (queueId: string) => void;
  clearQueue: () => void;
  toggle: () => Promise<void>;
  next: () => Promise<void>;
  prev: () => Promise<void>;
  seekTo: (seconds: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  setRate: (r: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setView: (v: PlayerView) => void;
  jumpTo: (queueIndex: number) => Promise<void>;
}

let playReportTimer: ReturnType<typeof setTimeout> | null = null;

function reportPlay(item: QueueItem) {
  // Count a play after 5 seconds of a remote track (deduplicated per load).
  if (playReportTimer) clearTimeout(playReportTimer);
  if (item.origin !== 'remote') return;
  playReportTimer = setTimeout(() => {
    api.post(`/tracks/${item.id}/play`).catch(() => { });
  }, 5000);
}

/**
 * Resolve a queue item into something the audio element can load.
 * Remote tracks go through the server's playback-resolution endpoint
 * (which enforces takedowns/permissions); local files resolve to
 * session-scoped object URLs.
 */
async function resolveSrc(
  item: QueueItem,
): Promise<{ src: string } | { external: string; label: string } | { error: string } | null> {
  if (item.origin === 'local') {
    const url = await resolveLocalSrc(item.id);
    return url ? { src: url } : null;
  }
  const r = await resolveRemotePlayback(item.id);
  if (r.type === 'stream') return { src: r.url };
  if (r.type === 'external') return { external: r.url, label: r.label };
  return { error: r.reason };
}

async function persistState(state: Pick<PlayerState, 'queue' | 'index' | 'volume' | 'muted' | 'rate' | 'shuffle' | 'repeat'>) {
  // Local object URLs are session-scoped; store enough to rebuild.
  const queue = state.queue.map((q) => ({ ...q, artworkUrl: q.origin === 'local' ? null : q.artworkUrl }));
  await kvSet('player-state', {
    queue,
    index: state.index,
    volume: state.volume,
    muted: state.muted,
    rate: state.rate,
    shuffle: state.shuffle,
    repeat: state.repeat,
    position: engine.audio.currentTime || 0,
  }).catch(() => { });
}

let persistTimer: ReturnType<typeof setInterval> | null = null;

export const usePlayer = create<PlayerState>((set, get) => {
  const loadAndPlay = async (index: number, autoplay = true) => {
    const { queue } = get();
    const item = queue[index];
    if (!item) return;
    set({ index, loading: true, error: null, externalLink: null });
    const resolved = await resolveSrc(item);
    if (!resolved) {
      set({ loading: false, error: `Couldn't load “${item.title}”. The file may have been removed. Try another track.`, playing: false });
      return;
    }
    if ('error' in resolved) {
      set({ loading: false, error: resolved.error, playing: false });
      return;
    }
    if ('external' in resolved) {
      // Direct playback isn't permitted for this source - playback happens
      // on the official external page; communicate rather than fake it.
      set({
        loading: false,
        playing: false,
        error: `“${item.title}” plays on ${resolved.label}.`,
        externalLink: { url: resolved.external, label: resolved.label },
      });
      return;
    }
    try {
      await engine.load(resolved.src);
      if (autoplay) {
        await engine.play();
        set({ playing: true, loading: false });
        reportPlay(item);
      } else {
        set({ loading: false });
      }
    } catch (err) {
      console.warn('[player] play failed', err);
      set({ loading: false, playing: false, error: 'This track couldn’t be played right now. Skip ahead or try again.' });
    }
    void persistState(get());
  };

  /* wire engine events once */
  engine.audio.addEventListener('ended', () => {
    const { repeat, next } = get();
    if (repeat === 'one') {
      engine.seek(0);
      void engine.play();
    } else {
      void next();
    }
  });
  engine.audio.addEventListener('durationchange', () => {
    set({ duration: engine.audio.duration || 0 });
  });
  engine.audio.addEventListener('pause', () => {
    if (!engine.audio.ended) set({ playing: false });
  });
  engine.audio.addEventListener('play', () => set({ playing: true, error: null }));

  if (!persistTimer) {
    persistTimer = setInterval(() => {
      const s = get();
      if (s.queue.length) void persistState(s);
    }, 10_000);
  }

  return {
    queue: [],
    index: -1,
    playing: false,
    loading: false,
    duration: 0,
    volume: 1,
    muted: false,
    rate: 1,
    shuffle: false,
    repeat: 'off',
    view: 'compact',
    error: null,
    externalLink: null,

    current: () => {
      const { queue, index } = get();
      return queue[index] ?? null;
    },

    playQueue: async (items, startIndex = 0) => {
      if (!items.length) return;
      set({ queue: items });
      await loadAndPlay(startIndex);
    },

    playNow: async (item) => {
      const { queue, index } = get();
      const rest = queue.slice(index + 1);
      const newQueue = [...queue.slice(0, index + 1), item, ...rest];
      set({ queue: newQueue });
      await loadAndPlay(index + 1);
    },

    enqueue: (items) => {
      const { queue, index } = get();
      set({ queue: [...queue, ...items] });
      if (index === -1 && items.length) void get().jumpTo(queue.length);
    },

    playNext: (item) => get().insertNext([item]),

    insertNext: (items) => {
      if (!items.length) return;
      const { queue, index } = get();
      const newQueue = [...queue];
      newQueue.splice(index + 1, 0, ...items);
      set({ queue: newQueue });
      if (index === -1) void get().jumpTo(0);
    },

    /**
     * Reorder within the live queue. The playing entry keeps playing: we
     * track it by queueId and recompute `index` afterwards, so nothing
     * reloads and no second queue is ever created.
     */
    moveInQueue: (queueId, toIndex) => {
      const { queue, index } = get();
      const from = queue.findIndex((q) => q.queueId === queueId);
      if (from === -1) return;
      const target = Math.max(0, Math.min(toIndex, queue.length - 1));
      if (from === target) return;
      const playingId = queue[index]?.queueId ?? null;
      const newQueue = [...queue];
      const [moved] = newQueue.splice(from, 1);
      newQueue.splice(target, 0, moved);
      const newIndex = playingId ? newQueue.findIndex((q) => q.queueId === playingId) : index;
      set({ queue: newQueue, index: newIndex });
      void persistState({ ...get(), queue: newQueue, index: newIndex });
    },

    removeFromQueue: (queueId) => {
      const { queue, index } = get();
      const removeIdx = queue.findIndex((q) => q.queueId === queueId);
      if (removeIdx === -1) return;
      const newQueue = queue.filter((q) => q.queueId !== queueId);
      let newIndex = index;
      if (removeIdx < index) newIndex = index - 1;
      else if (removeIdx === index) {
        // keep playing current audio; index now points at next item implicitly
        newIndex = Math.min(index, newQueue.length - 1);
      }
      set({ queue: newQueue, index: newIndex });
    },

    clearQueue: () => {
      engine.pause();
      set({ queue: [], index: -1, playing: false, duration: 0 });
      void kvSet('player-state', null);
    },

    toggle: async () => {
      const { playing, index, queue } = get();
      if (index === -1 && queue.length) return get().jumpTo(0);
      if (playing) {
        engine.pause();
        set({ playing: false });
      } else {
        try {
          await engine.play();
          set({ playing: true });
        } catch { /* ignore */ }
      }
    },

    next: async () => {
      const { queue, index, shuffle, repeat } = get();
      if (!queue.length) return;
      let nextIdx: number;
      if (shuffle && queue.length > 1) {
        do { nextIdx = Math.floor(Math.random() * queue.length); } while (nextIdx === index);
      } else {
        nextIdx = index + 1;
        if (nextIdx >= queue.length) {
          if (repeat === 'all') nextIdx = 0;
          else { set({ playing: false }); return; }
        }
      }
      await loadAndPlay(nextIdx);
    },

    prev: async () => {
      const { queue, index } = get();
      if (!queue.length) return;
      if (engine.audio.currentTime > 3 || index <= 0) {
        engine.seek(0);
        return;
      }
      await loadAndPlay(index - 1);
    },

    seekTo: (seconds) => engine.seek(seconds),

    setVolume: (v) => {
      engine.setVolume(v);
      set({ volume: v, muted: v === 0 ? get().muted : false });
      if (v > 0) engine.setMuted(false);
    },

    toggleMute: () => {
      const m = !get().muted;
      engine.setMuted(m);
      set({ muted: m });
    },

    setRate: (r) => {
      engine.setRate(r);
      set({ rate: r });
    },

    toggleShuffle: () => set((s) => ({ shuffle: !s.shuffle })),

    cycleRepeat: () =>
      set((s) => ({ repeat: s.repeat === 'off' ? 'all' : s.repeat === 'all' ? 'one' : 'off' })),

    setView: (v) => set({ view: v }),

    jumpTo: async (queueIndex) => {
      await loadAndPlay(queueIndex);
    },
  };
});

/* -------------------------- restore persisted state ------------------------ */

export async function restorePlayerState(): Promise<void> {
  try {
    const saved = await kvGet<any>('player-state');
    if (!saved?.queue?.length) return;
    const store = usePlayer.getState();
    usePlayer.setState({
      queue: saved.queue,
      index: Math.min(saved.index ?? 0, saved.queue.length - 1),
      volume: saved.volume ?? 1,
      muted: saved.muted ?? false,
      rate: saved.rate ?? 1,
      shuffle: saved.shuffle ?? false,
      repeat: saved.repeat ?? 'off',
    });
    engine.setVolume(saved.volume ?? 1);
    engine.setMuted(saved.muted ?? false);
    engine.setRate(saved.rate ?? 1);
    // Preload current track paused at the saved position (no autoplay).
    const item = saved.queue[Math.min(saved.index ?? 0, saved.queue.length - 1)];
    if (item) {
      const resolved = await resolveSrc(item);
      const src = resolved && 'src' in resolved ? resolved.src : null;
      if (src) {
        await engine.load(src);
        if (saved.position > 0) {
          const onMeta = () => {
            engine.seek(saved.position);
            engine.audio.removeEventListener('loadedmetadata', onMeta);
          };
          engine.audio.addEventListener('loadedmetadata', onMeta);
        }
      }
    }
    void store;
  } catch (err) {
    console.warn('[player] restore failed', err);
  }
}

/* ------------------------------ media session ----------------------------- */

export function setupMediaSession(): void {
  if (!('mediaSession' in navigator)) return;
  const ms = navigator.mediaSession;
  ms.setActionHandler('play', () => void usePlayer.getState().toggle());
  ms.setActionHandler('pause', () => void usePlayer.getState().toggle());
  ms.setActionHandler('previoustrack', () => void usePlayer.getState().prev());
  ms.setActionHandler('nexttrack', () => void usePlayer.getState().next());
  ms.setActionHandler('seekto', (d) => {
    if (d.seekTime != null) usePlayer.getState().seekTo(d.seekTime);
  });

  usePlayer.subscribe((state, prev) => {
    const item = state.queue[state.index];
    const prevItem = prev.queue[prev.index];
    if (item && item !== prevItem) {
      ms.metadata = new MediaMetadata({
        title: item.title,
        artist: item.artistName,
        album: item.albumTitle ?? 'ResonTune',
        artwork: item.artworkUrl
          ? [{ src: item.artworkUrl, sizes: '512x512' }]
          : [],
      });
    }
    ms.playbackState = state.playing ? 'playing' : 'paused';
  });
}
