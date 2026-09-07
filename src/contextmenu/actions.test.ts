/**
 * The action model: what each kind of target may do, and what it may not.
 *
 * These tests assert the contract every surface depends on — right-click,
 * the ⋮ button and the mobile sheet all render exactly this list.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildActions, type ActionContext } from './actions';
import type { ContextTarget } from './types';
import { usePlayer } from '@/player/store';
import { makeAlbum, makeArtist, makePlaylist, makeQueueItem, makeTrack, makeUser } from '@/test/fixtures';

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(async () => ({ tracks: [], popularTracks: [] })),
    post: vi.fn(async () => ({})),
    patch: vi.fn(async () => ({})),
    del: vi.fn(async () => ({})),
  },
  ApiError: class extends Error {},
}));

const baseCtx = (over: Partial<ActionContext> = {}): ActionContext => ({
  navigate: vi.fn() as unknown as ActionContext['navigate'],
  pathname: '/',
  user: null,
  isFavorite: () => false,
  queue: [],
  queueIndex: -1,
  playing: false,
  ...over,
});

const ids = (target: ContextTarget, ctx = baseCtx()) => buildActions(target, ctx).map((a) => a.id);
const labels = (target: ContextTarget, ctx = baseCtx()) => buildActions(target, ctx).map((a) => a.label);

describe('track actions', () => {
  it('offers playback, queue, library, navigation and sharing', () => {
    const list = ids({ type: 'track', track: makeTrack() });
    expect(list).toEqual(
      expect.arrayContaining(['play', 'play-next', 'add-queue', 'add-playlist', 'favorite', 'go-artist', 'go-release', 'share', 'copy-link']),
    );
  });

  it('hides "go to release" for a track with no release', () => {
    const list = ids({ type: 'track', track: makeTrack({ album: null }) });
    expect(list).not.toContain('go-release');
    expect(list).toContain('go-artist');
  });

  it('offers no playback actions for a track with no playable source', () => {
    const list = ids({ type: 'track', track: makeTrack({ sources: [] }) });
    expect(list).not.toContain('play');
    expect(list).not.toContain('play-next');
    expect(list).not.toContain('add-queue');
    // …but it can still be shared and navigated to.
    expect(list).toContain('copy-link');
  });

  it('drops the redundant navigation entry when already on that page', () => {
    const ctx = baseCtx({ pathname: '/track/night-bus' });
    expect(ids({ type: 'track', track: makeTrack() }, ctx)).not.toContain('go-track');
  });

  it('reflects favourite state in the label', () => {
    const track = makeTrack();
    expect(labels({ type: 'track', track })).toContain('Add to favorites');
    const liked = baseCtx({ isFavorite: () => true });
    expect(labels({ type: 'track', track }, liked)).toContain('Remove from favorites');
  });

  it('only offers playlist removal to someone who owns the playlist', () => {
    const track = makeTrack();
    const owned: ContextTarget = { type: 'track', track, playlist: { id: 'pl-1', title: 'Late Shift', owned: true } };
    const notOwned: ContextTarget = { type: 'track', track, playlist: { id: 'pl-1', title: 'Late Shift', owned: false } };
    expect(ids(owned)).toContain('remove-from-playlist');
    expect(ids(notOwned)).not.toContain('remove-from-playlist');
  });
});

describe('artist and release actions', () => {
  it('gives an artist play, queue, navigation and share actions', () => {
    const list = ids({ type: 'artist', artist: makeArtist() });
    expect(list).toEqual(expect.arrayContaining(['play-artist', 'play-next', 'add-queue', 'go-artist', 'share', 'copy-link']));
  });

  it('gives a release play, queue, playlist and artist navigation', () => {
    const list = ids({ type: 'release', release: { id: 'alb-1', slug: 'harmattan-sessions', title: 'Harmattan Sessions', artist: makeAlbum().artist } });
    expect(list).toEqual(expect.arrayContaining(['play-release', 'play-next', 'add-queue', 'add-playlist', 'go-release', 'go-artist', 'share']));
  });
});

describe('playlist actions', () => {
  const playlist = makePlaylist();

  it('never offers destructive actions to a non-owner', () => {
    const list = ids({ type: 'playlist', playlist }, baseCtx({ user: makeUser({ id: 'someone-else' }) }));
    expect(list).not.toContain('rename');
    expect(list).not.toContain('delete');
    expect(list).not.toContain('visibility');
    expect(list).toContain('duplicate');
  });

  it('offers rename, visibility and delete to the owner', () => {
    const owner = makeUser({ id: playlist.ownerId! });
    const list = ids({ type: 'playlist', playlist }, baseCtx({ user: owner }));
    expect(list).toEqual(expect.arrayContaining(['rename', 'visibility', 'delete']));
    // copying your own playlist is a normal thing to want
    expect(list).toContain('duplicate');
  });

  it('offers nothing destructive to a signed-out visitor', () => {
    const list = ids({ type: 'playlist', playlist });
    expect(list).not.toContain('delete');
    expect(list).not.toContain('duplicate');
  });

  it('exports a playlist anyone can see, but not one with no tracks', () => {
    expect(ids({ type: 'playlist', playlist })).toContain('export-m3u');
    expect(ids({ type: 'playlist', playlist: makePlaylist({ trackCount: 0 }) })).not.toContain('export-m3u');
  });

  it('does not offer playback for an empty playlist', () => {
    const list = ids({ type: 'playlist', playlist: makePlaylist({ trackCount: 0 }) });
    expect(list).not.toContain('play');
  });

  it('does not offer sharing links to a private playlist a visitor cannot open', () => {
    const list = ids({ type: 'playlist', playlist: makePlaylist({ isPublic: false }) });
    expect(list).not.toContain('share');
  });
});

describe('queue item actions', () => {
  beforeEach(() => {
    usePlayer.setState({ queue: [], index: -1, playing: false });
  });

  const queue = [makeQueueItem({ queueId: 'q-1' }), makeQueueItem({ queueId: 'q-2', id: 'trk-2' }), makeQueueItem({ queueId: 'q-3', id: 'trk-3' })];

  it('acts on the live queue, and offers move/remove for a pending item', () => {
    const ctx = baseCtx({ queue, queueIndex: 0, playing: true });
    const list = ids({ type: 'queue-item', item: queue[2], index: 2 }, ctx);
    expect(list).toEqual(expect.arrayContaining(['play-now', 'play-next', 'move-top', 'remove']));
  });

  it('does not offer to move the playing item next to itself', () => {
    const ctx = baseCtx({ queue, queueIndex: 0, playing: true });
    const list = ids({ type: 'queue-item', item: queue[0], index: 0 }, ctx);
    expect(list).not.toContain('play-next');
    expect(list).not.toContain('move-top');
    expect(labels({ type: 'queue-item', item: queue[0], index: 0 }, ctx)).toContain('Pause');
  });

  it('returns nothing for a row that has already left the queue', () => {
    const ctx = baseCtx({ queue, queueIndex: 0 });
    expect(ids({ type: 'queue-item', item: makeQueueItem({ queueId: 'gone' }), index: 9 }, ctx)).toEqual([]);
  });

  it('mutates the real player queue', async () => {
    usePlayer.setState({ queue: [...queue], index: 0, playing: false });
    const ctx = baseCtx({ queue: usePlayer.getState().queue, queueIndex: 0 });
    const actions = buildActions({ type: 'queue-item', item: queue[2], index: 2 }, ctx);

    await actions.find((a) => a.id === 'play-next')!.run();
    expect(usePlayer.getState().queue.map((q) => q.queueId)).toEqual(['q-1', 'q-3', 'q-2']);
    expect(usePlayer.getState().index).toBe(0);      // the playing entry stayed put

    const after = usePlayer.getState();
    const removal = buildActions(
      { type: 'queue-item', item: queue[2], index: 1 },
      baseCtx({ queue: after.queue, queueIndex: after.index }),
    );
    await removal.find((a) => a.id === 'remove')!.run();
    expect(usePlayer.getState().queue.map((q) => q.queueId)).toEqual(['q-1', 'q-2']);
  });

  it('moves an item to the top without disturbing what is playing', async () => {
    usePlayer.setState({ queue: [...queue], index: 1, playing: true });
    const ctx = baseCtx({ queue: usePlayer.getState().queue, queueIndex: 1 });
    const actions = buildActions({ type: 'queue-item', item: queue[2], index: 2 }, ctx);
    await actions.find((a) => a.id === 'move-top')!.run();
    const state = usePlayer.getState();
    expect(state.queue.map((q) => q.queueId)).toEqual(['q-3', 'q-1', 'q-2']);
    expect(state.queue[state.index].queueId).toBe('q-2');
  });
});

describe('admin actions', () => {
  const entity = { id: 'trk-1', title: 'Night Bus', status: 'published' as const, slug: 'night-bus' };

  it('are invisible to listeners', () => {
    expect(ids({ type: 'admin-track', entity }, baseCtx({ user: makeUser() }))).toEqual([]);
    expect(ids({ type: 'admin-track', entity })).toEqual([]);
  });

  it('let moderators look but not touch', () => {
    const list = ids({ type: 'admin-track', entity }, baseCtx({ user: makeUser({ role: 'moderator' }) }));
    expect(list).toContain('edit');
    expect(list).toContain('preview');
    expect(list).not.toContain('publish');
    expect(list).not.toContain('delete');
  });

  it('give administrators the full set', () => {
    const list = ids({ type: 'admin-track', entity }, baseCtx({ user: makeUser({ role: 'admin' }) }));
    expect(list).toEqual(expect.arrayContaining(['edit', 'preview', 'publish', 'copy-link', 'delete']));
  });

  it('offer no public preview for a withdrawn entity', () => {
    const admin = baseCtx({ user: makeUser({ role: 'admin' }) });
    const list = ids({ type: 'admin-release', entity: { ...entity, status: 'taken_down' } }, admin);
    expect(list).not.toContain('preview');
    expect(labels({ type: 'admin-release', entity: { ...entity, status: 'taken_down' } }, admin)).toContain('Publish');
  });
});
