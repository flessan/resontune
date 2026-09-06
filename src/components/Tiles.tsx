import { Link } from 'react-router-dom';
import type { Track, Album, Artist, Playlist, Collection } from '@/lib/types';
import { OriginalBadge } from './Provenance';
import { usePlayer } from '@/player/store';
import { trackToQueueItem } from '@/providers';
import { Artwork } from './Artwork';
import { IconPlay } from './Icons';
import { toast } from '@/stores/toast';
import { api } from '@/lib/api';

export function TrackTile({ track, context }: { track: Track; context?: Track[] }) {
  const play = (e: React.MouseEvent) => {
    e.preventDefault();
    const list = context ?? [track];
    const items = list.map(trackToQueueItem).filter(Boolean) as NonNullable<ReturnType<typeof trackToQueueItem>>[];
    const start = items.findIndex((i) => i.id === track.id);
    if (start === -1) return toast('No playable source.');
    void usePlayer.getState().playQueue(items, start);
  };
  return (
    <Link to={`/track/${track.slug}`} className="tile">
      <div className="tile-art">
        <Artwork src={track.artworkUrl} alt="" />
        <button className="tile-play" onClick={play} aria-label={`Play ${track.title}`}>
          <IconPlay width={17} height={17} />
        </button>
      </div>
      <div className="tile-title">{track.title}</div>
      <div className="tile-sub">{track.artist.name}</div>
    </Link>
  );
}

export function AlbumTile({ album }: { album: Album }) {
  return (
    <Link to={`/release/${album.slug}`} className="tile">
      <div className="tile-art">
        <Artwork src={album.artworkUrl} alt="" />
      </div>
      <div className="tile-title">{album.title}</div>
      <div className="tile-sub">
        {album.artist.name} · {album.type.toUpperCase()}
      </div>
      {album.sourceType === 'original' && <div style={{ marginTop: 2 }}><OriginalBadge compact /></div>}
    </Link>
  );
}

export function CollectionTile({ collection }: { collection: Collection }) {
  return (
    <Link to={`/collection/${collection.slug}`} className="collection-tile">
      <div className="collection-art">
        <Artwork src={collection.artworkUrl} alt="" />
      </div>
      <div>
        <div className="tile-title">{collection.title}</div>
        <div className="tile-sub">
          {collection.itemCount} items · {collection.curatorName}
        </div>
      </div>
    </Link>
  );
}

export function ArtistTile({ artist }: { artist: Artist }) {
  return (
    <Link to={`/artist/${artist.slug}`} className="tile artist-tile">
      <div className="tile-art">
        <Artwork src={artist.imageUrl} alt="" />
      </div>
      <div className="tile-title" style={{ textAlign: 'center' }}>{artist.name}</div>
      <div className="tile-sub" style={{ textAlign: 'center' }}>
        {artist.location ?? 'Artist'}
      </div>
    </Link>
  );
}

export function PlaylistTile({ playlist }: { playlist: Playlist }) {
  const playAll = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      const r = await api.get<{ tracks: Track[] }>(`/playlists/${playlist.slug}`);
      const items = r.tracks.map(trackToQueueItem).filter(Boolean) as NonNullable<ReturnType<typeof trackToQueueItem>>[];
      if (!items.length) return toast('This playlist has no playable tracks.');
      void usePlayer.getState().playQueue(items, 0);
    } catch {
      toast('Could not load playlist.');
    }
  };
  return (
    <Link to={`/playlist/${playlist.slug}`} className="tile">
      <div className="tile-art" style={{ display: 'grid', placeItems: 'center', background: 'var(--accent-soft)' }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 34, fontStyle: 'italic', color: 'var(--accent)', padding: '0 14px', textAlign: 'center', lineHeight: 1.2 }}>
          {playlist.title}
        </span>
        <button className="tile-play" onClick={playAll} aria-label={`Play ${playlist.title}`}>
          <IconPlay width={17} height={17} />
        </button>
      </div>
      <div className="tile-title">{playlist.title}</div>
      <div className="tile-sub">
        {playlist.trackCount} tracks{playlist.isCurated ? ' · Editorial' : playlist.ownerHandle ? ` · by ${playlist.ownerHandle}` : ''}
      </div>
    </Link>
  );
}
