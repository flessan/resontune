/**
 * The single open contextual menu.
 *
 * One store instance means one menu can ever be open: a second right-click
 * replaces the first instead of stacking two surfaces. The store holds only
 * *where* and *on what* - the actions themselves are derived at render time
 * so they always reflect current state.
 */
import { create } from 'zustand';
import type { ContextTarget } from './types';

/** Where to put the menu: at a point (cursor) or beside an element. */
export type Anchor =
  | { kind: 'point'; x: number; y: number }
  | { kind: 'element'; rect: { top: number; left: number; right: number; bottom: number } };

export type OpenSource = 'pointer' | 'keyboard' | 'touch' | 'button';

interface ContextMenuState {
  target: ContextTarget | null;
  anchor: Anchor | null;
  source: OpenSource;
  /** Element that opened the menu; focus returns here on close. */
  opener: HTMLElement | null;
  /** Monotonic id so each opening is a fresh mount (no stale animation). */
  openId: number;

  openMenu: (opts: { target: ContextTarget; anchor: Anchor; source?: OpenSource; opener?: HTMLElement | null }) => void;
  closeMenu: () => void;
}

export const useContextMenu = create<ContextMenuState>((set, get) => ({
  target: null,
  anchor: null,
  source: 'pointer',
  opener: null,
  openId: 0,

  openMenu: ({ target, anchor, source = 'pointer', opener = null }) =>
    set({ target, anchor, source, opener, openId: get().openId + 1 }),

  closeMenu: () => {
    if (!get().target) return;
    set({ target: null, anchor: null, opener: null });
  },
}));

/** Imperative helpers for code outside React. */
export const contextMenu = {
  open: (opts: Parameters<ContextMenuState['openMenu']>[0]) => useContextMenu.getState().openMenu(opts),
  close: () => useContextMenu.getState().closeMenu(),
  isOpen: () => useContextMenu.getState().target !== null,
};
