import { useParams, Link } from 'react-router-dom';
import { useFetch } from '@/lib/useFetch';
import type { Album, Track } from '@/lib/types';
import { TrackRow } from '@/components/TrackRow';
import { Artwork } from '@/components/Artwork';
import { usePlayer } from '@/player/store';
import { trackToQueueItem } from '@/providers';
import { formatDate } from '@/lib/format';
import { IconPlay } from '@/components/Icons';
import { OriginalBadge, SourceChip } from '@/components/Provenance';

interface Data { album: Album; tracks: Track[] }

export default function AlbumPage() {
  const { slug } = useParams();
  const { data, loading, error } = useFetch<Data>(`/albums/${slug}`, [slug]);

  if (loading) return <div className="loading-page"><span className="spin" /></div>;
  if (error || !data) return <div className="page"><div className="empty"><h3>Release not found</h3><p>{error}</p></div></div>;

  const { album, tracks } = data;

  const playAll = () => {
    const items = tracks.map(trackToQueueItem).filter(Boolean) as NonNullable<ReturnType<typeof trackToQueueItem>>[];
    if (items.length) void usePlayer.getState().playQueue(items, 0);
  };

  return (
    <div className="page">
      <div className="detail-head">
        <div className="detail-art">
          <Artwork src={album.artworkUrl} alt={`Cover of ${album.title}`} />
        </div>
        <div style={{ minWidth: 240, flex: 1 }}>
          <div className="detail-kind" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {album.type}
            {album.sourceType === 'original' ? <OriginalBadge /> : <SourceChip sourceType={album.sourceType} />}
          </div>
          <h1 className="detail-title">{album.title}</h1>
          <div className="detail-meta">
            <Link to={`/artist/${album.artist.slug}`}>{album.artist.name}</Link>
            {album.releasedOn && <> · {formatDate(album.releasedOn)}</>}
            {' · '}{tracks.length} tracks
            {album.catalogNo && <> · <span style={{ letterSpacing: '0.06em' }}>{album.catalogNo}</span></>}
          </div>
          <div className="detail-actions">
            <button className="btn primary" onClick={playAll}>
              <IconPlay width={15} height={15} /> Play
            </button>
          </div>
        </div>
      </div>

      {album.description && <p className="prose" style={{ marginBottom: 24 }}>{album.description}</p>}

      <div className="tracklist">
        {tracks.map((t, i) => <TrackRow key={t.id} track={t} index={i} context={tracks} />)}
      </div>
    </div>
  );
}
