import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  classifyNav,
  markNav,
  prefersReducedMotion,
  resetMotionForTests,
  routeDepth,
  sharedStyle,
  shouldViewTransition,
  vtName,
  withViewTransition,
} from './motion';

afterEach(() => {
  resetMotionForTests('/');
  Object.defineProperty(document, 'startViewTransition', { configurable: true, value: undefined });
  vi.unstubAllGlobals();
});

describe('routeDepth', () => {
  it('treats the front door as a browse destination, not a shallower layer', () => {
    expect(routeDepth('/')).toBe(1);
  });

  it('groups browse, library and settings as siblings', () => {
    for (const path of ['/discover', '/originals', '/community', '/radio', '/search', '/playlists', '/library', '/settings', '/about', '/albums', '/artists']) {
      expect(routeDepth(path)).toBe(1);
    }
  });

  it('treats records, people and playlists as a step deeper', () => {
    expect(routeDepth('/track/aurora')).toBe(2);
    expect(routeDepth('/artist/mira')).toBe(2);
    expect(routeDepth('/release/night-bus')).toBe(2);
    expect(routeDepth('/playlist/evening')).toBe(2);
    expect(routeDepth('/collection/first-light')).toBe(2);
    expect(routeDepth('/u/mira')).toBe(2);
    expect(routeDepth('/admin/tracks/1')).toBe(2);
  });
});

describe('classifyNav', () => {
  it('crossfades sibling destinations', () => {
    expect(classifyNav('/', '/discover')).toBe('fade');
    expect(classifyNav('/discover', '/originals')).toBe('fade');
    expect(classifyNav('/playlists', '/favorites')).toBe('fade');
    expect(classifyNav('/playlists', '/library')).toBe('fade');
    expect(classifyNav('/about', '/settings')).toBe('fade');
  });

  it('steps forward into a detail and back out of one', () => {
    expect(classifyNav('/', '/track/aurora')).toBe('forward');
    expect(classifyNav('/discover', '/artist/mira')).toBe('forward');
    expect(classifyNav('/playlists', '/playlist/evening')).toBe('forward');
    expect(classifyNav('/track/aurora', '/')).toBe('back');
    expect(classifyNav('/release/night-bus', '/albums')).toBe('back');
    expect(classifyNav('/u/mira', '/settings')).toBe('back');
  });

  it('treats browser history pops as back, even between siblings', () => {
    expect(classifyNav('/discover', '/', true)).toBe('back');
    expect(classifyNav('/track/aurora', '/discover', true)).toBe('back');
  });

  it('does not slide FLOW in or out', () => {
    expect(classifyNav('/', '/game')).toBe('fade');
    expect(classifyNav('/game', '/')).toBe('fade');
  });

  it('ignores search strings when comparing destinations', () => {
    expect(classifyNav('/search', '/search?q=drift')).toBe('fade');
  });
});

describe('vtName', () => {
  it('builds a CSS-safe ident from an entity id', () => {
    expect(vtName('track', 'abc-123')).toBe('rt-track-abc-123');
    expect(vtName('release', 'Night Bus!')).toBe('rt-release-NightBus');
  });

  it('falls back when the id has no usable characters', () => {
    expect(vtName('artist', '!!!')).toBe('rt-artist-x');
  });

  it('does not assign a morph name under reduced motion', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    }));
    expect(sharedStyle('track', 'abc')).toBeUndefined();
  });
});

describe('withViewTransition', () => {
  it('runs the update immediately when the API is missing', () => {
    const update = vi.fn();
    withViewTransition(update, 'forward');
    expect(update).toHaveBeenCalledOnce();
  });

  it('wraps the update when View Transitions are available', async () => {
    const finished = Promise.resolve();
    const start = vi.fn((cb: () => void) => {
      cb();
      return { finished };
    });
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: start,
    });
    const update = vi.fn();
    withViewTransition(update, 'forward');
    expect(start).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
    expect(document.documentElement.dataset.vt).toBe('forward');
    await finished;
  });

  it('skips the API under prefers-reduced-motion', () => {
    const start = vi.fn();
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: start,
    });
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    }));
    expect(prefersReducedMotion()).toBe(true);
    expect(shouldViewTransition()).toBe(false);
    const update = vi.fn();
    withViewTransition(update, 'forward');
    expect(start).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledOnce();
  });
});

describe('markNav', () => {
  it('stamps the document with the classified direction', () => {
    resetMotionForTests('/');
    expect(markNav('/track/aurora')).toBe('forward');
    expect(document.documentElement.dataset.vt).toBe('forward');
    resetMotionForTests('/track/aurora');
    expect(markNav('/')).toBe('back');
    expect(document.documentElement.dataset.vt).toBe('back');
  });
});
