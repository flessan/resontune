/**
 * Time-of-day greeting.
 *
 * Derived from the visitor's own clock — never from a server timestamp and
 * never hard-coded — so "Good evening" means evening where they are.
 */

export type Daypart = 'morning' | 'afternoon' | 'evening' | 'night';

/**
 * 05:00–11:59 morning · 12:00–17:59 afternoon · 18:00–21:59 evening ·
 * 22:00–04:59 night.
 */
export function daypartFor(date: Date = new Date()): Daypart {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'night';
}

const PHRASE: Record<Daypart, string> = {
  morning: 'Good morning',
  afternoon: 'Good afternoon',
  evening: 'Good evening',
  night: 'Good night',
};

/** "Good evening, flessan" / "Good night, stranger". */
export function greetingFor(name: string | null | undefined, date: Date = new Date()): string {
  const who = (name ?? '').trim() || 'stranger';
  return `${PHRASE[daypartFor(date)]}, ${who}`;
}

/** Milliseconds until the greeting could change (the next daypart boundary). */
export function msUntilNextDaypart(date: Date = new Date()): number {
  const boundaries = [5, 12, 18, 22];
  const next = new Date(date);
  const hour = date.getHours();
  const upcoming = boundaries.find((b) => b > hour);
  if (upcoming === undefined) {
    next.setDate(next.getDate() + 1);
    next.setHours(5, 0, 0, 0);
  } else {
    next.setHours(upcoming, 0, 0, 0);
  }
  // Never schedule further than an hour out: keeps the greeting correct if the
  // device sleeps, changes timezone, or the tab is restored much later.
  return Math.min(next.getTime() - date.getTime() + 500, 60 * 60 * 1000);
}
