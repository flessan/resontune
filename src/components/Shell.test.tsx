/**
 * The mobile shell contract.
 *
 * These are the guarantees a phone depends on: a bottom navigation with real
 * destinations, a header that offers search without a squeezed field, a
 * player row that only exists while something is playing, and a drawer that
 * does not let the page wander off behind it. jsdom cannot measure any of
 * the geometry, so each assertion is about structure and state - the parts
 * that break silently when a component is refactored.
 */
import { act } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Layout } from './Layout';
import { usePlayer } from '@/player/store';
import { useAuth } from '@/stores/auth';
import { makeQueueItem } from '@/test/fixtures';

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(async () => ({})),
    post: vi.fn(async () => ({})),
    patch: vi.fn(async () => ({})),
    del: vi.fn(async () => ({})),
  },
  ApiError: class extends Error { },
}));

/* Expanding the player mounts the ambient visualizer - that engine is
   not the shell's contract, and jsdom has no 2d canvas. */
vi.mock('@/visualizer/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/visualizer/engine')>();
  return {
    ...actual,
    VisualizerRunner: class {
      start() {}
      destroy() {}
      setMode() {}
      setSettings() {}
      setPaused() {}
      setPaper() {}
      setAccent() {}
      setArtwork() {}
    },
  };
});

/* The audio engine belongs to the browser, not to the shell. */
vi.mock('@/player/engine', () => {
  const audio = document.createElement('audio');
  return {
    engine: {
      audio,
      analysisReady: false,
      ensureAnalysis: () => { },
      onTime: () => () => { },
      readFrame: () => null,
      load: async () => { },
      play: async () => { },
      pause: () => { },
      seek: () => { },
      setMuted: () => { },
      setRate: () => { },
      setVolume: () => { },
    },
  };
});

function renderShell(initial = '/') {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<div className="page">Home page</div>} />
          <Route path="/search" element={<div className="page">Search page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  usePlayer.setState({ queue: [], index: -1, playing: false, view: 'compact' });
  useAuth.setState({ user: null, favoriteIds: new Set() });
  document.body.classList.remove('scroll-locked');
});

afterEach(() => {
  document.body.classList.remove('scroll-locked');
});

describe('the mobile shell', () => {
  it('offers the four core destinations in the bottom navigation', () => {
    renderShell();
    const tabbar = document.querySelector('.tabbar')!;
    expect(tabbar).toBeTruthy();
    const links = within(tabbar as HTMLElement).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['Home', 'Search', 'Radio', 'Library']);
    for (const link of links) expect(link.getAttribute('href')).toBeTruthy();
  });

  it('marks the current destination in the navigation', () => {
    renderShell('/search');
    const tabbar = document.querySelector('.tabbar')!;
    const active = tabbar.querySelectorAll('a.active');
    expect(active.length).toBe(1);
    expect(active[0].textContent).toBe('Search');
  });

  it('puts a labelled search action in the header, pointing at the search page', () => {
    renderShell();
    const search = document.querySelector('.topbar-search') as HTMLAnchorElement;
    expect(search).toBeTruthy();
    expect(search.getAttribute('aria-label')).toBe('Search');
    expect(search.getAttribute('href')).toBe('/search');
  });

  it('keeps the typed query while the header search field is used', () => {
    renderShell();
    const input = document.getElementById('global-search') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'drift' } });
    expect(input.value).toBe('drift');
  });

  it('reserves the player row only while something is queued', async () => {
    renderShell();
    const app = document.querySelector('.app')!;
    expect(app.classList.contains('has-player')).toBe(false);

    act(() => { usePlayer.setState({ queue: [makeQueueItem()], index: 0, playing: true }); });
    await waitFor(() => expect(document.querySelector('.app')!.classList.contains('has-player')).toBe(true));
    expect(document.querySelector('.player-bar')!.classList.contains('has-item')).toBe(true);

    act(() => { usePlayer.setState({ queue: [], index: -1, playing: false }); });
    await waitFor(() => expect(document.querySelector('.app')!.classList.contains('has-player')).toBe(false));
  });

  it('names every icon-only control in the mini player', () => {
    usePlayer.setState({ queue: [makeQueueItem()], index: 0, playing: false });
    renderShell();
    const bar = document.querySelector('.player-bar')!;
    for (const button of bar.querySelectorAll('button')) {
      const name = button.getAttribute('aria-label') ?? button.textContent?.trim();
      expect(name).toBeTruthy();
    }
  });

  it('wraps routed content in a page stage so chrome can stay still', () => {
    renderShell();
    expect(document.querySelector('.page-stage')).toBeTruthy();
    expect(document.querySelector('.page-stage')!.textContent).toContain('Home page');
  });

  it('keeps the drawer in the document after it closes', async () => {
    renderShell();
    fireEvent.click(screen.getByLabelText('Open navigation'));
    await waitFor(() => expect(document.querySelector('.drawer')!.classList.contains('open')).toBe(true));
    fireEvent.click(screen.getByLabelText('Close navigation'));
    await waitFor(() => expect(document.querySelector('.drawer')!.classList.contains('open')).toBe(false));
    expect(document.querySelector('.drawer')).toBeTruthy();
  });

  it('expands the player without pausing playback', async () => {
    usePlayer.setState({ queue: [makeQueueItem()], index: 0, playing: true, view: 'compact' });
    renderShell();
    fireEvent.click(screen.getByLabelText('Expand player'));
    await waitFor(() => expect(usePlayer.getState().view).toBe('expanded'));
    expect(usePlayer.getState().playing).toBe(true);
    expect(document.querySelector('.player-sheet')).toBeTruthy();
    expect(document.querySelector('.player-bar')).toBeTruthy();
  });

  it('holds the page still while the navigation drawer is open', async () => {
    renderShell();
    const hamburger = screen.getByLabelText('Open navigation');

    fireEvent.click(hamburger);
    await waitFor(() => expect(document.body.classList.contains('scroll-locked')).toBe(true));
    expect(document.querySelector('.drawer')!.classList.contains('open')).toBe(true);

    fireEvent.click(screen.getByLabelText('Close navigation'));
    await waitFor(() => expect(document.body.classList.contains('scroll-locked')).toBe(false));
  });

  it('shows a sign-in affordance to an anonymous visitor and a profile link to a member', async () => {
    renderShell();
    const topbar = document.querySelector('.topbar') as HTMLElement;
    expect(within(topbar).getByRole('button', { name: 'Sign in' })).toBeTruthy();

    act(() => {
      useAuth.setState({
        user: {
          id: 'u-1', handle: 'mira', displayName: 'Mira', email: 'm@example.com',
          role: 'listener', avatarUrl: null, avatarThumbUrl: null,
        } as never,
        favoriteIds: new Set(),
      });
    });

    await waitFor(() => expect(document.querySelector('.topbar-avatar')).toBeTruthy());
    expect(document.querySelector('.topbar-avatar')!.getAttribute('href')).toBe('/u/mira');
  });
});
