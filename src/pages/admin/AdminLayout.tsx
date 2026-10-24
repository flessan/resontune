/**
 * Catalog manager shell.
 *
 * Authorization is enforced by the API on every request; this guard only
 * decides what is worth rendering. Moderators get read access, admins can
 * write - exactly what the server allows.
 */
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '@/stores/auth';
import { IconDisc, IconMic, IconShield, IconWave } from '@/components/Icons';

export function useCatalogRole() {
  const user = useAuth((s) => s.user);
  return {
    user,
    canRead: user?.role === 'admin' || user?.role === 'moderator',
    canEdit: user?.role === 'admin',
  };
}

export default function AdminLayout() {
  const loaded = useAuth((s) => s.loaded);
  const { user, canRead, canEdit } = useCatalogRole();

  if (!loaded) return <div className="loading-page"><span className="spin" /></div>;

  if (!canRead) {
    return (
      <div className="page">
        <div className="empty">
          <h3>Catalog manager</h3>
          <p>
            {user
              ? 'Your account does not have catalog access. Ask an administrator if you need it.'
              : 'Sign in with a catalog administrator account to manage ResonTune’s music.'}
          </p>
        </div>
      </div>
    );
  }

  const tab = ({ isActive }: { isActive: boolean }) => `admin-tab ${isActive ? 'active' : ''}`;

  return (
    <div className="page admin-page">
      <header className="admin-head">
        <div>
          <h1 className="page-title">Catalog manager</h1>
          <p className="admin-sub">
            Artists, releases and tracks. Audio and artwork stay on the hosts you
            choose - ResonTune stores the verified URLs.
          </p>
        </div>
        {!canEdit && (
          <span className="admin-readonly" title="Only administrators can change the catalog">
            <IconShield width={13} height={13} /> Read only
          </span>
        )}
      </header>

      <nav className="admin-tabs" aria-label="Catalog sections">
        <NavLink to="/admin" end className={tab}><IconWave width={15} height={15} /> Overview</NavLink>
        <NavLink to="/admin/artists" className={tab}><IconMic width={15} height={15} /> Artists</NavLink>
        <NavLink to="/admin/releases" className={tab}><IconDisc width={15} height={15} /> Releases</NavLink>
        <NavLink to="/admin/tracks" className={tab}><IconWave width={15} height={15} /> Tracks</NavLink>
      </nav>

      <Outlet />
    </div>
  );
}
