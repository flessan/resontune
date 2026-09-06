import { Link } from 'react-router-dom';
import { useFetch } from '@/lib/useFetch';
import type { Track, Album, Artist } from '@/lib/types';
import { TrackTile, AlbumTile, ArtistTile } from '@/components/Tiles';
import { TrackRow } from '@/components/TrackRow';
import { usePlayer } from '@/player/store';
import { trackToQueueItem } from '@/providers';
import { IconPlay } from '@/components/Icons';

interface HomeData {
  trending: Track[];
  newReleases: Album[];
  risingArtists: Artist[];
  communityPicks: Track[];
}

export default function Home() {
  const { data, loading, error } = useFetch<HomeData>('/home');

  const playTrending = () => {
    if (!data?.trending.length) return;
    const items = data.trending.map(trackToQueueItem).filter(Boolean) as NonNullable<ReturnType<typeof trackToQueueItem>>[];
    void usePlayer.getState().playQueue(items, 0);
  };

  if (loading) return <div className="loading-page"><span className="spin" /></div>;
  if (error || !data) return <div className="page"><div className="empty"><h3>Couldn't load the catalog</h3><p>{error}</p></div></div>;

  return (
    <div className="page">
      <div className="hero">
        <div className="hero-inner">
          <h2>Open music.<br />For <em>everyone.</em></h2>
          <p>
            A community-driven catalog you can play instantly — no account, no
            subscription, no listening limits. Bring your own files too: the local
            library lives entirely on your device.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn primary" onClick={playTrending}>
              <IconPlay width={15} height={15} /> Play what's trending
            </button>
            <Link to="/library" className="btn">Open local library</Link>
          </div>
        </div>
        <div className="hero-art" aria-hidden>
          {data.newReleases.slice(0, 2).map((al) => (
            al.artworkUrl ? <img key={al.id} src={al.artworkUrl} alt="" /> : null
          ))}
        </div>
      </div>

      <div className="section-head">
        <h2 className="section-title">Trending</h2>
        <span className="section-note">most played in the last two weeks</span>
      </div>
      <div className="card-row">
        {data.trending.slice(0, 6).map((t) => (
          <TrackTile key={t.id} track={t} context={data.trending} />
        ))}
      </div>

      <div className="section-head">
        <h2 className="section-title">New releases</h2>
        <Link to="/albums" className="section-link">All releases</Link>
      </div>
      <div className="card-row">
        {data.newReleases.slice(0, 6).map((al) => <AlbumTile key={al.id} album={al} />)}
      </div>

      <div className="section-head">
        <h2 className="section-title">Community picks</h2>
        <span className="section-note">chosen by listeners, not algorithms</span>
      </div>
      <div className="tracklist">
        {data.communityPicks.map((t, i) => (
          <div key={t.id}>
            <TrackRow track={t} index={i} context={data.communityPicks} />
            {t.pickNote && <div className="note-card" style={{ margin: '6px 0 10px 90px' }}>“{t.pickNote}”</div>}
          </div>
        ))}
      </div>

      <div className="section-head">
        <h2 className="section-title">Rising artists</h2>
        <Link to="/artists" className="section-link">All artists</Link>
      </div>
      <div className="card-row">
        {data.risingArtists.map((a) => <ArtistTile key={a.id} artist={a} />)}
      </div>
    </div>
  );
}
