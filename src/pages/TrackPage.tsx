import { useParams, Link } from 'react-router-dom';
import { useFetch } from '@/lib/useFetch';
import type { Track } from '@/lib/types';
import { usePlayer } from '@/player/store';
import { useAuth } from '@/stores/auth';
import { trackToQueueItem } from '@/providers';
import { TrackRow } from '@/components/TrackRow';
import { Artwork } from '@/components/Artwork';
import { formatDuration, formatCount, formatDate } from '@/lib/format';
import { toast } from '@/stores/toast';
import { IconPlay, IconPause, IconHeart, IconQueue, IconWave } from '@/components/Icons';
import { OriginalBadge, SourceChip, provenanceLabel } from '@/components/Provenance';
import { api } from '@/lib/api';

interface Data {
  track: Track;
  related: Track[];
  moreFromArtist: Track[];
}

export default function TrackPage() {
  const { slug } = useParams();
  const { data, loading, error } = useFetch<Data>(`/tracks/${slug}`, [slug]);
  const currentId = usePlayer((s) => (s.queue[s.index]?.origin === 'remote' ? s.queue[s.index]?.id : null));
  const playing = usePlayer((s) => s.playing);
  const user = useAuth((s) => s.user);
  const isFav = useAuth((s) => (data ? s.favoriteIds.has(data.track.id) : false));

  if (loading) return <div className="loading-page"><span className="spin" /></div>;
  if (error || !data) {
    return (
      <div className="page">
        <div className="empty">
          <h3>This track isn't available</h3>
          <p>{error ?? 'It may have been unpublished or removed.'} Try <Link to="/search">searching the catalog</Link> or browsing <Link to="/discover">Discover</Link>.</p>
        </div>
      </div>
    );
  }

  const { track, related, moreFromArtist } = data;
  const isCurrent = currentId === track.id;

  const play = () => {
    if (isCurrent) return void usePlayer.getState().toggle();
    const item = trackToQueueItem(track);
    if (!item) return toast('No playable source for this track.');
    void usePlayer.getState().playQueue([item], 0);
  };

  const fav = async () => {
    if (!user) return toast('Sign in to save favorites.');
    const f = await useAuth.getState().toggleFavorite(track.id);
    toast(f ? 'Added to favorites' : 'Removed from favorites');
  };

  const queueNext = () => {
    const item = trackToQueueItem(track);
    if (!item) return toast('No playable source.');
    usePlayer.getState().playNext(item);
    toast('Playing next');
  };

  const startRadio = async () => {
    try {
      const r = await api.get<{ tracks: Track[]; label: string }>(`/radio?station=track:${track.slug}`);
      const items = r.tracks.map(trackToQueueItem).filter(Boolean) as NonNullable<ReturnType<typeof trackToQueueItem>>[];
      if (!items.length) return toast('Nothing to play.');
      void usePlayer.getState().playQueue(items, 0);
      toast(`Now playing: ${r.label}`);
    } catch {
      toast('Could not start the radio.');
    }
  };

  return (
    <div className="page">
      <div className="detail-head">
        <div className="detail-art">
          <Artwork src={track.artworkUrl} alt={`Artwork for ${track.title}`} />
        </div>
        <div style={{ minWidth: 240, flex: 1 }}>
          <div className="detail-kind" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            Track
            {track.sourceType === 'original' ? <OriginalBadge /> : <SourceChip sourceType={track.sourceType} />}
          </div>
          <h1 className="detail-title">{track.title}</h1>
          <div className="detail-meta">
            <Link to={`/artist/${track.artist.slug}`}>{track.artist.name}</Link>
            {track.album?.title && track.album.slug && (
              <> · <Link to={`/release/${track.album.slug}`}>{track.album.title}</Link></>
            )}
            {' · '}{formatDuration(track.duration)} · {formatCount(track.playCount)} plays
          </div>
          <div className="detail-actions">
            <button className="btn primary" onClick={play}>
              {isCurrent && playing ? <IconPause width={15} height={15} /> : <IconPlay width={15} height={15} />}
              {isCurrent && playing ? 'Pause' : 'Play'}
            </button>
            <button className={`btn ${isFav ? 'primary' : ''}`} onClick={() => void fav()}>
              <IconHeart width={15} height={15} filled={isFav} /> {formatCount(track.likeCount)}
            </button>
            <button className="btn" onClick={queueNext}>
              <IconQueue width={15} height={15} /> Play next
            </button>
            <button className="btn" onClick={() => void startRadio()}>
              <IconWave width={15} height={15} /> Start radio
            </button>
          </div>
          <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {track.genres.map((g) => (
              <Link key={g.id} to={`/genre/${g.id}`} className="pill" style={{ fontSize: 12 }}>{g.name}</Link>
            ))}
            {track.tags.map((t) => (
              <span key={t.id} className="pill" style={{ fontSize: 12, opacity: 0.7 }}>#{t.name}</span>
            ))}
          </div>
        </div>
      </div>

      {track.description && <p className="prose">{track.description}</p>}

      {track.lyrics?.body && (
        <>
          <div className="section-head"><h2 className="section-title">Lyrics & notes</h2></div>
          <div className="lyrics-body" style={{ fontSize: 14 }}>{track.lyrics.body}</div>
        </>
      )}

      <div className="section-head"><h2 className="section-title">Credits & licensing</h2></div>
      <table className="simple" style={{ maxWidth: 620 }}>
        <tbody>
          {track.credits && <tr><td style={{ color: 'var(--ink-muted)', width: 140 }}>Credits</td><td>{track.credits}</td></tr>}
          {track.rightsHolder && <tr><td style={{ color: 'var(--ink-muted)' }}>Rights holder</td><td>{track.rightsHolder}</td></tr>}
          {track.license && (
            <tr>
              <td style={{ color: 'var(--ink-muted)' }}>License</td>
              <td>
                {track.license.url ? (
                  <a href={track.license.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>
                    {track.license.name}
                  </a>
                ) : track.license.name}
                {track.license.requiresAttribution && <span style={{ color: 'var(--ink-faint)' }}> · attribution required</span>}
              </td>
            </tr>
          )}
          {track.attributionText && track.license?.requiresAttribution && (
            <tr><td style={{ color: 'var(--ink-muted)' }}>Attribution</td><td>{track.attributionText}</td></tr>
          )}
          <tr><td style={{ color: 'var(--ink-muted)' }}>Released</td><td>{formatDate(track.createdAt)}</td></tr>
          <tr>
            <td style={{ color: 'var(--ink-muted)' }}>Origin</td>
            <td>{provenanceLabel(track.sourceType)}</td>
          </tr>
        </tbody>
      </table>

      {moreFromArtist.length > 0 && (
        <>
          <div className="section-head">
            <h2 className="section-title">More from {track.artist.name}</h2>
          </div>
          <div className="tracklist">
            {moreFromArtist.map((t, i) => <TrackRow key={t.id} track={t} index={i} context={moreFromArtist} />)}
          </div>
        </>
      )}

      {related.length > 0 && (
        <>
          <div className="section-head">
            <h2 className="section-title">Related tracks</h2>
            <span className="section-note">shares a genre with this track</span>
          </div>
          <div className="tracklist">
            {related.map((t, i) => <TrackRow key={t.id} track={t} index={i} context={related} />)}
          </div>
        </>
      )}
    </div>
  );
}
