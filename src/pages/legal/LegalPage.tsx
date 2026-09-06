/**
 * Shared shell for the legal pages (/privacy, /terms, /copyright).
 *
 * These pages are deliberately plain: no auth, no data fetching, no
 * client-only routing tricks. They render for signed-out visitors, work on
 * a phone, and describe what the code in this repository actually does.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/** Date these documents were last reviewed against the implementation. */
export const LEGAL_UPDATED = 'September 7, 2026';

export const REPO_URL = 'https://github.com/flessan/resontune';

export function LegalPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="page legal-page">
      <h1 className="page-title">{title}</h1>
      <p className="legal-date">Last updated {LEGAL_UPDATED}</p>
      <p className="page-sub">{intro}</p>
      {children}
      <div className="legal-nav" aria-label="Legal documents">
        <Link to="/privacy">Privacy</Link>
        <Link to="/terms">Terms of use</Link>
        <Link to="/copyright">Music rights &amp; copyright</Link>
        <a href={`${REPO_URL}/blob/main/SECURITY.md`} target="_blank" rel="noreferrer">
          Security policy
        </a>
      </div>
      <p className="legal-note">
        ResonTune is an open-source project, not a law firm. These pages
        describe how the software in the public repository behaves. They are
        not legal advice, and the operator of a given deployment is
        responsible for meeting the requirements of their own jurisdiction.
      </p>
    </div>
  );
}

/** A titled block with an anchor, so sections can be linked to directly. */
export function LegalSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="legal-section" id={id}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
