/**
 * Community — releases published by independent artists through the
 * submission → review → publication pipeline.
 */
import { Link } from 'react-router-dom';
import { useFetch } from '@/lib/useFetch';
import type { Track, Album, Artist } from '@/lib/types';
import { AlbumTile, ArtistTile } from '@/components/Tiles';
import { TrackRow } from '@/components/TrackRow';
import { usePlayer } from '@/player/store';
import { trackToQueueItem } from '@/providers';
import { IconWave, IconSubmit } from '@/components/Icons';
import { api } from '@/lib/api';
import { toast } from '@/stores/toast';

interface CommunityData {
  releases: Album[];
  artists: Artist[];
  latestTracks: Track[];
  picks: Track[];
}

export default function Community() {
  const { data, loading, error } = useFetch<CommunityData>('/community');

  const startRadio = async () => {
    try {
      const r = await api.get<{ tracks: Track[]; label: string }>(`/radio?station=community`);
      const items = r.tracks.map(trackToQueueItem).filter(Boolean) as NonNullable<ReturnType<typeof trackToQueueItem>>[];
      if (!items.length) return toast('Nothing to play yet.');
      void usePlayer.getState().playQueue(items, 0);
      toast(`Now playing: ${r.label}`);
    } catch {
      toast('Could not start the radio.');
    }
  };

  if (loading) return <div className="loading-page"><span className="spin" /></div>;
  if (error || !data) return <div className="page"><div className="empty"><h3>Couldn't load the community catalog</h3><p>{error}</p></div></div>;

  return (
    <div className="page">
      <div className="catalog-head">
        <div>
          <h1 className="page-title">Community</h1>
          <p className="page-sub" style={{ marginBottom: 0 }}>
            Submitted by independent artists, reviewed, and published with the rights they declared.
          </p>
        </div>
        <div className="catalog-actions">
          <button className="btn primary" onClick={() => void startRadio()}>
            <IconWave width={14} height={14} /> Radio
          </button>
          <Link to="/submit" className="btn">
            <IconSubmit width={14} height={14} /> Submit music
          </Link>
        </div>
      </div>

      <div className="section-head">
        <h2 className="section-title">Latest community releases</h2>
      </div>
      <div className="card-row">
        {data.releases.map((al) => <AlbumTile key={al.id} album={al} />)}
      </div>

      <div className="section-head">
        <h2 className="section-title">Community artists</h2>
      </div>
      <div className="shelf">
        {data.artists.map((a) => <ArtistTile key={a.id} artist={a} />)}
      </div>

      {data.picks.length > 0 && (
        <>
          <div className="section-head">
            <h2 className="section-title">Community picks</h2>
            <span className="section-note">chosen by listeners, not algorithms</span>
          </div>
          <div className="tracklist">
            {data.picks.map((t, i) => (
              <div key={t.id}>
                <TrackRow track={t} index={i} context={data.picks} />
                {t.pickNote && <div className="note-card" style={{ margin: '6px 0 10px 90px' }}>“{t.pickNote}”</div>}
              </div>
            ))}
          </div>
        </>
      )}

      <div className="section-head">
        <h2 className="section-title">Just published</h2>
      </div>
      <div className="tracklist">
        {data.latestTracks.map((t, i) => (
          <TrackRow key={t.id} track={t} index={i} context={data.latestTracks} />
        ))}
      </div>
    </div>
  );
}
