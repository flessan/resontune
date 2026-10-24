/**
 * The moving page surface.
 *
 * Chrome (sidebar, top bar, player, tab bar) is named separately so a
 * route change only interpolates this stage. Direction is stamped on
 * `<html data-vt>` before React Router starts the View Transition, from
 * a capturing click listener and from popstate.
 */
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { markNav, rememberPath } from '@/lib/motion';

export function PageStage({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  useEffect(() => {
    rememberPath(location.pathname);
  }, [location.pathname]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      markNav(url.pathname, false);
    };

    const onPop = () => {
      markNav(window.location.pathname, true);
    };

    document.addEventListener('click', onClick, true);
    window.addEventListener('popstate', onPop);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('popstate', onPop);
    };
  }, []);

  return (
    <div className="page-stage" data-pathname={location.pathname}>
      {children}
    </div>
  );
}
