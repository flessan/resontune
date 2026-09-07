/**
 * Body scroll locking for modal surfaces.
 *
 * When a dialog, an action sheet or the navigation drawer is open, the page
 * behind it must stay where it is: on touch devices a scroll that starts on
 * an overlay otherwise chains into the page underneath, and the surface the
 * user came from silently moves away beneath them.
 *
 * Locks are reference counted, so a dialog raised *from* an action sheet
 * does not unlock the page when the sheet closes first.
 */
import { useEffect } from 'react';

let locks = 0;

export function lockScroll(): void {
  locks += 1;
  if (locks === 1) document.body.classList.add('scroll-locked');
}

export function unlockScroll(): void {
  if (locks === 0) return;
  locks -= 1;
  if (locks === 0) document.body.classList.remove('scroll-locked');
}

/** Hold a scroll lock for as long as `active` is true. */
export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    lockScroll();
    return unlockScroll;
  }, [active]);
}

/** Test helper - the number of outstanding locks. */
export function scrollLockCount(): number {
  return locks;
}
