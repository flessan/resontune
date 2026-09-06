/**
 * Home — the front room of a music app: play something within one screen.
 * A compact artwork-led featured banner, then horizontal shelves and dense
 * track lists. No promotional storytelling; the music is the interface.
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
import { useAuth } from '@/stores/auth';

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
  const user = useAuth((s) => s.user);
  const { data: hist } = useFetch<{ history: { playedAt: string; track: Track }[] }>(
    user ? '/me/history' : null, [user?.id],
  );
  const hasQueue = usePlayer((s) => s.queue.length > 0);
  const playing = usePlayer((s) => s.playing);

  /* Recently played: de-duplicated by track, newest first. */
  const recent: Track[] = [];
  if (hist?.history) {
    const seen = new Set<string>();
    for (const h of hist.history) {
      if (seen.has(h.track.id)) continue;
      seen.add(h.track.id);
      recent.push(h.track);
      if (recent.length >= 10) break;
    }
  }

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

  const resume = () => {
    void usePlayer.getState().toggle();
  };

  if (loading) return <div className="loading-page"><span className="spin" /></div>;
  if (error || !data) return <div className="page"><div className="empty"><h3>Couldn't load the catalog</h3><p>{error}</p></div></div>;

  const feat = data.featuredRelease;

  return (
    <div className="page">
      {feat && (
        <section className="featured" aria-label="Featured release">
          {feat.artworkUrl && (
            <Link to={`/release/${feat.slug}`}><img src={feat.artworkUrl} alt="" /></Link>
          )}
          <div>
            <div className="kicker">
              Featured{feat.catalogNo ? ` · ${feat.catalogNo}` : ''}
            </div>
            <h2><Link to={`/release/${feat.slug}`}>{feat.title}</Link></h2>
            <div className="featured-artist">
              <Link to={`/artist/${feat.artist.slug}`}>{feat.artist.name}</Link>
              {feat.sourceType === 'original' && <span style={{ marginLeft: 10 }}><OriginalBadge compact /></span>}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn primary small" onClick={() => void playFeatured(feat.slug)}>
                <IconPlay width={13} height={13} /> Play
              </button>
              {hasQueue && !playing && (
                <button className="btn small" onClick={resume}>Resume</button>
              )}
            </div>
          </div>
        </section>
      )}

      {recent.length > 0 && (
        <>
          <div className="section-head">
            <h2 className="section-title">Recently played</h2>
            <Link to="/history" className="section-link">History</Link>
          </div>
          <div className="shelf">
            {recent.map((t) => <TrackTile key={t.id} track={t} context={recent} />)}
          </div>
        </>
      )}

      <div className="section-head">
        <h2 className="section-title">ResonTune Originals</h2>
        <Link to="/originals" className="section-link">See all</Link>
      </div>
      <div className="shelf">
        {data.originals.slice(0, 10).map((t) => (
          <TrackTile key={t.id} track={t} context={data.originals} />
        ))}
      </div>

      <div className="section-head">
        <h2 className="section-title">From the community</h2>
        <Link to="/community" className="section-link">See all</Link>
      </div>
      <div className="tracklist home-tracklist">
        {data.communityPicks.slice(0, 6).map((t, i) => (
          <TrackRow key={t.id} track={t} index={i} context={data.communityPicks} />
        ))}
      </div>

      <div className="section-head">
        <h2 className="section-title">Trending</h2>
        <span className="section-note">most played in the last two weeks</span>
      </div>
      <div className="tracklist home-tracklist">
        {data.trending.slice(0, 8).map((t, i) => (
          <TrackRow key={t.id} track={t} index={i} context={data.trending} />
        ))}
      </div>

      <div className="section-head">
        <h2 className="section-title">New releases</h2>
        <Link to="/albums" className="section-link">See all</Link>
      </div>
      <div className="shelf">
        {data.newReleases.map((al) => <AlbumTile key={al.id} album={al} />)}
      </div>

      <div className="section-head">
        <h2 className="section-title">Artists to watch</h2>
        <Link to="/artists" className="section-link">See all</Link>
      </div>
      <div className="shelf">
        {data.risingArtists.map((a) => <ArtistTile key={a.id} artist={a} />)}
      </div>

      {data.collections.length > 0 && (
        <>
          <div className="section-head">
            <h2 className="section-title">Collections</h2>
            <Link to="/collections" className="section-link">See all</Link>
          </div>
          <div className="shelf">
            {data.collections.map((c) => <CollectionTile key={c.id} collection={c} />)}
          </div>
        </>
      )}
    </div>
  );
}
