/** Understated site footer: identity + secondary navigation. */
import { Link } from 'react-router-dom';

const REPO = 'https://github.com/flessan/resontune';

export function Footer() {
  return (
    <footer className="site-footer">
      <div>
        <div className="f-brand">Reson<em>Tune</em></div>
        <div className="f-tagline">Open music. For everyone.</div>
      </div>
      <nav aria-label="Secondary">
        <Link to="/about">About</Link>
        <Link to="/contribute">Contribute</Link>
        <Link to="/support">Support</Link>
        <a href={REPO} target="_blank" rel="noreferrer">GitHub</a>
        <a href={`${REPO}/tree/main/docs`} target="_blank" rel="noreferrer">Documentation</a>
        <a href={`${REPO}/blob/main/SECURITY.md`} target="_blank" rel="noreferrer">Security</a>
        <Link to="/about#licensing">Licensing</Link>
        <Link to="/about#privacy">Privacy</Link>
      </nav>
    </footer>
  );
}
