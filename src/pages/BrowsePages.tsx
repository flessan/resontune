import { useParams, Link } from 'react-router-dom';
import { useFetch } from '@/lib/useFetch';
import type { Artist, Album, Track } from '@/lib/types';
import { ArtistTile, AlbumTile } from '@/components/Tiles';
import { TrackRow } from '@/components/TrackRow';

export function ArtistsPage() {
  const { data, loading } = useFetch<{ artists: Artist[] }>('/artists?limit=60');
  return (
    <div className="page">
      <h1 className="page-title">Artists</h1>
      <p className="page-sub">Every artist in the community catalog. Support links live on their pages.</p>
      {loading ? <div className="loading-page"><span className="spin" /></div> : (
        <div className="card-row">
          {data?.artists.map((a) => <ArtistTile key={a.id} artist={a} />)}
        </div>
      )}
    </div>
  );
}

export function AlbumsPage() {
  const { data, loading } = useFetch<{ albums: Album[] }>('/albums?limit=60');
  return (
    <div className="page">
      <h1 className="page-title">Releases</h1>
      <p className="page-sub">Albums, EPs and singles — newest first.</p>
      {loading ? <div className="loading-page"><span className="spin" /></div> : (
        <div className="card-row">
          {data?.albums.map((al) => <AlbumTile key={al.id} album={al} />)}
        </div>
      )}
    </div>
  );
}

export function GenresPage() {
  const { data: genres } = useFetch<{ genres: { id: string; name: string; trackCount: number }[] }>('/genres');
  const { data: tags } = useFetch<{ tags: { id: string; name: string; trackCount: number }[] }>('/tags');
  return (
    <div className="page">
      <h1 className="page-title">Genres & tags</h1>
      <p className="page-sub">Browse the catalog by how it sounds and how it feels.</p>
      <div className="section-head"><h2 className="section-title">Genres</h2></div>
      <div className="pill-row">
        {genres?.genres.map((g) => (
          <Link key={g.id} to={`/genre/${g.id}`} className="pill">
            {g.name} <span style={{ opacity: 0.5, marginLeft: 6 }}>{g.trackCount}</span>
          </Link>
        ))}
      </div>
      <div className="section-head"><h2 className="section-title">Tags</h2></div>
      <div className="pill-row">
        {tags?.tags.map((t) => (
          <Link key={t.id} to={`/tag/${t.id}`} className="pill">
            #{t.name} <span style={{ opacity: 0.5, marginLeft: 6 }}>{t.trackCount}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function GenrePage() {
  const { id } = useParams();
  const { data, loading } = useFetch<{ tracks: Track[] }>(`/tracks?genre=${id}&limit=60`, [id]);
  return (
    <div className="page">
      <div className="detail-kind">Genre</div>
      <h1 className="page-title" style={{ textTransform: 'capitalize' }}>{id?.replace(/-/g, ' ')}</h1>
      {loading ? <div className="loading-page"><span className="spin" /></div> : (
        <div className="tracklist" style={{ marginTop: 20 }}>
          {data?.tracks.map((t, i) => <TrackRow key={t.id} track={t} index={i} context={data.tracks} />)}
          {!data?.tracks.length && <div className="empty" style={{ borderTop: 'none' }}><h3>No tracks yet</h3><p>This genre is waiting for its first submission.</p></div>}
        </div>
      )}
    </div>
  );
}

export function TagPage() {
  const { id } = useParams();
  const { data, loading } = useFetch<{ tracks: Track[] }>(`/tracks?tag=${id}&limit=60`, [id]);
  return (
    <div className="page">
      <div className="detail-kind">Tag</div>
      <h1 className="page-title">#{id?.replace(/-/g, ' ')}</h1>
      {loading ? <div className="loading-page"><span className="spin" /></div> : (
        <div className="tracklist" style={{ marginTop: 20 }}>
          {data?.tracks.map((t, i) => <TrackRow key={t.id} track={t} index={i} context={data.tracks} />)}
        </div>
      )}
    </div>
  );
}
