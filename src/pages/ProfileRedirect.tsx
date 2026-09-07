/**
 * /profile — a stable link to your own page.
 *
 * Redirects to the canonical public profile (/u/<username>) once the
 * verified session is known.
 */
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/stores/auth';

export default function ProfileRedirect() {
  const user = useAuth((s) => s.user);
  const loaded = useAuth((s) => s.loaded);

  if (!loaded) return <div className="loading-page"><span className="spin" /></div>;
  if (!user) {
    return (
      <div className="page">
        <div className="empty">
          <h3>Not signed in</h3>
          <p>Sign in to see your ResonTune profile, playlists and listening stats.</p>
        </div>
      </div>
    );
  }
  return <Navigate to={`/u/${user.handle}`} replace />;
}
