import { Link } from 'react-router-dom';
import { useFetch } from '@/lib/useFetch';
import type { Track } from '@/lib/types';
import { useAuth } from '@/stores/auth';
import { TrackRow } from '@/components/TrackRow';
import { LibraryTabs } from '@/components/LibraryTabs';


export function Favorites() {
  const user = useAuth((s) => s.user);
  const favCount = useAuth((s) => s.favoriteIds.size);
  const { data, loading } = useFetch<{ tracks: Track[] }>(user ? '/me/favorites' : null, [user?.id, favCount]);

  return (
    <div className="page">
      <h1 className="page-title">Library</h1>
      <p className="page-sub">Tracks you've saved from the community catalog.</p>
      <LibraryTabs />
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
      <h1 className="page-title">Library</h1>
      <p className="page-sub">What you've played, most recent first.</p>
      <LibraryTabs />
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
