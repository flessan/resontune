/**
 * The ⋮ overflow trigger.
 *
 * Same target, same actions, same surface as right-click — this button just
 * anchors the menu to itself. On touch it becomes the bottom sheet, which is
 * why mobile users never need to discover a long press.
 */
import { useRef } from 'react';
import { IconDots } from '@/components/Icons';
import { useContextMenu } from './store';
import type { ContextTarget } from './types';
import { targetLabel } from './types';

interface Props {
  target: ContextTarget | null | undefined;
  /** Extra classes for placement inside a row or card. */
  className?: string;
  /** Visually hidden label; defaults to "More actions for <name>". */
  label?: string;
  size?: number;
}

export function ContextMenuButton({ target, className = '', label, size = 18 }: Props) {
  const openMenu = useContextMenu((s) => s.openMenu);
  const closeMenu = useContextMenu((s) => s.closeMenu);
  const openId = useContextMenu((s) => s.openId);
  const openTarget = useContextMenu((s) => s.target);
  const mine = useRef(-1);
  const expanded = openTarget !== null && mine.current === openId;

  if (!target) return null;

  return (
    <button
      type="button"
      className={`ctx-trigger ${className}`}
      aria-haspopup="menu"
      aria-expanded={expanded}
      aria-label={label ?? `More actions for ${targetLabel(target)}`}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        // Right-clicking the trigger is the same intent as clicking it.
        e.preventDefault();
        e.stopPropagation();
      }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (expanded) {
          closeMenu();
          return;
        }
        const el = e.currentTarget;
        const rect = el.getBoundingClientRect();
        openMenu({
          target,
          anchor: { kind: 'element', rect: { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom } },
          source: 'button',
          opener: el,
        });
        mine.current = useContextMenu.getState().openId;
      }}
      onKeyDown={(e) => {
        // Down-arrow opens with the first item focused, like a native menu button.
        if (e.key !== 'ArrowDown') return;
        e.preventDefault();
        const el = e.currentTarget;
        const rect = el.getBoundingClientRect();
        openMenu({
          target,
          anchor: { kind: 'element', rect: { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom } },
          source: 'keyboard',
          opener: el,
        });
        mine.current = useContextMenu.getState().openId;
      }}
    >
      <IconDots width={size} height={size} />
    </button>
  );
}
