/**
 * The touch half of the contextual system, and the state hygiene that keeps
 * an open menu honest.
 *
 * jsdom has no layout and no real touch, so these tests assert behaviour the
 * DOM can actually show: which surface renders, what happens to the page
 * behind it, whether a pending long press survives a scroll, and whether the
 * menu lets go of the document when it closes.
 */
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContextMenuRoot } from './ContextMenuRoot';
import { useContextMenu } from './store';
import { useContextTarget } from './useContextTarget';
import type { ContextTarget } from './types';
import { usePlayer } from '@/player/store';
import { useAuth } from '@/stores/auth';
import { scrollLockCount } from '@/lib/scrollLock';
import { makeTrack, makeUser } from '@/test/fixtures';

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(async () => ({ tracks: [] })),
    post: vi.fn(async () => ({ favorited: true })),
    patch: vi.fn(async () => ({})),
    del: vi.fn(async () => ({})),
  },
  ApiError: class extends Error {},
}));

/** Pretend the device is a phone: coarse pointer, narrow viewport. */
function useTouchDevice() {
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    matches: query.includes('coarse'),
    media: query,
    onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {},
    dispatchEvent: () => false,
  } as MediaQueryList));
}

function Entity({ target }: { target: ContextTarget }) {
  const props = useContextTarget(target);
  return <div data-testid="entity" tabIndex={0} {...props}>A registered entity</div>;
}

function renderWithMenu(ui: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      {ui}
      <ContextMenuRoot />
    </MemoryRouter>,
  );
}

const longPress = (el: Element) => {
  fireEvent.pointerDown(el, { pointerType: 'touch', clientX: 40, clientY: 300, pointerId: 1 });
  act(() => { vi.advanceTimersByTime(600); });
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  useContextMenu.setState({ target: null, anchor: null, opener: null });
  usePlayer.setState({ queue: [], index: -1, playing: false });
  useAuth.setState({ user: null, favoriteIds: new Set() });
  document.body.classList.remove('scroll-locked');
});

afterEach(() => {
  act(() => useContextMenu.getState().closeMenu());
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('the action sheet on touch', () => {
  it('opens from a long press, titled with the entity it acts on', async () => {
    useTouchDevice();
    renderWithMenu(<Entity target={{ type: 'track', track: makeTrack() }} />);

    longPress(screen.getByTestId('entity'));

    const sheet = await screen.findByRole('menu');
    expect(sheet.classList.contains('ctx-sheet')).toBe(true);
    expect(within(sheet).getByText('Night Bus')).toBeTruthy();
    expect(within(sheet).getByText('Track')).toBeTruthy();
    expect(within(sheet).getByText('Play')).toBeTruthy();
    expect(within(sheet).getByText('Add to queue')).toBeTruthy();
  });

  it('holds the page still while it is open and lets go afterwards', async () => {
    useTouchDevice();
    renderWithMenu(<Entity target={{ type: 'track', track: makeTrack() }} />);

    longPress(screen.getByTestId('entity'));
    await screen.findByRole('menu');
    expect(document.body.classList.contains('scroll-locked')).toBe(true);

    act(() => { useContextMenu.getState().closeMenu(); });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(document.body.classList.contains('scroll-locked')).toBe(false);
    expect(scrollLockCount()).toBe(0);
  });

  it('dismisses on a downward drag of its handle', async () => {
    useTouchDevice();
    renderWithMenu(<Entity target={{ type: 'track', track: makeTrack() }} />);
    longPress(screen.getByTestId('entity'));
    const sheet = await screen.findByRole('menu');

    const head = sheet.querySelector('.ctx-sheet-head')!;
    fireEvent.pointerDown(head, { pointerId: 7, clientY: 100 });
    fireEvent.pointerMove(head, { pointerId: 7, clientY: 200 });

    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('stays put when the page behind it scrolls', async () => {
    useTouchDevice();
    renderWithMenu(<Entity target={{ type: 'track', track: makeTrack() }} />);
    longPress(screen.getByTestId('entity'));
    await screen.findByRole('menu');

    act(() => { fireEvent.scroll(document, {}); });

    // A floating menu would have to close (its anchor moved); the sheet is
    // attached to the viewport, so it survives.
    expect(screen.queryByRole('menu')).not.toBeNull();
  });
});

describe('a long press competing with a scroll', () => {
  it('is cancelled by a scroll before it fires', async () => {
    useTouchDevice();
    renderWithMenu(<Entity target={{ type: 'track', track: makeTrack() }} />);

    fireEvent.pointerDown(screen.getByTestId('entity'), {
      pointerType: 'touch', clientX: 40, clientY: 300, pointerId: 1,
    });
    act(() => { fireEvent.scroll(document, {}); });
    act(() => { vi.advanceTimersByTime(800); });

    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('is cancelled when the finger travels past the slop', async () => {
    useTouchDevice();
    renderWithMenu(<Entity target={{ type: 'track', track: makeTrack() }} />);
    const entity = screen.getByTestId('entity');

    fireEvent.pointerDown(entity, { pointerType: 'touch', clientX: 40, clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(entity, { pointerType: 'touch', clientX: 44, clientY: 360, pointerId: 1 });
    act(() => { vi.advanceTimersByTime(800); });

    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('ignores a mouse press — long press is a touch gesture', async () => {
    renderWithMenu(<Entity target={{ type: 'track', track: makeTrack() }} />);

    fireEvent.pointerDown(screen.getByTestId('entity'), {
      pointerType: 'mouse', clientX: 40, clientY: 300, pointerId: 1,
    });
    act(() => { vi.advanceTimersByTime(800); });

    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('state that must not go stale', () => {
  it('closes when the signed-in identity changes', async () => {
    useAuth.setState({ user: makeUser(), favoriteIds: new Set() });
    renderWithMenu(<Entity target={{ type: 'track', track: makeTrack() }} />);
    fireEvent.contextMenu(screen.getByTestId('entity'), { clientX: 100, clientY: 100 });
    await screen.findByRole('menu');

    act(() => { useAuth.setState({ user: null, favoriteIds: new Set() }); });

    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(useContextMenu.getState().target).toBeNull();
  });

  it('closes when its target runs out of valid actions', async () => {
    const item = { queueId: 'q-1', id: 'trk-1', title: 'Night Bus', artistName: 'Ayo Ronin', origin: 'remote' as const };
    usePlayer.setState({ queue: [item as never], index: 0, playing: false });
    renderWithMenu(<Entity target={{ type: 'queue-item', item: item as never, index: 0 }} />);
    fireEvent.contextMenu(screen.getByTestId('entity'), { clientX: 100, clientY: 100 });
    await screen.findByRole('menu');

    act(() => { usePlayer.setState({ queue: [], index: -1 }); });

    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('leaves no document listeners behind when it closes', async () => {
    const added = new Map<string, number>();
    const removed = new Map<string, number>();
    const count = (map: Map<string, number>) => (t: string) => map.set(t, (map.get(t) ?? 0) + 1);
    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    addSpy.mockImplementation(function (this: Document, ...args: Parameters<Document['addEventListener']>) {
      count(added)(args[0] as string);
      return Document.prototype.addEventListener.apply(this, args);
    });
    removeSpy.mockImplementation(function (this: Document, ...args: Parameters<Document['removeEventListener']>) {
      count(removed)(args[0] as string);
      return Document.prototype.removeEventListener.apply(this, args);
    });

    const view = renderWithMenu(<Entity target={{ type: 'track', track: makeTrack() }} />);
    fireEvent.contextMenu(screen.getByTestId('entity'), { clientX: 100, clientY: 100 });
    await screen.findByRole('menu');

    act(() => { useContextMenu.getState().closeMenu(); });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    view.unmount();

    for (const type of ['pointerdown', 'contextmenu']) {
      expect(removed.get(type) ?? 0).toBeGreaterThanOrEqual(added.get(type) ?? 0);
    }
  });

  it('returns focus to the row it was opened from', async () => {
    renderWithMenu(<Entity target={{ type: 'track', track: makeTrack() }} />);
    const entity = screen.getByTestId('entity');
    fireEvent.contextMenu(entity, { clientX: 100, clientY: 100 });
    const menu = await screen.findByRole('menu');

    act(() => { fireEvent.keyDown(menu, { key: 'Escape' }); });
    act(() => { vi.advanceTimersByTime(200); });

    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(document.activeElement).toBe(entity);
  });

  it('does not throw when the row it was opened from has been removed', async () => {
    const view = renderWithMenu(<Entity target={{ type: 'track', track: makeTrack() }} />);
    fireEvent.contextMenu(screen.getByTestId('entity'), { clientX: 100, clientY: 100 });
    const menu = await screen.findByRole('menu');

    // The list re-renders without this row while its menu is open.
    view.rerender(
      <MemoryRouter initialEntries={['/']}>
        <div data-testid="replacement" />
        <ContextMenuRoot />
      </MemoryRouter>,
    );
    act(() => { fireEvent.keyDown(menu, { key: 'Escape' }); });
    act(() => { vi.advanceTimersByTime(200); });

    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(screen.getByTestId('replacement')).toBeTruthy();
  });
});
