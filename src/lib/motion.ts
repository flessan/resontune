/**
 * ResonTune motion primitives.
 *
 * One timing scale, a handful of named distances, and a single way to
 * classify a navigation. Components do not invent durations or sprinkle
 * animation classes - they ask this module how the UI is supposed to move.
 *
 * View Transitions are progressive enhancement. Navigation, playback and
 * the visualizer must work identically when the API is missing or the
 * visitor has asked for reduced motion.
 */
import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

/** Milliseconds - keep in lockstep with `--dur-*` in global.css. */
export const DUR = {
  micro: 120,
  quick: 180,
  standard: 260,
  primary: 360,
  sheet: 320,
} as const;

export type SharedKind =
  | 'track'
  | 'release'
  | 'artist'
  | 'playlist'
  | 'collection'
  | 'avatar';

export type NavKind = 'forward' | 'back' | 'fade';

/** Small, framework-agnostic state vocabulary shared by overlays and sheets. */
export type MotionPhase = 'closed' | 'opening' | 'open' | 'closing';
export type SurfaceKind = 'drawer' | 'sheet' | 'modal' | 'menu';

/** Pure transition reducer: keeping this separate from React makes exit cleanup testable. */
export function nextMotionPhase(phase: MotionPhase, open: boolean): MotionPhase {
  if (open) return phase === 'open' || phase === 'opening' ? phase : 'opening';
  return phase === 'closed' || phase === 'closing' ? phase : 'closing';
}

/** Surface-specific geometry; CSS consumes these names instead of guessing from DOM nesting. */
export function surfaceMotion(kind: SurfaceKind, phase: MotionPhase): string {
  return `motion-${kind} ${phase}`;
}

export function motionDuration(reduced = prefersReducedMotion()): number {
  return reduced ? 1 : DUR.standard;
}

const DETAIL_PREFIXES = [
  '/track/',
  '/artist/',
  '/release/',
  '/playlist/',
  '/collection/',
  '/u/',
  '/genre/',
  '/tag/',
  '/admin/',
];

const LIBRARY_ROOTS = ['/playlists', '/favorites', '/history', '/library'];

/** Persistent name for mini ↔ expanded player artwork. Never reused on page tiles. */
export const PLAYER_ART = 'rt-player-art';
export const PLAYER_TITLE = 'rt-player-title';

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function viewTransitionSupported(): boolean {
  return typeof document !== 'undefined'
    && typeof (document as Document & { startViewTransition?: unknown }).startViewTransition === 'function';
}

/** True when we should actually run a View Transition. */
export function shouldViewTransition(): boolean {
  return viewTransitionSupported() && !prefersReducedMotion();
}

/**
 * A CSS `view-transition-name`. Names must be unique among simultaneously
 * visible elements; callers are responsible for arming list items only on
 * the gesture that navigates, so a grid of tiles does not collide.
 */
export function vtName(kind: SharedKind, id: string): string {
  const safe = String(id).replace(/[^a-zA-Z0-9_-]+/g, '').slice(0, 48) || 'x';
  return `rt-${kind}-${safe}`;
}

/** How deep a path sits in the information architecture. */
export function routeDepth(pathname: string): number {
  const p = stripQuery(pathname).replace(/\/+$/, '') || '/';
  // Home sits with Discover / Library / Settings as a browse destination,
  // not a shallower layer - opening a record is the spatial step.
  if (p === '/') return 1;
  if (p === '/profile/edit' || p.startsWith('/profile/edit/')) return 2;
  if (DETAIL_PREFIXES.some((prefix) => p.startsWith(prefix))) return 2;
  if (p === '/admin' || p.startsWith('/admin/')) return 2;
  return 1;
}

function stripQuery(path: string): string {
  const cut = path.indexOf('?');
  return (cut === -1 ? path : path.slice(0, cut)) || '/';
}

function isLibrary(path: string): boolean {
  return LIBRARY_ROOTS.some((root) => path === root || path.startsWith(`${root}/`));
}

/**
 * Sibling browse destinations crossfade. Opening a record, artist, release
 * or profile is a spatial step forward; returning is the reverse. Browser
 * history pops are always back, regardless of depth.
 */
export function classifyNav(from: string, to: string, isPop = false): NavKind {
  if (isPop) return 'back';
  const a = stripQuery(from);
  const b = stripQuery(to);
  if (a === b) return 'fade';
  // FLOW's canvas is expensive to snapshot and is not a spatial detail.
  if (a.startsWith('/game') || b.startsWith('/game')) return 'fade';
  if (isLibrary(a) && isLibrary(b)) return 'fade';
  const da = routeDepth(a);
  const db = routeDepth(b);
  if (db > da) return 'forward';
  if (db < da) return 'back';
  return 'fade';
}

let lastPath = '/';

export function rememberPath(pathname: string): void {
  lastPath = stripQuery(pathname);
}

export function currentPath(): string {
  return lastPath;
}

/** Stamp `html[data-vt]` so CSS can pick the matching page animation. */
export function markNav(toPathname: string, isPop = false): NavKind {
  const kind = classifyNav(lastPath, toPathname, isPop);
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.vt = kind;
  }
  return kind;
}

export function clearNavMark(): void {
  if (typeof document === 'undefined') return;
  delete document.documentElement.dataset.vt;
}

type ViewTransition = { finished: Promise<void> };

/**
 * Run a React state update inside a View Transition when the browser
 * allows it. Falls back to a synchronous update otherwise - callers must
 * never depend on the animation.
 */
export function withViewTransition(update: () => void, kind: string = 'fade'): void {
  if (!shouldViewTransition()) {
    update();
    return;
  }
  const root = document.documentElement;
  root.dataset.vt = kind;
  const start = (document as Document & {
    startViewTransition: (cb: () => void) => ViewTransition;
  }).startViewTransition;
  try {
    const vt = start(() => {
      flushSync(update);
    });
    void vt.finished.finally(() => {
      if (root.dataset.vt === kind) delete root.dataset.vt;
    });
  } catch {
    delete root.dataset.vt;
    update();
  }
}

/** Options to spread onto `navigate()` so programmatic moves use the same path. */
export function vtNavigateOptions(): { viewTransition: boolean } {
  return { viewTransition: shouldViewTransition() };
}

/**
 * Name the shared surface inside `currentTarget` so the outgoing snapshot
 * has a partner for the destination hero. Applied on pointerdown, before
 * React Router starts the View Transition.
 */
export function armSharedElement(currentTarget: EventTarget | null, name: string): void {
  if (!currentTarget || prefersReducedMotion()) return;
  const host = currentTarget as HTMLElement;
  const el = host.querySelector<HTMLElement>('[data-shared]') ?? host;
  el.style.viewTransitionName = name;
}

export function armShared(kind: SharedKind, id: string) {
  const name = vtName(kind, id);
  return {
    onPointerDown: (e: { currentTarget: EventTarget }) => {
      armSharedElement(e.currentTarget, name);
    },
  };
}

export function sharedStyle(kind: SharedKind, id: string): { viewTransitionName: string } | undefined {
  if (typeof window !== 'undefined' && prefersReducedMotion()) return undefined;
  return { viewTransitionName: vtName(kind, id) };
}

/**
 * Keep a surface mounted through its exit animation. Reduced motion skips
 * the delay so the dialog is gone on the next frame.
 */
export function usePresence(open: boolean, ms: number = DUR.quick): { present: boolean; exiting: boolean } {
  const [present, setPresent] = useState(open);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (open) {
      setPresent(true);
      setExiting(false);
      return;
    }
    if (!present) return;
    if (prefersReducedMotion()) {
      setPresent(false);
      setExiting(false);
      return;
    }
    setExiting(true);
    const timer = window.setTimeout(() => {
      setPresent(false);
      setExiting(false);
    }, ms);
    return () => window.clearTimeout(timer);
  }, [open, present, ms]);

  return { present, exiting };
}

/** Test helper - reset the path we use to classify the next navigation. */
export function resetMotionForTests(pathname = '/'): void {
  lastPath = stripQuery(pathname);
  if (typeof document !== 'undefined') delete document.documentElement.dataset.vt;
}
