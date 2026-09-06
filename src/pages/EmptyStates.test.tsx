/**
 * A brand-new instance with an empty database.
 *
 * The catalog starts empty — no artists, no releases, no tracks, no
 * playlists — and every destination has to say so on purpose instead of
 * rendering a blank page or inventing placeholder music.
 */
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Home from '@/pages/Home';
import Search from '@/pages/Search';
import { useAuth } from '@/stores/auth';
import { usePlayer } from '@/player/store';

const apiGet = vi.fn(async (path: string) => {
  if (path.startsWith('/home')) {
    return {
      featuredRelease: null,
      originals: [],
      collections: [],
      trending: [],
      newReleases: [],
      risingArtists: [],
      communityPicks: [],
    };
  }
  if (path.startsWith('/search')) {
    return { tracks: [], artists: [], albums: [], playlists: [] };
  }
  return {};
});

vi.mock('@/lib/api', () => ({
  api: {
    get: (path: string) => apiGet(path),
    post: vi.fn(async () => ({})),
    patch: vi.fn(async () => ({})),
    del: vi.fn(async () => ({})),
  },
  ApiError: class extends Error {},
}));

/* No local library either — this is a fresh browser as well as a fresh DB. */
vi.mock('@/local/db', () => ({
  listLocalTracks: vi.fn(async () => []),
}));

vi.mock('@/player/engine', () => {
  const audio = document.createElement('audio');
  return {
    engine: {
      audio,
      analysisReady: false,
      ensureAnalysis: () => {},
      onTime: () => () => {},
      readFrame: () => null,
      load: async () => {},
      play: async () => {},
      pause: () => {},
      seek: () => {},
      setMuted: () => {},
      setRate: () => {},
      setVolume: () => {},
    },
  };
});

const renderPage = (ui: React.ReactNode, path = '/') =>
  render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);

beforeEach(() => {
  useAuth.setState({ user: null, favoriteIds: new Set() });
  usePlayer.setState({ queue: [], index: -1, playing: false });
  apiGet.mockClear();
});

describe('an empty catalog', () => {
  it('greets the visitor and explains that Home has no music yet', async () => {
    renderPage(<Home />);

    // The greeting belongs to the visitor, not to the catalog.
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeTruthy());
    expect(await screen.findByText('No music yet')).toBeTruthy();
    // Nothing invented to fill the space.
    expect(document.querySelectorAll('.track-row').length).toBe(0);
    expect(document.querySelectorAll('.tile').length).toBe(0);
  });

  it('points an empty Home at the two real ways to get music in', async () => {
    renderPage(<Home />);
    await screen.findByText('No music yet');
    expect(screen.getByRole('link', { name: 'locally stored music' }).getAttribute('href')).toBe('/library');
    expect(screen.getByRole('link', { name: 'release music' }).getAttribute('href')).toBe('/submit');
  });

  it('gives Search something to say before anything is typed', async () => {
    renderPage(<Search />, '/search');
    expect(await screen.findByText('Search ResonTune')).toBeTruthy();
    expect(screen.getByLabelText('Search query')).toBeTruthy();
  });

  it('reports an honest no-results state and offers to clear the query', async () => {
    renderPage(<Search />, '/search?q=drift');

    expect(await screen.findByText(/Nothing found/)).toBeTruthy();
    const clear = screen.getByLabelText('Clear search');
    expect(clear).toBeTruthy();
  });

  it('keeps the query it was opened with', async () => {
    renderPage(<Search />, '/search?q=drift');
    const input = screen.getByLabelText('Search query') as HTMLInputElement;
    expect(input.value).toBe('drift');
  });
});
