/**
 * Discover — exploration without algorithms: genres, moods, collections,
 * newest releases, and the whole artist index, one hop away.
 */
import { Link } from 'react-router-dom';
import { useFetch } from '@/lib/useFetch';
import type { Track, Album, Collection } from '@/lib/types';
import { AlbumTile, CollectionTile } from '@/components/Tiles';
import { TrackRow } from '@/components/TrackRow';

interface GenreInfo { id: string; name: string; trackCount: number }
interface TagInfo { id: string; name: string; trackCount: number }

export default function Discover() {
  const { data: genres, loading: gLoading } = useFetch<{ genres: GenreInfo[] }>('/genres');
  const { data: tags } = useFetch<{ tags: TagInfo[] }>('/tags');
  const { data: albums, loading: aLoading } = useFetch<{ albums: Album[] }>('/albums?limit=12');
  const { data: collections } = useFetch<{ collections: Collection[] }>('/collections');
  const { data: latest, loading: tLoading } = useFetch<{ tracks: Track[] }>('/tracks?limit=10');

  const liveGenres = (genres?.genres ?? []).filter((g) => g.trackCount > 0);
  const liveTags = (tags?.tags ?? []).filter((t) => t.trackCount > 0);
  const loading = gLoading || aLoading || tLoading;
  const empty = !loading && !liveGenres.length && !(albums?.albums.length) && !(latest?.tracks.length);

  return (
    <div className="page">
      <div className="section-head" style={{ marginTop: 6 }}>
        <h1 className="section-title" style={{ fontSize: 30 }}>Discover</h1>
        <span className="section-note">by genre, mood, scene and release date — no profiling involved</span>
      </div>

      {empty && (
        <div className="empty" style={{ marginTop: 24 }}>
          <h3>Nothing to explore yet</h3>
          <p>The catalog is waiting for its first releases. Genres and moods appear as music is published.</p>
        </div>
      )}

      {liveGenres.length > 0 && (
        <>
          <div className="section-head"><h2 className="section-title">Genres</h2></div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 26 }}>
            {liveGenres.map((g) => (
              <Link key={g.id} to={`/genre/${g.id}`} className="pill">
                {g.name} <span style={{ opacity: 0.55 }}>{g.trackCount}</span>
              </Link>
            ))}
          </div>
        </>
      )}

      {liveTags.length > 0 && (
        <>
          <div className="section-head"><h2 className="section-title">Moods</h2></div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 26 }}>
            {liveTags.map((t) => (
              <Link key={t.id} to={`/tag/${t.id}`} className="pill">{t.name}</Link>
            ))}
          </div>
        </>
      )}

      {collections && collections.collections.length > 0 && (
        <>
          <div className="section-head">
            <h2 className="section-title">Collections</h2>
            <Link to="/collections" className="section-link">All collections</Link>
          </div>
          <div className="collection-grid" style={{ marginBottom: 30 }}>
            {collections.collections.slice(0, 3).map((c) => <CollectionTile key={c.id} collection={c} />)}
          </div>
        </>
      )}

      {(albums?.albums.length ?? 0) > 0 && (
        <>
          <div className="section-head">
            <h2 className="section-title">Recent releases</h2>
            <Link to="/albums" className="section-link">All releases</Link>
          </div>
          <div className="card-row">
            {(albums?.albums ?? []).slice(0, 6).map((al) => <AlbumTile key={al.id} album={al} />)}
          </div>
        </>
      )}

      {(latest?.tracks.length ?? 0) > 0 && (
        <>
          <div className="section-head">
            <h2 className="section-title">Latest tracks</h2>
            <Link to="/artists" className="section-link">Browse artists</Link>
          </div>
          <div className="tracklist">
            {(latest?.tracks ?? []).map((t, i) => (
              <TrackRow key={t.id} track={t} index={i} context={latest?.tracks} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
