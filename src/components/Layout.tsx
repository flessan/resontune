import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { usePlayer } from '@/player/store';
import { useAuth } from '@/stores/auth';
import { useToasts } from '@/stores/toast';
import { PlayerBar } from '@/player/PlayerBar';
import { ExpandedPlayer } from '@/player/ExpandedPlayer';
import { ImmersivePlayer } from '@/player/ImmersivePlayer';
import { engine } from '@/player/engine';
import {
  IconHome, IconSearch, IconLibrary, IconMic, IconDisc, IconMenu, IconClose,
  IconSubmit, IconUser, IconSettings, IconShield, IconWave, IconGitHub,
  IconPlaylist, IconHeart, IconQueue,
} from './Icons';
import { SignInDialog } from './SignInDialog';
import { Avatar } from './Avatar';
import { Footer } from './Footer';

const REPO = 'https://github.com/flessan/resontune';

/** Is the pathname part of the unified Library destination? */
const inLibrary = (path: string) =>
  ['/playlists', '/library', '/favorites', '/history'].some((p) => path.startsWith(p));

export function Layout() {
  const view = usePlayer((s) => s.view);
  const user = useAuth((s) => s.user);
  const toasts = useToasts((s) => s.toasts);
  const [signIn, setSignIn] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('rt-nav-collapsed') === '1');
  const [drawer, setDrawer] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
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

  /* scroll to top + close drawer on navigation */
  useEffect(() => {
    document.querySelector('.main')?.scrollTo(0, 0);
    setDrawer(false);
  }, [location.pathname]);

  /* drawer: Esc to close, focus the panel on open, return focus after */
  useEffect(() => {
    if (!drawer) return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawer(false); };
    window.addEventListener('keydown', onEsc);
    drawerRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', onEsc);
      hamburgerRef.current?.focus();
    };
  }, [drawer]);

  /* top bar gains a surface once content scrolls beneath it */
  useEffect(() => {
    const main = document.querySelector('.main');
    const bar = document.querySelector('.topbar');
    if (!main || !bar) return;
    const onScroll = () => bar.classList.toggle('scrolled', main.scrollTop > 8);
    main.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => main.removeEventListener('scroll', onScroll);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      localStorage.setItem('rt-nav-collapsed', c ? '0' : '1');
      return !c;
    });
  };

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`);
  };

  const nav = ({ isActive }: { isActive: boolean }) => `nav-link ${isActive ? 'active' : ''}`;

  /* Primary destinations, shared between sidebar and drawer */
  const primaryNav = (
    <>
      <NavLink to="/" className={nav} end title="Home"><IconHome width={18} height={18} /><span>Home</span></NavLink>
      <NavLink to="/discover" className={nav} title="Discover"><IconSearch width={18} height={18} /><span>Discover</span></NavLink>
      <NavLink to="/originals" className={nav} title="Originals"><IconDisc width={18} height={18} /><span>Originals</span></NavLink>
      <NavLink to="/community" className={nav} title="Community"><IconMic width={18} height={18} /><span>Community</span></NavLink>
      <NavLink to="/radio" className={nav} title="Radio"><IconWave width={18} height={18} /><span>Radio</span></NavLink>
      <NavLink
        to="/playlists"
        title="Library"
        className={({ isActive }) => `nav-link ${isActive || inLibrary(location.pathname) ? 'active' : ''}`}
      >
        <IconLibrary width={18} height={18} /><span>Library</span>
      </NavLink>
    </>
  );

  return (
    <div className={`app ${collapsed ? 'nav-collapsed' : ''}`}>
      <a href="#main-content" className="visually-hidden">Skip to content</a>

      {/* ---- desktop sidebar ---- */}
      <aside className="sidebar" aria-label="Main navigation">
        <div className="brand">
          <button className="icon-btn" onClick={toggleCollapsed} aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'} title={collapsed ? 'Expand' : 'Collapse'}>
            <IconMenu width={18} height={18} />
          </button>
          <NavLink to="/" className="brand-mark"><span>Reson<em>Tune</em></span></NavLink>
        </div>

        {primaryNav}

        <div className="nav-section"><span>Create</span></div>
        <NavLink to="/submit" className={nav} title="Release music"><IconSubmit width={18} height={18} /><span>Release music</span></NavLink>
        {(user?.role === 'moderator' || user?.role === 'admin') && (
          <>
            <NavLink to="/admin" className={nav} title="Catalog manager"><IconDisc width={18} height={18} /><span>Catalog</span></NavLink>
            <NavLink to="/moderation" className={nav} title="Moderation"><IconShield width={18} height={18} /><span>Moderation</span></NavLink>
          </>
        )}

        <div style={{ flex: 1 }} />

        <NavLink to="/settings" className={nav} title="Settings"><IconSettings width={18} height={18} /><span>Settings</span></NavLink>
        {user ? (
          <NavLink to={`/u/${user.handle}`} className={nav} title={user.displayName}>
            <Avatar src={user.avatarThumbUrl ?? user.avatarUrl} name={user.displayName} size={18} />
            <span>{user.displayName}</span>
          </NavLink>
        ) : (
          <button className="nav-link" onClick={() => setSignIn(true)} title="Sign in">
            <IconUser width={18} height={18} /><span>Sign in</span>
          </button>
        )}
        <div className="sidebar-foot">
          <NavLink to="/about">About</NavLink>
          {' · '}
          <NavLink to="/contribute">Contribute</NavLink>
          {' · '}
          <NavLink to="/support">Support</NavLink>
        </div>
      </aside>

      {/* ---- mobile drawer ---- */}
      <div className={`drawer-backdrop ${drawer ? 'open' : ''}`} onClick={() => setDrawer(false)} aria-hidden />

      <nav
        className={`drawer ${drawer ? 'open' : ''}`}
        aria-label="Application navigation"
        aria-hidden={!drawer}
        ref={drawerRef}
        tabIndex={-1}
      >
        <div className="drawer-head">
          <span className="brand-mark">Reson<em>Tune</em></span>
          <button className="icon-btn" onClick={() => setDrawer(false)} aria-label="Close navigation">
            <IconClose width={18} height={18} />
          </button>
        </div>
        {primaryNav}
        <div className="nav-section"><span>Your music</span></div>
        <NavLink to="/playlists" className={nav}><IconPlaylist width={18} height={18} /><span>Playlists</span></NavLink>
        <NavLink to="/favorites" className={nav}><IconHeart width={18} height={18} /><span>Favorites</span></NavLink>
        <NavLink to="/history" className={nav}><IconQueue width={18} height={18} /><span>History</span></NavLink>
        <NavLink to="/library" className={nav}><IconUser width={18} height={18} /><span>Local music</span></NavLink>
        {user && (
          <NavLink to={`/u/${user.handle}`} className={nav}>
            <Avatar src={user.avatarThumbUrl ?? user.avatarUrl} name={user.displayName} size={18} />
            <span>Your profile</span>
          </NavLink>
        )}
        <div className="nav-section"><span>More</span></div>
        <NavLink to="/submit" className={nav}><IconSubmit width={18} height={18} /><span>Release music</span></NavLink>
        {(user?.role === 'moderator' || user?.role === 'admin') && (
          <>
            <NavLink to="/admin" className={nav}><IconDisc width={18} height={18} /><span>Catalog manager</span></NavLink>
            <NavLink to="/moderation" className={nav}><IconShield width={18} height={18} /><span>Moderation</span></NavLink>
          </>
        )}
        <NavLink to="/about" className={nav}><IconDisc width={18} height={18} /><span>About</span></NavLink>
        <NavLink to="/contribute" className={nav}><IconSubmit width={18} height={18} /><span>Contribute</span></NavLink>
        <NavLink to="/support" className={nav}><IconHeart width={18} height={18} /><span>Support</span></NavLink>
        <NavLink to="/settings" className={nav}><IconSettings width={18} height={18} /><span>Settings</span></NavLink>
        <a href={REPO} target="_blank" rel="noreferrer" className="nav-link">
          <IconGitHub width={18} height={18} /><span>GitHub</span>
        </a>
      </nav>

      <main className="main" id="main-content">
        <div className="topbar">
          <button ref={hamburgerRef} className="icon-btn hamburger" onClick={() => setDrawer(true)} aria-label="Open navigation" aria-expanded={drawer}>
            {drawer ? <IconClose width={19} height={19} /> : <IconMenu width={19} height={19} />}
          </button>
          <NavLink to="/" className="brand-mark topbar-brand">Reson<em>Tune</em></NavLink>
          <form className="search-box" onSubmit={submitSearch} role="search">
            <IconSearch width={15} height={15} />
            <input
              id="global-search"
              type="search"
              placeholder="Search music, artists, albums…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search the catalog"
            />
          </form>
          <div style={{ flex: 1 }} />
          {user ? (
            <NavLink to={`/u/${user.handle}`} className="topbar-avatar" title={`${user.displayName} — your profile`}>
              <Avatar src={user.avatarThumbUrl ?? user.avatarUrl} name={user.displayName} size={30} />
            </NavLink>
          ) : (
            <button className="btn small" onClick={() => setSignIn(true)}>Sign in</button>
          )}
        </div>
        <Outlet />
        <div className="page" style={{ paddingTop: 0 }}>
          <Footer />
        </div>
      </main>

      <PlayerBar />

      {/* ---- mobile navigation bar: core destinations only ---- */}
      <nav className="tabbar" aria-label="Mobile navigation">
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}><IconHome width={20} height={20} />Home</NavLink>
        <NavLink to="/search" className={({ isActive }) => (isActive ? 'active' : '')}><IconSearch width={20} height={20} />Search</NavLink>
        <NavLink to="/radio" className={({ isActive }) => (isActive ? 'active' : '')}><IconWave width={20} height={20} />Radio</NavLink>
        <NavLink
          to="/playlists"
          className={({ isActive }) => (isActive || inLibrary(location.pathname) ? 'active' : '')}
        >
          <IconLibrary width={20} height={20} />Library
        </NavLink>
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
