import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { usePlayer } from '@/player/store';
import { useAuth } from '@/stores/auth';
import { useToasts } from '@/stores/toast';
import { PlayerBar } from '@/player/PlayerBar';
import { ExpandedPlayer } from '@/player/ExpandedPlayer';
import { ImmersivePlayer } from '@/player/ImmersivePlayer';
import { engine } from '@/player/engine';
import {
  IconHome, IconSearch, IconLibrary, IconMic, IconDisc, IconTag, IconPlaylist,
  IconHeart, IconSubmit, IconUser, IconSettings, IconShield, IconWave, IconQueue,
} from './Icons';
import { SignInDialog } from './SignInDialog';

export function Layout() {
  const view = usePlayer((s) => s.view);
  const user = useAuth((s) => s.user);
  const toasts = useToasts((s) => s.toasts);
  const [signIn, setSignIn] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [q, setQ] = useState('');

  /* global shortcuts */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) return;
      if (e.code === 'Space') {
        e.preventDefault();
        engine.ensureAnalysis();
        void usePlayer.getState().toggle();
      } else if (e.key === '/') {
        e.preventDefault();
        document.getElementById('global-search')?.focus();
      } else if (e.key === 'ArrowRight' && e.shiftKey) {
        void usePlayer.getState().next();
      } else if (e.key === 'ArrowLeft' && e.shiftKey) {
        void usePlayer.getState().prev();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* scroll to top on navigation */
  useEffect(() => {
    document.querySelector('.main')?.scrollTo(0, 0);
  }, [location.pathname]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`);
  };

  const nav = ({ isActive }: { isActive: boolean }) => `nav-link ${isActive ? 'active' : ''}`;

  return (
    <div className="app">
      <a href="#main-content" className="visually-hidden">Skip to content</a>

      <aside className="sidebar" aria-label="Main navigation">
        <div className="brand">
          <NavLink to="/" className="brand-mark">Reson<em>Tune</em></NavLink>
        </div>

        <NavLink to="/" className={nav} end><IconHome width={17} height={17} /> Home</NavLink>
        <NavLink to="/search" className={nav}><IconSearch width={17} height={17} /> Search</NavLink>

        <div className="nav-section">Catalog</div>
        <NavLink to="/artists" className={nav}><IconMic width={17} height={17} /> Artists</NavLink>
        <NavLink to="/albums" className={nav}><IconDisc width={17} height={17} /> Releases</NavLink>
        <NavLink to="/genres" className={nav}><IconTag width={17} height={17} /> Genres</NavLink>
        <NavLink to="/playlists" className={nav}><IconPlaylist width={17} height={17} /> Playlists</NavLink>

        <div className="nav-section">Your music</div>
        <NavLink to="/library" className={nav}><IconLibrary width={17} height={17} /> Local library</NavLink>
        <NavLink to="/favorites" className={nav}><IconHeart width={17} height={17} /> Favorites</NavLink>
        <NavLink to="/history" className={nav}><IconQueue width={17} height={17} /> History</NavLink>

        <div className="nav-section">Community</div>
        <NavLink to="/submit" className={nav}><IconSubmit width={17} height={17} /> Submit music</NavLink>
        {(user?.role === 'moderator' || user?.role === 'admin') && (
          <NavLink to="/moderation" className={nav}><IconShield width={17} height={17} /> Moderation</NavLink>
        )}

        <div style={{ flex: 1 }} />

        <NavLink to="/settings" className={nav}><IconSettings width={17} height={17} /> Settings</NavLink>
        {user ? (
          <NavLink to="/profile" className={nav}><IconUser width={17} height={17} /> {user.displayName}</NavLink>
        ) : (
          <button className="nav-link" onClick={() => setSignIn(true)}>
            <IconUser width={17} height={17} /> Sign in
          </button>
        )}
        <div style={{ padding: '14px 10px 4px', fontSize: 11, color: 'var(--ink-faint)', lineHeight: 1.5 }}>
          Open music. For everyone.<br />
          <a href="https://github.com/flessan/resontune" target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>
            Open source
          </a>
        </div>
      </aside>

      <main className="main" id="main-content">
        <div className="topbar">
          <form className="search-box" onSubmit={submitSearch} role="search">
            <IconSearch width={15} height={15} />
            <input
              id="global-search"
              type="search"
              placeholder="Search tracks, artists, releases…  ( / )"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search the catalog"
            />
          </form>
          <div style={{ flex: 1 }} />
          {!user && (
            <button className="btn small" onClick={() => setSignIn(true)}>Sign in</button>
          )}
        </div>
        <Outlet />
      </main>

      <PlayerBar />

      <nav className="tabbar" aria-label="Mobile navigation">
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}><IconHome width={20} height={20} />Home</NavLink>
        <NavLink to="/search" className={({ isActive }) => (isActive ? 'active' : '')}><IconSearch width={20} height={20} />Search</NavLink>
        <NavLink to="/library" className={({ isActive }) => (isActive ? 'active' : '')}><IconLibrary width={20} height={20} />Library</NavLink>
        <NavLink to="/playlists" className={({ isActive }) => (isActive ? 'active' : '')}><IconPlaylist width={20} height={20} />Playlists</NavLink>
        <NavLink to={user ? '/profile' : '/settings'} className={({ isActive }) => (isActive ? 'active' : '')}><IconUser width={20} height={20} />{user ? 'You' : 'More'}</NavLink>
      </nav>

      {view === 'expanded' && <ExpandedPlayer />}
      {view === 'immersive' && <ImmersivePlayer />}
      {signIn && <SignInDialog onClose={() => setSignIn(false)} />}

      <div className="toast-zone" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">{t.message}</div>
        ))}
      </div>
    </div>
  );
}
