/**
 * The Home greeting.
 *
 * Reads the visitor's local clock and the verified account from the auth
 * store, so it re-renders the moment authentication state changes - no
 * refresh needed. The motion is one short, gentle rise, matching the rest of
 * the ResonTune motion system.
 */
import { useEffect, useState } from 'react';
import { useAuth } from '@/stores/auth';
import { greetingFor, msUntilNextDaypart } from '@/lib/greeting';

export function Greeting({ className = '' }: { className?: string }) {
  const user = useAuth((s) => s.user);
  const loaded = useAuth((s) => s.loaded);
  const [now, setNow] = useState(() => new Date());

  /* Re-evaluate at the next daypart boundary (and hourly as a safety net). */
  useEffect(() => {
    const timer = window.setTimeout(() => setNow(new Date()), msUntilNextDaypart(now));
    return () => window.clearTimeout(timer);
  }, [now]);

  /* A tab restored hours later should not show a stale greeting. */
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') setNow(new Date());
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const name = user ? user.displayName?.trim() || user.handle : null;
  const text = greetingFor(name, now);

  return (
    <h1
      className={`home-greeting ${className}`}
      /* keyed so the phrase animates when the name or daypart changes */
      key={text}
      data-loaded={loaded ? '1' : '0'}
    >
      {text}
    </h1>
  );
}
