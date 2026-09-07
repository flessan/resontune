import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useFetch } from '@/lib/useFetch';
import type { Album, Track } from '@/lib/types';
import { TrackRow } from '@/components/TrackRow';
import { Blurb } from '@/components/Blurb';
import { Artwork } from '@/components/Artwork';
import { usePlayer } from '@/player/store';
import { trackToQueueItem } from '@/providers';
import { formatDate } from '@/lib/format';
import { IconPlay } from '@/components/Icons';
import { OriginalBadge, SourceChip } from '@/components/Provenance';
import { ContextMenuButton } from '@/contextmenu/ContextMenuButton';
import { useContextTarget } from '@/contextmenu/useContextTarget';
import { releaseRef, type ContextTarget } from '@/contextmenu/types';

interface Data { album: Album; tracks: Track[] }

export default function AlbumPage() {
  const { slug } = useParams();
  const { data, loading, error } = useFetch<Data>(`/albums/${slug}`, [slug]);
  const loaded = data?.album ?? null;
  const target = useMemo<ContextTarget | null>(
    () => (loaded ? { type: 'release', release: releaseRef(loaded) } : null),
    [loaded],
  );
  const headProps = useContextTarget(target);

  if (loading) return <div className="loading-page"><span className="spin" /></div>;
  if (error || !data) {
    return (
      <div className="page">
        <div className="empty">
          <h3>This release isn't available</h3>
          <p>{error ?? 'It may have been unpublished or removed.'} Browse <Link to="/originals">Originals</Link> or <Link to="/community">Community</Link> instead.</p>
        </div>
      </div>
    );
  }

  const { album, tracks } = data;

  const playAll = () => {
    const items = tracks.map(trackToQueueItem).filter(Boolean) as NonNullable<ReturnType<typeof trackToQueueItem>>[];
    if (items.length) void usePlayer.getState().playQueue(items, 0);
  };

  return (
    <div className="page">
      <div className="detail-head" {...headProps}>
        <div className="detail-art">
          <Artwork src={album.artworkUrl} alt={`Cover of ${album.title}`} />
        </div>
        <div className="detail-identity">
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
            <ContextMenuButton target={target} className="icon-btn" />
          </div>
        </div>
      </div>

      {album.description && <Blurb text={album.description} style={{ marginBottom: 24 }} />}

      <div className="tracklist">
        {tracks.map((t, i) => <TrackRow key={t.id} track={t} index={i} context={tracks} showAlbum={false} />)}
      </div>

      <ReleaseNotes album={album} tracks={tracks} />
    </div>
  );
}

/**
 * Catalog-style release footer: rights, license and credits, stated plainly.
 * Values come from the catalog records - nothing is inferred or invented.
 */
function ReleaseNotes({ album, tracks }: { album: Album; tracks: Track[] }) {
  const totalSecs = tracks.reduce((s, t) => s + (t.duration ?? 0), 0);
  const licenses = [...new Map(
    tracks.filter((t) => t.license).map((t) => [t.license!.id, t.license!]),
  ).values()];
  const rightsHolders = [...new Set(tracks.map((t) => t.rightsHolder).filter(Boolean))] as string[];
  const credits = [...new Set(tracks.map((t) => t.credits).filter(Boolean))] as string[];

  if (!licenses.length && !rightsHolders.length && !credits.length && !totalSecs) return null;

  return (
    <div className="release-notes">
      {totalSecs > 0 && (
        <p>{tracks.length} tracks · {Math.round(totalSecs / 60)} minutes{album.releasedOn ? ` · released ${formatDate(album.releasedOn)}` : ''}</p>
      )}
      {rightsHolders.length > 0 && <p>℗ {rightsHolders.join(' · ')}</p>}
      {credits.length > 0 && credits.map((c) => <p key={c}>{c}</p>)}
      {licenses.length > 0 && (
        <p>
          Licensed under{' '}
          {licenses.map((l, i) => (
            <span key={l.id}>
              {i > 0 && ', '}
              {l.url ? <a href={l.url} target="_blank" rel="noreferrer">{l.name}</a> : l.name}
            </span>
          ))}
          {licenses.some((l) => l.requiresAttribution) && ' - attribution required when sharing'}
        </p>
      )}
    </div>
  );
}
