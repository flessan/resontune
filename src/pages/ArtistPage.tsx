import { useParams, Link } from 'react-router-dom';
import { useFetch } from '@/lib/useFetch';
import type { Artist, Album, Track } from '@/lib/types';
import { TrackRow } from '@/components/TrackRow';
import { AlbumTile } from '@/components/Tiles';
import { Artwork } from '@/components/Artwork';
import { usePlayer } from '@/player/store';
import { trackToQueueItem } from '@/providers';
import { IconPlay, IconExternal } from '@/components/Icons';

interface Data {
  artist: Artist;
  albums: Album[];
  popularTracks: Track[];
}

export default function ArtistPage() {
  const { slug } = useParams();
  const { data, loading, error } = useFetch<Data>(`/artists/${slug}`, [slug]);

  if (loading) return <div className="loading-page"><span className="spin" /></div>;
  if (error || !data) return <div className="page"><div className="empty"><h3>Artist not found</h3><p>{error}</p></div></div>;

  const { artist, albums, popularTracks } = data;

  const playAll = () => {
    const items = popularTracks.map(trackToQueueItem).filter(Boolean) as NonNullable<ReturnType<typeof trackToQueueItem>>[];
    if (items.length) void usePlayer.getState().playQueue(items, 0);
  };

  return (
    <div className="page">
      <div className="detail-head">
        <div className="detail-art round">
          <Artwork src={artist.imageUrl} alt={`Photo of ${artist.name}`} />
        </div>
        <div style={{ minWidth: 240, flex: 1 }}>
          <div className="detail-kind">Artist</div>
          <h1 className="detail-title">{artist.name}</h1>
          <div className="detail-meta">
            {artist.location}
            {artist.genres?.length ? <> · {artist.genres.map((g) => g.name).join(', ')}</> : null}
          </div>
          <div className="detail-actions">
            <button className="btn primary" onClick={playAll}>
              <IconPlay width={15} height={15} /> Play popular
            </button>
            {artist.links?.map((l) => (
              <a key={l.url + l.label} className="btn small" href={l.url} target="_blank" rel="noreferrer">
                <IconExternal width={13} height={13} /> {l.label}
              </a>
            ))}
          </div>
          {(artist.links?.some((l) => ['kofi', 'patreon', 'bandcamp'].includes(l.kind))) && (
            <p style={{ fontSize: 12.5, color: 'var(--ink-faint)', marginTop: 10 }}>
              Like what you hear? Support {artist.name} directly through the links above.
            </p>
          )}
        </div>
      </div>

      {artist.bio && <p className="prose">{artist.bio}</p>}

      {popularTracks.length > 0 && (
        <>
          <div className="section-head"><h2 className="section-title">Popular</h2></div>
          <div className="tracklist">
            {popularTracks.map((t, i) => <TrackRow key={t.id} track={t} index={i} context={popularTracks} />)}
          </div>
        </>
      )}

      {albums.length > 0 && (
        <>
          <div className="section-head"><h2 className="section-title">Releases</h2></div>
          <div className="card-row">
            {albums.map((al) => (
              <Link key={al.id} to={`/release/${al.slug}`} className="tile">
                <div className="tile-art"><Artwork src={al.artworkUrl} alt="" /></div>
                <div className="tile-title">{al.title}</div>
                <div className="tile-sub">{al.type.toUpperCase()} · {al.trackCount} tracks</div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
