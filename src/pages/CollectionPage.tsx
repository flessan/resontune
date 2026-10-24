/**
 * A single collection: title/curator/description plus its ordered mix of
 * tracks, releases and artists - with the curator's notes inline.
 */
import { useParams } from 'react-router-dom';
import { Link } from '@/components/AppLink';
import { sharedStyle } from '@/lib/motion';
import { useFetch } from '@/lib/useFetch';
import type { Collection, CollectionItem, Track } from '@/lib/types';
import { TrackRow } from '@/components/TrackRow';
import { AlbumTile, ArtistTile } from '@/components/Tiles';
import { Artwork } from '@/components/Artwork';
import { usePlayer } from '@/player/store';
import { trackToQueueItem } from '@/providers';
import { IconPlay } from '@/components/Icons';

interface Data {
  collection: Collection;
  items: CollectionItem[];
}

export default function CollectionPage() {
  const { slug } = useParams();
  const { data, loading, error } = useFetch<Data>(slug ? `/collections/${slug}` : null);

  if (loading) return <div className="loading-page"><span className="spin" /></div>;
  if (error || !data) {
    return (
      <div className="page">
        <div className="empty">
          <h3>This collection isn't available</h3>
          <p>{error ?? 'It may have been unpublished.'} See all current <Link to="/collections">collections</Link>.</p>
        </div>
      </div>
    );
  }

  const { collection, items } = data;
  const trackItems = items.filter((i) => i.kind === 'track' && i.track) as (CollectionItem & { track: Track })[];
  const albumItems = items.filter((i) => i.kind === 'album' && i.album);
  const artistItems = items.filter((i) => i.kind === 'artist' && i.artist);

  const playAll = () => {
    const tracks = trackItems.map((i) => i.track);
    const queue = tracks.map(trackToQueueItem).filter(Boolean) as NonNullable<ReturnType<typeof trackToQueueItem>>[];
    if (queue.length) void usePlayer.getState().playQueue(queue, 0);
  };

  return (
    <div className="page">
      <div className="detail-head">
        <div className="detail-art landscape" style={sharedStyle('collection', collection.id)}>
          <Artwork src={collection.artworkUrl} alt="" />
        </div>
        <div className="detail-identity detail-meta">
          <div className="detail-kind">Collection · {collection.curatorName}</div>
          <h1>{collection.title}</h1>
          {collection.description && <p className="detail-desc">{collection.description}</p>}
          {trackItems.length > 0 && (
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn primary" onClick={playAll}>
                <IconPlay width={15} height={15} /> Play the tracks
              </button>
            </div>
          )}
        </div>
      </div>

      {trackItems.length > 0 && (
        <>
          <div className="section-head"><h2 className="section-title">Tracks</h2></div>
          <div className="tracklist">
            {trackItems.map((i, idx) => (
              <div key={i.track.id}>
                <TrackRow track={i.track} index={idx} context={trackItems.map((x) => x.track)} />
                {i.note && <div className="note-card" style={{ margin: '6px 0 10px 90px' }}>“{i.note}”</div>}
              </div>
            ))}
          </div>
        </>
      )}

      {albumItems.length > 0 && (
        <>
          <div className="section-head"><h2 className="section-title">Releases</h2></div>
          <div className="card-row">
            {albumItems.map((i) => (
              <div key={i.album!.id}>
                <AlbumTile album={i.album!} />
                {i.note && <div className="note-card" style={{ marginTop: 6 }}>“{i.note}”</div>}
              </div>
            ))}
          </div>
        </>
      )}

      {artistItems.length > 0 && (
        <>
          <div className="section-head"><h2 className="section-title">Artists</h2></div>
          <div className="card-row">
            {artistItems.map((i) => (
              <div key={i.artist!.id}>
                <ArtistTile artist={i.artist!} />
                {i.note && <div className="note-card" style={{ marginTop: 6 }}>“{i.note}”</div>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
