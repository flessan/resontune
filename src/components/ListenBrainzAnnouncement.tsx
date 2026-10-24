import { useEffect, useRef, useState } from 'react';
import { useScrollLock } from '@/lib/scrollLock';
import { IconClose } from './Icons';

const AUTO_SHOW_KEY = 'rt-listenbrainz-announcement-auto';
const SESSION_SEEN_KEY = 'rt-listenbrainz-announcement-seen';
const OPEN_EVENT = 'resontune:open-listenbrainz-announcement';
const AUTO_EVENT = 'resontune:listenbrainz-announcement-auto';

export function getListenBrainzAnnouncementAutoShow(): boolean {
  try {
    return localStorage.getItem(AUTO_SHOW_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setListenBrainzAnnouncementAutoShow(enabled: boolean): void {
  try {
    localStorage.setItem(AUTO_SHOW_KEY, enabled ? '1' : '0');
  } catch {
    // The app can still use the announcement for the current session.
  }
  window.dispatchEvent(new CustomEvent<boolean>(AUTO_EVENT, { detail: enabled }));
}

export function openListenBrainzAnnouncement(): void {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

function markSeenThisSession(): void {
  try {
    sessionStorage.setItem(SESSION_SEEN_KEY, '1');
  } catch {
    // Dismissing still works when storage is unavailable.
  }
}

function hasBeenSeenThisSession(): boolean {
  try {
    return sessionStorage.getItem(SESSION_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * A transparent project announcement, not a claim of an official partnership.
 * It appears at most once per tab session and can be reopened from Settings.
 */
export function ListenBrainzAnnouncement() {
  const [open, setOpen] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);

  useScrollLock(open);

  useEffect(() => {
    if (getListenBrainzAnnouncementAutoShow() && !hasBeenSeenThisSession()) {
      markSeenThisSession();
      setOpen(true);
    }

    const onOpen = () => {
      markSeenThisSession();
      setOpen(true);
    };
    const onAutoShowChange = (event: Event) => {
      const enabled = (event as CustomEvent<boolean>).detail;
      if (!enabled) setOpen(false);
    };

    window.addEventListener(OPEN_EVENT, onOpen);
    window.addEventListener(AUTO_EVENT, onAutoShowChange);
    return () => {
      window.removeEventListener(OPEN_EVENT, onOpen);
      window.removeEventListener(AUTO_EVENT, onAutoShowChange);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => closeButton.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="dialog-backdrop listenbrainz-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <section
        className="dialog listenbrainz-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="listenbrainz-announcement-title"
        aria-describedby="listenbrainz-announcement-copy"
      >
        <div className="listenbrainz-dialog-top">
          <span className="listenbrainz-eyebrow">OPEN-SOURCE MUSIC</span>
          <button
            ref={closeButton}
            type="button"
            className="icon-btn"
            onClick={() => setOpen(false)}
            aria-label="Close announcement"
          >
            <IconClose width={18} height={18} />
          </button>
        </div>
        <h2 id="listenbrainz-announcement-title">Let's build a more open music ecosystem.</h2>
        <p id="listenbrainz-announcement-copy">
          ResonTune is exploring an integration with ListenBrainz, a music listening
          and discovery project from the non-profit MetaBrainz Foundation. We see an
          opportunity to connect open music tools and make listening history,
          statistics, and discovery more useful.
        </p>
        <div className="listenbrainz-disclaimer">
          <strong>Important context</strong>
          <p>
            This is an independent proposal, not an official partnership. No
            collaboration has been agreed or announced, and ListenBrainz integration
            is not available in ResonTune yet. We hope to start a conversation and
            support the open-source music community.
          </p>
        </div>
        <div className="dialog-actions listenbrainz-actions">
          <a
            className="btn primary"
            href="https://listenbrainz.org/about/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Meet ListenBrainz
          </a>
          <a
            className="btn"
            href="https://github.com/flessan/resontune"
            target="_blank"
            rel="noopener noreferrer"
          >
            Contribute on GitHub
          </a>
        </div>
        <button type="button" className="listenbrainz-dismiss" onClick={() => setOpen(false)}>
          Not now
        </button>
      </section>
    </div>
  );
}
