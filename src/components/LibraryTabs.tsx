import { NavLink } from 'react-router-dom';

/**
 * "Your music" is one destination with M3 tab navigation:
 * Playlists / Favorites / History / Local files. Each tab keeps its own
 * deep-linkable route, but they present as a single Library.
 */
export function LibraryTabs() {
  return (
    <nav className="seg-tabs" aria-label="Library sections">
      <NavLink to="/playlists" className={({ isActive }) => (isActive ? 'active' : '')}>Playlists</NavLink>
      <NavLink to="/favorites" className={({ isActive }) => (isActive ? 'active' : '')}>Favorites</NavLink>
      <NavLink to="/history" className={({ isActive }) => (isActive ? 'active' : '')}>History</NavLink>
      <NavLink to="/library" className={({ isActive }) => (isActive ? 'active' : '')}>Local files</NavLink>
    </nav>
  );
}
