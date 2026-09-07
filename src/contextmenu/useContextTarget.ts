/**
 * Target registration - the entry point of the contextual pipeline.
 *
 * `useContextTarget(target)` returns props to spread on whatever DOM node
 * represents a music entity (a row, a card, a tile). It decides *whether*
 * this particular gesture belongs to the app or to the browser, and never
 * takes the native menu away from ordinary content:
 *
 *  - no target                       → browser menu
 *  - Shift held                      → browser menu (deliberate escape hatch)
 *  - inputs, textareas, editables    → browser menu
 *  - a live text selection under the → browser menu (so Copy still works)
 *    pointer
 *
 * Nested targets resolve innermost-first, because the inner handler stops
 * propagation before the outer one sees the event.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useContextMenu } from './store';
import type { ContextTarget } from './types';

const LONG_PRESS_MS = 480;
const LONG_PRESS_SLOP = 10;

/** Form fields and editable regions always keep the native menu. */
export function isTextEntry(node: EventTarget | null): boolean {
  let el = node instanceof Element ? node : null;
  while (el) {
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (el.getAttribute('contenteditable') === 'true' || el.getAttribute('contenteditable') === '') return true;
    if (el.hasAttribute('data-native-menu')) return true;
    el = el.parentElement;
  }
  return false;
}

/** True when the user right-clicked inside their own text selection. */
export function hasSelectionAt(node: EventTarget | null): boolean {
  const sel = typeof window.getSelection === 'function' ? window.getSelection() : null;
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return false;
  if (!(node instanceof Node)) return false;
  try {
    return sel.containsNode(node, true);
  } catch {
    return false;
  }
}

export interface ContextTargetOptions {
  /** Long-press on touch opens the sheet. On by default. */
  longPress?: boolean;
  /** Called instead of the default open - used by rows with custom gestures. */
  disabled?: boolean;
}

export interface ContextTargetProps {
  onContextMenu: (e: ReactMouseEvent) => void;
  onKeyDown: (e: ReactKeyboardEvent) => void;
  onPointerDown: (e: ReactPointerEvent) => void;
  onPointerUp: (e: ReactPointerEvent) => void;
  onPointerMove: (e: ReactPointerEvent) => void;
  onPointerCancel: (e: ReactPointerEvent) => void;
  onClickCapture: (e: ReactMouseEvent) => void;
  'data-ctx-target': string | undefined;
}

export function useContextTarget(
  target: ContextTarget | null | undefined,
  options: ContextTargetOptions = {},
): ContextTargetProps {
  const { longPress = true, disabled = false } = options;
  const openMenu = useContextMenu((s) => s.openMenu);

  // The latest target is read at gesture time, so handlers stay stable and a
  // menu opened from a row always sees that row's current data.
  const latest = useRef(target);
  latest.current = target;

  const press = useRef<{ timer: ReturnType<typeof setTimeout> | null; x: number; y: number; fired: boolean }>({
    timer: null,
    x: 0,
    y: 0,
    fired: false,
  });

  /* A long press must lose to a scroll. Pointer movement past the slop
     cancels it, but a touch that turns into a fling is taken over by the
     browser, which may stop sending pointermove - so any scroll anywhere
     cancels the pending press too. */
  const scrollCancel = useRef<(() => void) | null>(null);

  const clearPress = useCallback(() => {
    if (press.current.timer) clearTimeout(press.current.timer);
    press.current.timer = null;
    scrollCancel.current?.();
    scrollCancel.current = null;
  }, []);

  const watchScroll = useCallback(() => {
    const cancel = () => clearPress();
    document.addEventListener('scroll', cancel, { capture: true, passive: true });
    window.addEventListener('wheel', cancel, { capture: true, passive: true });
    scrollCancel.current = () => {
      document.removeEventListener('scroll', cancel, true);
      window.removeEventListener('wheel', cancel, true);
    };
  }, [clearPress]);

  useEffect(() => clearPress, [clearPress]);

  const onContextMenu = useCallback(
    (e: ReactMouseEvent) => {
      const t = latest.current;
      if (!t || disabled) return;                     // browser menu
      if (e.shiftKey) return;                         // deliberate escape hatch
      if (isTextEntry(e.target)) return;              // form fields keep theirs
      if (hasSelectionAt(e.target)) return;           // don't steal "Copy"
      e.preventDefault();
      e.stopPropagation();
      clearPress();
      openMenu({
        target: t,
        anchor: { kind: 'point', x: e.clientX, y: e.clientY },
        source: 'pointer',
        opener: e.currentTarget instanceof HTMLElement ? e.currentTarget : null,
      });
    },
    [openMenu, disabled, clearPress],
  );

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      const t = latest.current;
      if (!t || disabled) return;
      const isMenuKey = e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10');
      if (!isMenuKey) return;
      if (isTextEntry(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      const el = e.currentTarget as HTMLElement;
      const rect = el.getBoundingClientRect();
      // The row itself is usually not focusable - the key press arrives from a
      // link or button inside it. Remember *that* element so Escape puts the
      // keyboard back exactly where it was.
      const focused = document.activeElement;
      const opener =
        focused instanceof HTMLElement && el.contains(focused) ? focused : el;
      openMenu({
        target: t,
        anchor: { kind: 'element', rect: { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom } },
        source: 'keyboard',
        opener,
      });
    },
    [openMenu, disabled],
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      press.current.fired = false;
      if (!longPress || disabled || e.pointerType !== 'touch') return;
      const t = latest.current;
      if (!t || isTextEntry(e.target)) return;
      press.current.x = e.clientX;
      press.current.y = e.clientY;
      const el = e.currentTarget as HTMLElement;
      clearPress();
      watchScroll();
      press.current.timer = setTimeout(() => {
        press.current.fired = true;
        const current = latest.current;
        if (!current) return;
        const rect = el.getBoundingClientRect();
        openMenu({
          target: current,
          anchor: { kind: 'element', rect: { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom } },
          source: 'touch',
          opener: el,
        });
        // A long press is not a tap; give the finger a nudge if we can.
        navigator.vibrate?.(8);
      }, LONG_PRESS_MS);
    },
    [openMenu, longPress, disabled, clearPress, watchScroll],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      if (!press.current.timer) return;
      if (Math.abs(e.clientX - press.current.x) > LONG_PRESS_SLOP || Math.abs(e.clientY - press.current.y) > LONG_PRESS_SLOP) {
        clearPress();  // it became a scroll
      }
    },
    [clearPress],
  );

  const onPointerUp = useCallback(() => clearPress(), [clearPress]);
  const onPointerCancel = useCallback(() => {
    clearPress();
    press.current.fired = false;
  }, [clearPress]);

  // Swallow the click that a long press would otherwise deliver to the row.
  const onClickCapture = useCallback((e: ReactMouseEvent) => {
    if (!press.current.fired) return;
    press.current.fired = false;
    e.preventDefault();
    e.stopPropagation();
  }, []);

  return useMemo(
    () => ({
      onContextMenu,
      onKeyDown,
      onPointerDown,
      onPointerUp,
      onPointerMove,
      onPointerCancel,
      onClickCapture,
      'data-ctx-target': target?.type,
    }),
    [onContextMenu, onKeyDown, onPointerDown, onPointerUp, onPointerMove, onPointerCancel, onClickCapture, target?.type],
  );
}
