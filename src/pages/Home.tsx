/**
 * Home — the front page of a music platform, not a dashboard:
 * Featured Release → Originals → New releases → Rising artists →
 * Community picks → Trending → Collections. Every section is music-first,
 * deterministic and explained; nothing here is an engagement statistic.
 */
import { Link } from 'react-router-dom';
import { useFetch } from '@/lib/useFetch';
import type { Track, Album, Artist, Collection } from '@/lib/types';
import { TrackTile, AlbumTile, ArtistTile, CollectionTile } from '@/components/Tiles';
import { TrackRow } from '@/components/TrackRow';
import { OriginalBadge } from '@/components/Provenance';
import { usePlayer } from '@/player/store';
import { trackToQueueItem } from '@/providers';
import { IconPlay } from '@/components/Icons';
import { api } from '@/lib/api';
import { toast } from '@/stores/toast';

interface FeaturedRelease extends Album {
  description?: string | null;
}

interface HomeData {
  featuredRelease: FeaturedRelease | null;
  originals: Track[];
  collections: Collection[];
  trending: Track[];
  newReleases: Album[];
  risingArtists: Artist[];
  communityPicks: Track[];
}

export default function Home() {
  const { data, loading, error } = useFetch<HomeData>('/home');

  const playFeatured = async (slug: string) => {
    try {
      const r = await api.get<{ tracks: Track[] }>(`/albums/${slug}`);
      const items = r.tracks.map(trackToQueueItem).filter(Boolean) as NonNullable<ReturnType<typeof trackToQueueItem>>[];
      if (!items.length) return toast('No playable tracks on this release.');
      void usePlayer.getState().playQueue(items, 0);
    } catch {
      toast('Could not load the release.');
    }
  };

  if (loading) return <div className="loading-page"><span className="spin" /></div>;
  if (error || !data) return <div className="page"><div className="empty"><h3>Couldn't load the catalog</h3><p>{error}</p></div></div>;

  const feat = data.featuredRelease;

  return (
    <div className="page">
      {feat && (
        <section className="featured" aria-label="Featured release">
          {feat.artworkUrl && <img src={feat.artworkUrl} alt="" />}
          <div>
            <div className="kicker">
              Featured release{feat.catalogNo ? ` · ${feat.catalogNo}` : ''}
            </div>
            <div style={{ marginBottom: 8 }}><OriginalBadge /></div>
            <h2>{feat.title}</h2>
            <div className="featured-artist">
              <Link to={`/artist/${feat.artist.slug}`}>{feat.artist.name}</Link>
              {' · '}{feat.type.toUpperCase()}
              {feat.releasedOn ? ` · ${new Date(feat.releasedOn).getFullYear()}` : ''}
            </div>
            {feat.description && <p className="blurb">{feat.description}</p>}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn primary" onClick={() => void playFeatured(feat.slug)}>
                <IconPlay width={15} height={15} /> Play
              </button>
              <Link to={`/release/${feat.slug}`} className="btn">Open release</Link>
            </div>
          </div>
        </section>
      )}

      <div className="section-head">
        <h2 className="section-title">ResonTune Originals</h2>
        <Link to="/originals" className="section-link">The Originals catalog</Link>
      </div>
      <div className="card-row">
        {data.originals.slice(0, 6).map((t) => (
          <TrackTile key={t.id} track={t} context={data.originals} />
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
        <h2 className="section-title">Rising artists</h2>
        <Link to="/artists" className="section-link">All artists</Link>
      </div>
      <div className="card-row">
        {data.risingArtists.map((a) => <ArtistTile key={a.id} artist={a} />)}
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
        <h2 className="section-title">Trending</h2>
        <span className="section-note">most played in the last two weeks</span>
      </div>
      <div className="card-row">
        {data.trending.slice(0, 6).map((t) => (
          <TrackTile key={t.id} track={t} context={data.trending} />
        ))}
      </div>

      {data.collections.length > 0 && (
        <>
          <div className="section-head">
            <h2 className="section-title">Collections</h2>
            <Link to="/collections" className="section-link">All collections</Link>
          </div>
          <div className="collection-grid">
            {data.collections.slice(0, 3).map((c) => <CollectionTile key={c.id} collection={c} />)}
          </div>
        </>
      )}
    </div>
  );
}
