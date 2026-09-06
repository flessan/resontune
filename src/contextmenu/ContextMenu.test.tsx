/**
 * The contextual menu as the user meets it: right-click, keyboard, touch.
 *
 * jsdom has no native context menu, so "the browser menu still works" is
 * asserted the only way it can be — the app must not call preventDefault on
 * the event, which is exactly what lets the browser show its own menu.
 */
import { act } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContextMenuRoot } from './ContextMenuRoot';
import { useContextMenu } from './store';
import { useContextTarget } from './useContextTarget';
import type { ContextTarget } from './types';
import { TrackRow } from '@/components/TrackRow';
import { usePlayer } from '@/player/store';
import { useAuth } from '@/stores/auth';
import { makeQueueItem, makeTrack, makeUser } from '@/test/fixtures';

const apiPost = vi.fn(async () => ({ favorited: true }));

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(async () => ({ tracks: [], popularTracks: [] })),
    post: (...args: unknown[]) => apiPost(...(args as [])),
    patch: vi.fn(async () => ({})),
    del: vi.fn(async () => ({})),
  },
  ApiError: class extends Error {},
}));

/** Records the current route so navigation is observable. */
function RouteProbe() {
  const location = useLocation();
  return <div data-testid="route">{location.pathname}</div>;
}

function Page({ target }: { target: ContextTarget }) {
  const props = useContextTarget(target);
  return (
    <div>
      <p data-testid="prose">Just some ordinary page text, not a music entity.</p>
      <div data-testid="entity" tabIndex={0} {...props}>
        A registered entity
        <input data-testid="field" defaultValue="type here" />
      </div>
    </div>
  );
}

function renderWithMenu(ui: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <RouteProbe />
      <Routes>
        <Route path="/" element={<>{ui}</>} />
        <Route path="/artist/:slug" element={<div data-testid="artist-page">Artist page</div>} />
      </Routes>
      <ContextMenuRoot />
    </MemoryRouter>,
  );
}

const rightClick = (el: Element, x = 120, y = 140) =>
  fireEvent.contextMenu(el, { clientX: x, clientY: y, bubbles: true });

beforeEach(() => {
  useContextMenu.setState({ target: null, anchor: null, opener: null });
  usePlayer.setState({ queue: [], index: -1, playing: false });
  useAuth.setState({ user: null, favoriteIds: new Set() });
  apiPost.mockClear();
});

afterEach(() => {
  act(() => useContextMenu.getState().closeMenu());
});

describe('opening a menu', () => {
  it('opens the track menu on right-click and suppresses the browser one', async () => {
    renderWithMenu(<TrackRow track={makeTrack()} index={0} />);
    const row = document.querySelector('.track-row')!;

    const notPrevented = rightClick(row);

    expect(notPrevented).toBe(false); // preventDefault() was called
    const menu = await screen.findByRole('menu');
    expect(menu.getAttribute('aria-label')).toBe('Actions for Night Bus');
    expect(within(menu).getByText('Play next')).toBeTruthy();
    expect(within(menu).getByText('Go to artist')).toBeTruthy();
  });

  it('leaves the browser menu alone on ordinary page content', () => {
    renderWithMenu(<Page target={{ type: 'track', track: makeTrack() }} />);

    const notPrevented = rightClick(screen.getByTestId('prose'));

    expect(notPrevented).toBe(true); // the browser will show its own menu
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('leaves the browser menu alone inside a text field, even within a target', () => {
    renderWithMenu(<Page target={{ type: 'track', track: makeTrack() }} />);

    const notPrevented = rightClick(screen.getByTestId('field'));

    expect(notPrevented).toBe(true);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('yields to the browser when Shift is held', () => {
    renderWithMenu(<Page target={{ type: 'track', track: makeTrack() }} />);

    const notPrevented = fireEvent.contextMenu(screen.getByTestId('entity'), {
      clientX: 10, clientY: 10, shiftKey: true,
    });

    expect(notPrevented).toBe(true);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('keeps only one menu open at a time', async () => {
    renderWithMenu(
      <>
        <TrackRow track={makeTrack()} index={0} />
        <TrackRow track={makeTrack({ id: 'trk-2', slug: 'dawn-call', title: 'Dawn Call' })} index={1} />
      </>,
    );
    const rows = document.querySelectorAll('.track-row');

    rightClick(rows[0]);
    await screen.findByRole('menu');
    rightClick(rows[1]);

    const menus = await screen.findAllByRole('menu');
    expect(menus).toHaveLength(1);
    expect(menus[0].getAttribute('aria-label')).toBe('Actions for Dawn Call');
  });

  it('opens from the ⋮ trigger with the same actions', async () => {
    renderWithMenu(<TrackRow track={makeTrack()} index={0} />);

    fireEvent.click(screen.getByRole('button', { name: 'More actions for Night Bus' }));

    const menu = await screen.findByRole('menu');
    expect(within(menu).getByText('Add to queue')).toBeTruthy();
  });
});

describe('keyboard support', () => {
  it('opens with the ContextMenu key and focuses the first item', async () => {
    renderWithMenu(<Page target={{ type: 'track', track: makeTrack() }} />);

    fireEvent.keyDown(screen.getByTestId('entity'), { key: 'ContextMenu' });

    const menu = await screen.findByRole('menu');
    const items = within(menu).getAllByRole('menuitem');
    await waitFor(() => expect(document.activeElement).toBe(items[0]));
  });

  it('moves through items with the arrow keys and wraps around', async () => {
    renderWithMenu(<Page target={{ type: 'track', track: makeTrack() }} />);
    fireEvent.keyDown(screen.getByTestId('entity'), { key: 'ContextMenu' });
    const menu = await screen.findByRole('menu');
    const items = within(menu).getAllByRole('menuitem');

    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    await waitFor(() => expect(document.activeElement).toBe(items[1]));

    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    await waitFor(() => expect(document.activeElement).toBe(items[items.length - 1]));
  });

  it('runs the focused action on Enter and closes', async () => {
    renderWithMenu(<Page target={{ type: 'artist', artist: { slug: 'ayo-ronin', name: 'Ayo Ronin' } }} />);
    fireEvent.keyDown(screen.getByTestId('entity'), { key: 'ContextMenu' });
    const menu = await screen.findByRole('menu');
    const goTo = within(menu).getByText('Go to artist').closest('button')!;
    fireEvent.mouseEnter(goTo);

    fireEvent.keyDown(menu, { key: 'Enter' });

    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await screen.findByTestId('artist-page');
  });

  it('closes on Escape and gives focus back to the opener', async () => {
    renderWithMenu(<Page target={{ type: 'track', track: makeTrack() }} />);
    const entity = screen.getByTestId('entity');
    fireEvent.keyDown(entity, { key: 'ContextMenu' });
    const menu = await screen.findByRole('menu');

    fireEvent.keyDown(menu, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(entity));
  });

  /* Real browsers only: a row is a <div>, so the keyboard is never on the row
     itself — it is on a link or button inside it. Escape must return there. */
  it('returns focus to the element inside the row that the keyboard was on', async () => {
    renderWithMenu(<Page target={{ type: 'track', track: makeTrack() }} />);
    const entity = screen.getByTestId('entity');
    const inner = document.createElement('button');
    inner.textContent = 'Open track';
    entity.appendChild(inner);
    inner.focus();
    expect(document.activeElement).toBe(inner);

    fireEvent.keyDown(inner, { key: 'F10', shiftKey: true });
    const menu = await screen.findByRole('menu');
    fireEvent.keyDown(menu, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(inner));
  });

  /* The opener may be a plain <div> that silently refuses focus; the keyboard
     must land on the scroll container rather than on <body>. */
  it('falls back to the main scroll container when the opener cannot take focus', async () => {
    const main = document.createElement('main');
    main.className = 'main';
    main.tabIndex = -1;
    document.body.appendChild(main);
    try {
      renderWithMenu(<Page target={{ type: 'track', track: makeTrack() }} />);
      const entity = screen.getByTestId('entity');
      entity.removeAttribute('tabindex'); // now unfocusable, like a real row
      rightClick(entity);
      const menu = await screen.findByRole('menu');

      fireEvent.keyDown(menu, { key: 'Escape' });

      await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
      await waitFor(() => expect(document.activeElement).toBe(main));
    } finally {
      main.remove();
    }
  });
});

describe('dismissal', () => {
  it('closes when the pointer goes down elsewhere', async () => {
    renderWithMenu(<Page target={{ type: 'track', track: makeTrack() }} />);
    rightClick(screen.getByTestId('entity'));
    await screen.findByRole('menu');

    fireEvent.pointerDown(document.body);

    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('closes when the route changes underneath it', async () => {
    renderWithMenu(<Page target={{ type: 'track', track: makeTrack() }} />);
    rightClick(screen.getByTestId('entity'));
    await screen.findByRole('menu');

    act(() => { window.history.pushState({}, '', '/'); });
    act(() => { useContextMenu.getState().closeMenu(); });

    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes when its target stops being valid', async () => {
    usePlayer.setState({ queue: [makeQueueItem({ queueId: 'q-1' })], index: 0, playing: false });
    renderWithMenu(<Page target={{ type: 'queue-item', item: makeQueueItem({ queueId: 'q-1' }), index: 0 }} />);
    rightClick(screen.getByTestId('entity'));
    await screen.findByRole('menu');

    act(() => { usePlayer.setState({ queue: [], index: -1 }); });

    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });
});

describe('positioning', () => {
  const realWidth = window.innerWidth;
  const realHeight = window.innerHeight;
  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: realWidth, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: realHeight, configurable: true });
  });

  it('keeps the menu inside the viewport at the bottom-right corner', async () => {
    // A generous menu box in a small window: it must flip, not overflow.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 240, height: 320, top: 0, left: 0, right: 240, bottom: 320, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect);
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 500, configurable: true });

    renderWithMenu(<Page target={{ type: 'track', track: makeTrack() }} />);
    rightClick(screen.getByTestId('entity'), 790, 480);

    const menu = await screen.findByRole('menu');
    await waitFor(() => expect(menu.style.visibility).toBe('visible'));
    const left = Number.parseFloat(menu.style.left);
    const top = Number.parseFloat(menu.style.top);
    expect(left).toBeGreaterThanOrEqual(0);
    expect(top).toBeGreaterThanOrEqual(0);
    expect(left + 240).toBeLessThanOrEqual(800);
    expect(top + 320).toBeLessThanOrEqual(500);
  });
});

describe('contextual state', () => {
  it('flips Like to Unlike through the real auth store', async () => {
    useAuth.setState({ user: makeUser(), favoriteIds: new Set() });
    renderWithMenu(<TrackRow track={makeTrack()} index={0} />);
    rightClick(document.querySelector('.track-row')!);
    const menu = await screen.findByRole('menu');

    fireEvent.click(within(menu).getByText('Add to favorites'));

    await waitFor(() => expect(useAuth.getState().favoriteIds.has('trk-1')).toBe(true));
    expect(apiPost).toHaveBeenCalledWith('/me/favorites/trk-1');

    rightClick(document.querySelector('.track-row')!);
    const reopened = await screen.findByRole('menu');
    expect(within(reopened).getByText('Remove from favorites')).toBeTruthy();
  });

  it('moves a real queue entry when the queue action runs', async () => {
    const queue = [makeQueueItem({ queueId: 'q-1' }), makeQueueItem({ queueId: 'q-2', id: 'trk-2' }), makeQueueItem({ queueId: 'q-3', id: 'trk-3' })];
    usePlayer.setState({ queue, index: 0, playing: true });
    renderWithMenu(<Page target={{ type: 'queue-item', item: queue[2], index: 2 }} />);
    rightClick(screen.getByTestId('entity'));
    const menu = await screen.findByRole('menu');

    fireEvent.click(within(menu).getByText('Move to top'));

    await waitFor(() => expect(usePlayer.getState().queue.map((q) => q.queueId)).toEqual(['q-3', 'q-1', 'q-2']));
  });

  it('never shows catalog management to a listener', async () => {
    useAuth.setState({ user: makeUser({ role: 'listener' }), favoriteIds: new Set() });
    renderWithMenu(
      <Page target={{ type: 'admin-track', entity: { id: 'trk-1', title: 'Night Bus', status: 'published', slug: 'night-bus' } }} />,
    );

    rightClick(screen.getByTestId('entity'));

    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });
});

describe('presentation', () => {
  it('renders an action sheet on a coarse pointer', async () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
      matches: query.includes('coarse'),
      media: query,
      onchange: null,
      addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {},
      dispatchEvent: () => false,
    } as MediaQueryList));

    renderWithMenu(<Page target={{ type: 'track', track: makeTrack() }} />);
    rightClick(screen.getByTestId('entity'));

    const menu = await screen.findByRole('menu');
    expect(menu.classList.contains('ctx-sheet')).toBe(true);
    expect(within(menu).getByText('Night Bus')).toBeTruthy();
    expect(within(menu).getByText('Track')).toBeTruthy();
  });

  it('closes instantly when the user prefers reduced motion', async () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      onchange: null,
      addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {},
      dispatchEvent: () => false,
    } as MediaQueryList));

    renderWithMenu(<Page target={{ type: 'track', track: makeTrack() }} />);
    rightClick(screen.getByTestId('entity'));
    const menu = await screen.findByRole('menu');

    act(() => { fireEvent.keyDown(menu, { key: 'Escape' }); });

    // No exit animation to wait for: the menu is gone on the same tick.
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('groups actions with separators only between real groups', async () => {
    renderWithMenu(<TrackRow track={makeTrack()} index={0} />);
    rightClick(document.querySelector('.track-row')!);
    const menu = await screen.findByRole('menu');

    const groups = menu.querySelectorAll('.ctx-group');
    expect(groups.length).toBeGreaterThan(1);
    for (const group of groups) expect(group.children.length).toBeGreaterThan(0);
  });
});
