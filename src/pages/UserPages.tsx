import { Link } from 'react-router-dom';
import { useFetch } from '@/lib/useFetch';
import type { Track } from '@/lib/types';
import { useAuth } from '@/stores/auth';
import { TrackRow } from '@/components/TrackRow';
import { formatDate } from '@/lib/format';
import { toast } from '@/stores/toast';

export function Favorites() {
  const user = useAuth((s) => s.user);
  const favCount = useAuth((s) => s.favoriteIds.size);
  const { data, loading } = useFetch<{ tracks: Track[] }>(user ? '/me/favorites' : null, [user?.id, favCount]);

  return (
    <div className="page">
      <h1 className="page-title">Favorites</h1>
      <p className="page-sub">Tracks you've saved from the community catalog.</p>
      {!user ? (
        <div className="empty">
          <h3>Sign in to sync favorites</h3>
          <p>Local-file favorites live in your <Link to="/library" style={{ textDecoration: 'underline' }}>local library</Link> without an account.</p>
        </div>
      ) : loading ? (
        <div className="loading-page"><span className="spin" /></div>
      ) : !data?.tracks.length ? (
        <div className="empty"><h3>No favorites yet</h3><p>Tap the heart on any track to save it here.</p></div>
      ) : (
        <div className="tracklist">
          {data.tracks.map((t, i) => <TrackRow key={t.id} track={t} index={i} context={data.tracks} />)}
        </div>
      )}
    </div>
  );
}

export function History() {
  const user = useAuth((s) => s.user);
  const { data, loading } = useFetch<{ history: { playedAt: string; track: Track }[] }>(
    user ? '/me/history' : null, [user?.id],
  );

  return (
    <div className="page">
      <h1 className="page-title">Listening history</h1>
      <p className="page-sub">What you've played, most recent first.</p>
      {!user ? (
        <div className="empty"><h3>Sign in to keep history</h3><p>Anonymous listening is never tracked to your identity.</p></div>
      ) : loading ? (
        <div className="loading-page"><span className="spin" /></div>
      ) : !data?.history.length ? (
        <div className="empty"><h3>Nothing yet</h3><p>Play something and it'll show up here.</p></div>
      ) : (
        <div className="tracklist">
          {data.history.map((h, i) => <TrackRow key={h.track.id + h.playedAt} track={h.track} index={i} context={data.history.map((x) => x.track)} />)}
        </div>
      )}
    </div>
  );
}

interface ProfileData {
  stats: { tracksPlayed: number; artistsDiscovered: number; favorites: number; memberSince: string };
  topGenres: { id: string; name: string; plays: number }[];
  playlists: { id: string; slug: string; title: string; isPublic: boolean; likeCount: number; trackCount: number }[];
}

export function Profile() {
  const user = useAuth((s) => s.user);
  const { data, loading } = useFetch<ProfileData>(user ? '/me/profile' : null, [user?.id]);

  const exportData = async () => {
    try {
      const res = await fetch('/api/me/export', { credentials: 'same-origin' });
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'resontune-export.json';
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      toast('Export failed.');
    }
  };

  if (!user) {
    return (
      <div className="page">
        <div className="empty"><h3>Not signed in</h3><p>Sign in to see your music profile.</p></div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="detail-head" style={{ alignItems: 'center' }}>
        <div className="detail-art round" style={{ width: 120, height: 120, display: 'grid', placeItems: 'center', background: 'var(--accent-soft)' }}>
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt="" />
          ) : (
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 44, color: 'var(--accent)' }}>
              {user.displayName.slice(0, 1).toUpperCase()}
            </span>
          )}
        </div>
        <div>
          <div className="detail-kind">{user.role !== 'listener' ? user.role : 'Listener'}</div>
          <h1 className="detail-title" style={{ fontSize: 34 }}>{user.displayName}</h1>
          <div className="detail-meta">@{user.handle} · member since {formatDate(user.createdAt)}</div>
          <div className="detail-actions">
            <button className="btn small" onClick={() => void exportData()}>Export my data (JSON)</button>
            <button className="btn small" onClick={() => void useAuth.getState().logout().then(() => toast('Signed out'))}>
              Sign out
            </button>
          </div>
        </div>
      </div>

      {loading ? <div className="loading-page"><span className="spin" /></div> : data && (
        <>
          <div className="stat-grid" style={{ marginBottom: 30 }}>
            <div className="stat"><div className="n">{data.stats.tracksPlayed}</div><div className="l">Tracks played</div></div>
            <div className="stat"><div className="n">{data.stats.artistsDiscovered}</div><div className="l">Artists discovered</div></div>
            <div className="stat"><div className="n">{data.stats.favorites}</div><div className="l">Favorites</div></div>
            <div className="stat"><div className="n">{data.playlists.length}</div><div className="l">Playlists</div></div>
          </div>

          {data.topGenres.length > 0 && (
            <>
              <div className="section-head"><h2 className="section-title">Your genres</h2></div>
              <div className="pill-row" style={{ marginBottom: 10 }}>
                {data.topGenres.map((g) => (
                  <Link key={g.id} to={`/genre/${g.id}`} className="pill">
                    {g.name} <span style={{ opacity: 0.5, marginLeft: 6 }}>{g.plays}</span>
                  </Link>
                ))}
              </div>
            </>
          )}

          {data.playlists.length > 0 && (
            <>
              <div className="section-head"><h2 className="section-title">Your playlists</h2></div>
              <table className="simple" style={{ maxWidth: 640 }}>
                <thead>
                  <tr><th>Title</th><th>Tracks</th><th>Visibility</th><th>Likes</th></tr>
                </thead>
                <tbody>
                  {data.playlists.map((p) => (
                    <tr key={p.id}>
                      <td><Link to={`/playlist/${p.slug}`} style={{ color: 'var(--accent)' }}>{p.title}</Link></td>
                      <td>{p.trackCount}</td>
                      <td>{p.isPublic ? 'Public' : 'Private'}</td>
                      <td>{p.likeCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      )}
    </div>
  );
}
