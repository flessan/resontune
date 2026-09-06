/**
 * The contextual menu surface.
 *
 * Rendered once, in a portal on <body>, so it is never clipped by an
 * overflow container or repositioned by a transformed ancestor, and always
 * stacks above the player and dialogs. On coarse-pointer devices the same
 * actions render as a bottom action sheet.
 *
 * Behaviour worth knowing:
 *  - the action list is derived on every render from live store state, so a
 *    menu that is open while the queue changes stays truthful;
 *  - the menu closes on action, Escape, outside pointer, scroll, resize,
 *    route change, and when its target stops being valid;
 *  - focus returns to whatever opened it.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { usePlayer } from '@/player/store';
import { useAuth } from '@/stores/auth';
import { buildActions, type ActionContext } from './actions';
import { useContextMenu, type Anchor } from './store';
import { GROUP_ORDER, targetKind, targetLabel, type MenuAction } from './types';

const EDGE = 8;       // viewport breathing room
const GAP = 4;        // distance from an element anchor

interface Placement { left: number; top: number; maxHeight: number; origin: string }

function place(anchor: Anchor, size: { width: number; height: number }): Placement {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const maxHeight = Math.max(160, vh - EDGE * 2);
  const height = Math.min(size.height, maxHeight);
  let left: number;
  let top: number;
  let originX: 'left' | 'right' = 'left';
  let originY: 'top' | 'bottom' = 'top';

  if (anchor.kind === 'point') {
    left = anchor.x;
    top = anchor.y;
    if (left + size.width > vw - EDGE) { left = anchor.x - size.width; originX = 'right'; }
    if (top + height > vh - EDGE) { top = anchor.y - height; originY = 'bottom'; }
  } else {
    // Beside a button: below and right-aligned, flipping when there is no room.
    left = anchor.rect.right - size.width;
    top = anchor.rect.bottom + GAP;
    originX = 'right';
    if (left < EDGE) { left = anchor.rect.left; originX = 'left'; }
    if (top + height > vh - EDGE) {
      const above = anchor.rect.top - GAP - height;
      if (above > EDGE) { top = above; originY = 'bottom'; }
    }
  }

  left = Math.min(Math.max(left, EDGE), Math.max(EDGE, vw - size.width - EDGE));
  top = Math.min(Math.max(top, EDGE), Math.max(EDGE, vh - height - EDGE));
  return { left, top, maxHeight, origin: `${originY} ${originX}` };
}

/** Touch-first devices get the action sheet instead of a floating menu. */
function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(() =>
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 640
      : false,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(pointer: coarse)');
    const update = () => setCoarse(mq.matches || window.innerWidth < 640);
    mq.addEventListener?.('change', update);
    window.addEventListener('resize', update);
    return () => {
      mq.removeEventListener?.('change', update);
      window.removeEventListener('resize', update);
    };
  }, []);
  return coarse;
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Insert separators between the groups that actually have actions. */
function groupActions(actions: MenuAction[]): MenuAction[][] {
  return GROUP_ORDER.map((group) => actions.filter((a) => a.group === group)).filter((g) => g.length > 0);
}

export function ContextMenuRoot() {
  const target = useContextMenu((s) => s.target);
  const anchor = useContextMenu((s) => s.anchor);
  const source = useContextMenu((s) => s.source);
  const opener = useContextMenu((s) => s.opener);
  const openId = useContextMenu((s) => s.openId);
  const closeMenu = useContextMenu((s) => s.closeMenu);

  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuth((s) => s.user);
  const favoriteIds = useAuth((s) => s.favoriteIds);
  const queue = usePlayer((s) => s.queue);
  const queueIndex = usePlayer((s) => s.index);
  const playing = usePlayer((s) => s.playing);
  const coarse = useCoarsePointer();

  const menuRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [active, setActive] = useState(-1);
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ctx: ActionContext = useMemo(
    () => ({
      navigate,
      pathname: location.pathname,
      user,
      isFavorite: (id: string) => favoriteIds.has(id),
      queue,
      queueIndex,
      playing,
    }),
    [navigate, location.pathname, user, favoriteIds, queue, queueIndex, playing],
  );

  const actions = useMemo(() => (target ? buildActions(target, ctx) : []), [target, ctx]);
  const groups = useMemo(() => groupActions(actions), [actions]);
  const flat = useMemo(() => groups.flat(), [groups]);

  /* --------------------------- open / close plumbing --------------------- */

  const dismiss = useCallback(() => {
    if (!target) return;
    const restore = opener;
    if (prefersReducedMotion()) {
      closeMenu();
      restore?.focus?.();
      return;
    }
    setClosing(true);
    // If another menu opened while this one was leaving, the timer must not
    // close the newcomer — hence the openId check.
    const leaving = openId;
    closeTimer.current = setTimeout(() => {
      if (useContextMenu.getState().openId !== leaving) return;
      closeMenu();
      restore?.focus?.();
    }, 110);
  }, [target, opener, closeMenu, openId]);

  /* Reset per opening. Placement is deliberately *not* cleared here: the
     layout effect below recomputes it in the same commit, and clearing it
     from a passive effect would undo that work. */
  useEffect(() => {
    if (!target) return;
    setClosing(false);
    setActive(source === 'keyboard' ? 0 : -1);
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
      closeTimer.current = null;
    };
  }, [openId, target, source]);

  /* An open menu with nothing valid left to offer is not a menu. */
  useEffect(() => {
    if (target && actions.length === 0) closeMenu();
  }, [target, actions.length, closeMenu]);

  /* Navigation invalidates the context it was opened from. */
  useEffect(() => {
    closeMenu();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);

  /* Measure, then place inside the viewport. */
  useLayoutEffect(() => {
    if (!target || !anchor || coarse) return;
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPlacement(place(anchor, { width: rect.width, height: rect.height }));
  }, [target, anchor, coarse, openId, actions.length]);

  /* Dismissal that has nothing to do with the keyboard. */
  useEffect(() => {
    if (!target) return;
    const onPointerDown = (e: Event) => {
      if (!menuRef.current?.contains(e.target as Node)) dismiss();
    };
    const onScroll = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      dismiss();
    };
    const onResize = () => dismiss();
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('contextmenu', onPointerDown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    window.addEventListener('blur', onResize);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('contextmenu', onPointerDown, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('blur', onResize);
    };
  }, [target, dismiss]);

  /* Focus the surface so Escape and the arrow keys work immediately. */
  useEffect(() => {
    if (!target) return;
    const el = menuRef.current;
    if (!el) return;
    if (source === 'keyboard') {
      el.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    } else {
      el.focus({ preventScroll: true });
    }
  }, [target, source, openId]);

  /* Keep DOM focus on the active row as it moves. */
  useEffect(() => {
    if (active < 0) return;
    const items = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
    items?.[active]?.focus();
  }, [active]);

  if (!target) return null;
  if (!flat.length) return null;

  const run = (action: MenuAction) => {
    dismiss();
    // Let the menu start leaving before the action navigates or opens a
    // dialog — actions never fight the closing animation for focus.
    void Promise.resolve().then(() => action.run());
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActive((i) => (i + 1) % flat.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActive((i) => (i <= 0 ? flat.length - 1 : i - 1));
        break;
      case 'Home':
        e.preventDefault();
        setActive(0);
        break;
      case 'End':
        e.preventDefault();
        setActive(flat.length - 1);
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        dismiss();
        break;
      case 'Tab':
        // Focus should be free to leave; the menu simply gets out of the way.
        dismiss();
        break;
      case 'Enter':
      case ' ':
        if (active >= 0) {
          e.preventDefault();
          run(flat[active]);
        }
        break;
      default:
        break;
    }
  };

  const label = targetLabel(target);
  let cursor = -1;

  const items = groups.map((group, gi) => (
    <div className="ctx-group" key={group[0]?.id ?? gi} role="none">
      {group.map((action) => {
        cursor += 1;
        const index = cursor;
        const Icon = action.icon;
        return (
          <button
            key={action.id}
            type="button"
            role="menuitem"
            tabIndex={index === active ? 0 : -1}
            className={`ctx-item ${action.danger ? 'danger' : ''} ${index === active ? 'active' : ''}`}
            onMouseEnter={() => setActive(index)}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              run(action);
            }}
          >
            {Icon ? <Icon width={16} height={16} /> : <span className="ctx-icon-space" aria-hidden />}
            <span className="ctx-label">{action.label}</span>
            {action.hint && <span className="ctx-hint">{action.hint}</span>}
          </button>
        );
      })}
    </div>
  ));

  if (coarse) {
    return createPortal(
      <div
        className={`ctx-sheet-backdrop ${closing ? 'closing' : ''}`}
        role="presentation"
        onPointerDown={(e) => { if (e.target === e.currentTarget) dismiss(); }}
      >
        <div
          ref={menuRef}
          className={`ctx-sheet ${closing ? 'closing' : ''}`}
          role="menu"
          aria-label={`Actions for ${label}`}
          tabIndex={-1}
          onKeyDown={onKeyDown}
        >
          <div className="ctx-sheet-head">
            <div className="ctx-sheet-title">{label}</div>
            <div className="ctx-sheet-sub">{targetKind(target)}</div>
          </div>
          {items}
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div
      ref={menuRef}
      className={`ctx-menu ${closing ? 'closing' : ''}`}
      role="menu"
      aria-label={`Actions for ${label}`}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        left: placement?.left ?? -9999,
        top: placement?.top ?? -9999,
        maxHeight: placement?.maxHeight,
        transformOrigin: placement?.origin,
        visibility: placement ? 'visible' : 'hidden',
      }}
    >
      {items}
    </div>,
    document.body,
  );
}
