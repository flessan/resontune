/**
 * ResonTune Originals — music actually published through the ResonTune
 * catalog itself. Releases (chronological), artists, most-played tracks.
 * May legitimately be empty until the first real release.
 */
import { Link } from 'react-router-dom';
import { useFetch } from '@/lib/useFetch';
import type { Track, Album, Artist } from '@/lib/types';
import { AlbumTile, ArtistTile } from '@/components/Tiles';
import { TrackRow } from '@/components/TrackRow';
import { OriginalBadge } from '@/components/Provenance';
import { usePlayer } from '@/player/store';
import { trackToQueueItem } from '@/providers';
import { IconPlay, IconWave } from '@/components/Icons';
import { api } from '@/lib/api';
import { toast } from '@/stores/toast';

interface OriginalsData {
  releases: (Album & { description?: string | null })[];
  artists: Artist[];
  topTracks: Track[];
}

export default function Originals() {
  const { data, loading, error } = useFetch<OriginalsData>('/originals');

  const playTop = () => {
    if (!data?.topTracks.length) return;
    const items = data.topTracks.map(trackToQueueItem).filter(Boolean) as NonNullable<ReturnType<typeof trackToQueueItem>>[];
    void usePlayer.getState().playQueue(items, 0);
  };

  const startRadio = async () => {
    try {
      const r = await api.get<{ tracks: Track[]; label: string }>(`/radio?station=originals`);
      const items = r.tracks.map(trackToQueueItem).filter(Boolean) as NonNullable<ReturnType<typeof trackToQueueItem>>[];
      if (!items.length) return toast('Nothing to play yet.');
      void usePlayer.getState().playQueue(items, 0);
      toast(`Now playing: ${r.label}`);
    } catch {
      toast('Could not start the radio.');
    }
  };

  if (loading) return <div className="loading-page"><span className="spin" /></div>;
  if (error || !data) return <div className="page"><div className="empty"><h3>Couldn't load Originals</h3><p>{error}</p></div></div>;

  const empty = !data.releases.length && !data.artists.length && !data.topTracks.length;
  if (empty) {
    return (
      <div className="page">
        <div style={{ marginBottom: 6 }}><OriginalBadge /></div>
        <h1 className="page-title">Originals</h1>
        <p className="page-sub">Released directly through ResonTune — hosted here, free to stream, clear licensing.</p>
        <div className="empty" style={{ marginTop: 24 }}>
          <h3>No ResonTune Originals yet</h3>
          <p>When music is published directly through ResonTune, it appears here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="catalog-head">
        <div>
          <div style={{ marginBottom: 6 }}><OriginalBadge /></div>
          <h1 className="page-title">Originals</h1>
          <p className="page-sub" style={{ marginBottom: 0 }}>
            Released directly through ResonTune — hosted here, free to stream, clear licensing.
          </p>
        </div>
        <div className="catalog-actions">
          <button className="btn primary" onClick={playTop}>
            <IconPlay width={14} height={14} /> Play
          </button>
          <button className="btn" onClick={() => void startRadio()}>
            <IconWave width={14} height={14} /> Radio
          </button>
        </div>
      </div>

      {data.releases.length > 0 && (
        <>
          <div className="section-head">
            <h2 className="section-title">Releases</h2>
            <span className="section-note">newest first</span>
          </div>
          <div className="card-row">
            {data.releases.map((al) => <AlbumTile key={al.id} album={{ ...al, sourceType: 'original' }} />)}
          </div>
        </>
      )}

      {data.artists.length > 0 && (
        <>
          <div className="section-head">
            <h2 className="section-title">Artists</h2>
          </div>
          <div className="shelf">
            {data.artists.map((a) => <ArtistTile key={a.id} artist={a} />)}
          </div>
        </>
      )}

      {data.topTracks.length > 0 && (
        <>
          <div className="section-head">
            <h2 className="section-title">Most played</h2>
            <Link to="/discover" className="section-link">Discover more</Link>
          </div>
          <div className="tracklist">
            {data.topTracks.map((t, i) => (
              <TrackRow key={t.id} track={t} index={i} context={data.topTracks} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
