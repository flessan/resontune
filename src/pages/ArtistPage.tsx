import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useFetch } from '@/lib/useFetch';
import type { Artist, Album, Track } from '@/lib/types';
import { TrackRow } from '@/components/TrackRow';
import { Blurb } from '@/components/Blurb';
import { Artwork } from '@/components/Artwork';
import { usePlayer } from '@/player/store';
import { trackToQueueItem } from '@/providers';
import { IconPlay, IconExternal, IconWave } from '@/components/Icons';
import { OriginalBadge, SourceChip } from '@/components/Provenance';
import { api } from '@/lib/api';
import { toast } from '@/stores/toast';
import { ContextMenuButton } from '@/contextmenu/ContextMenuButton';
import { useContextTarget } from '@/contextmenu/useContextTarget';
import { artistRef, type ContextTarget } from '@/contextmenu/types';

interface Data {
  artist: Artist;
  albums: Album[];
  popularTracks: Track[];
}

/** A release card on an artist page — the album rows here carry no nested
 *  artist, so the target borrows the page's artist. */
function ReleaseCard({ album, artist }: { album: Album; artist: Artist }) {
  const target = useMemo<ContextTarget>(
    () => ({
      type: 'release',
      release: { id: album.id, slug: album.slug, title: album.title, artist: { slug: artist.slug, name: artist.name } },
    }),
    [album, artist],
  );
  const ctxProps = useContextTarget(target);
  return (
    <Link to={`/release/${album.slug}`} className="tile" {...ctxProps}>
      <div className="tile-art">
        <Artwork src={album.artworkUrl} alt="" />
        <ContextMenuButton target={target} className="tile-more" size={16} />
      </div>
      <div className="tile-title">{album.title}</div>
      <div className="tile-sub">{album.type.toUpperCase()} · {album.trackCount} tracks</div>
    </Link>
  );
}

export default function ArtistPage() {
  const { slug } = useParams();
  const { data, loading, error } = useFetch<Data>(`/artists/${slug}`, [slug]);
  const loaded = data?.artist ?? null;
  const target = useMemo<ContextTarget | null>(
    () => (loaded ? { type: 'artist', artist: artistRef(loaded) } : null),
    [loaded],
  );
  const headProps = useContextTarget(target);

  if (loading) return <div className="loading-page"><span className="spin" /></div>;
  if (error || !data) {
    return (
      <div className="page">
        <div className="empty">
          <h3>This artist page isn't available</h3>
          <p>{error ?? 'The profile may have been removed.'} Discover more artists in <Link to="/originals">Originals</Link> and <Link to="/community">Community</Link>.</p>
        </div>
      </div>
    );
  }

  const { artist, albums, popularTracks } = data;

  const playAll = () => {
    const items = popularTracks.map(trackToQueueItem).filter(Boolean) as NonNullable<ReturnType<typeof trackToQueueItem>>[];
    if (items.length) void usePlayer.getState().playQueue(items, 0);
  };

  const startRadio = async () => {
    try {
      const r = await api.get<{ tracks: Track[]; label: string }>(`/radio?station=artist:${artist.slug}`);
      const items = r.tracks.map(trackToQueueItem).filter(Boolean) as NonNullable<ReturnType<typeof trackToQueueItem>>[];
      if (!items.length) return toast('Nothing to play.');
      void usePlayer.getState().playQueue(items, 0);
      toast(`Now playing: ${r.label}`);
    } catch {
      toast('Could not start the radio.');
    }
  };

  return (
    <div className="page">
      <div className="detail-head" {...headProps}>
        <div className="detail-art round">
          <Artwork src={artist.imageUrl} alt={`Photo of ${artist.name}`} />
        </div>
        <div className="detail-identity">
          <div className="detail-kind" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            Artist
            {artist.sourceType === 'original' ? <OriginalBadge /> : <SourceChip sourceType={artist.sourceType} />}
          </div>
          <h1 className="detail-title">{artist.name}</h1>
          <div className="detail-meta">
            {artist.location}
            {artist.genres?.length ? <> · {artist.genres.map((g) => g.name).join(', ')}</> : null}
          </div>
          <div className="detail-actions">
            <button className="btn primary" onClick={playAll}>
              <IconPlay width={15} height={15} /> Play popular
            </button>
            <button className="btn" onClick={() => void startRadio()}>
              <IconWave width={15} height={15} /> Artist radio
            </button>
            {artist.links?.map((l) => (
              <a key={l.url + l.label} className="btn small" href={l.url} target="_blank" rel="noreferrer">
                <IconExternal width={13} height={13} /> {l.label}
              </a>
            ))}
            <ContextMenuButton target={target} className="icon-btn" />
          </div>
          {(artist.links?.some((l) => ['kofi', 'patreon', 'bandcamp'].includes(l.provider ?? l.kind ?? ''))) && (
            <p style={{ fontSize: 12.5, color: 'var(--ink-faint)', marginTop: 10 }}>
              Like what you hear? Support {artist.name} directly through the links above.
            </p>
          )}
        </div>
      </div>

      {artist.bio && <Blurb text={artist.bio} />}

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
            {albums.map((al) => <ReleaseCard key={al.id} album={al} artist={artist} />)}
          </div>
        </>
      )}
    </div>
  );
}
