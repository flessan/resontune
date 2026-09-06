import { Link } from 'react-router-dom';
import { memo, useState } from 'react';
import type { Track } from '@/lib/types';
import { usePlayer } from '@/player/store';
import { useAuth } from '@/stores/auth';
import { trackToQueueItem } from '@/providers';
import { formatDuration } from '@/lib/format';
import { toast } from '@/stores/toast';
import { Artwork } from './Artwork';
import { AddToPlaylistDialog } from './AddToPlaylistDialog';
import { SourceChip } from './Provenance';
import {
  IconPlay, IconPause, IconHeart, IconPlus, IconQueue,
} from './Icons';

interface Props {
  track: Track;
  index?: number;
  /** full list used to build the queue when this row is played */
  context?: Track[];
  showArt?: boolean;
}

export const TrackRow = memo(function TrackRow({ track, index, context, showArt = true }: Props) {
  const currentId = usePlayer((s) => (s.queue[s.index]?.origin === 'remote' ? s.queue[s.index]?.id : null));
  const playing = usePlayer((s) => s.playing);
  const { playQueue, toggle, playNext } = usePlayer.getState();
  const user = useAuth((s) => s.user);
  const isFav = useAuth((s) => s.favoriteIds.has(track.id));
  const [showAdd, setShowAdd] = useState(false);

  const isCurrent = currentId === track.id;

  const handlePlay = () => {
    if (isCurrent) {
      void toggle();
      return;
    }
    const list = context ?? [track];
    const items = list.map(trackToQueueItem).filter(Boolean) as NonNullable<ReturnType<typeof trackToQueueItem>>[];
    const start = items.findIndex((i) => i.id === track.id);
    if (start === -1 || !items.length) {
      toast('This track has no playable source.');
      return;
    }
    void playQueue(items, start);
  };

  const handleFav = async () => {
    if (!user) {
      toast('Sign in to save favorites.');
      return;
    }
    const fav = await useAuth.getState().toggleFavorite(track.id);
    toast(fav ? 'Added to favorites' : 'Removed from favorites');
  };

  const handleQueue = () => {
    const item = trackToQueueItem(track);
    if (!item) return toast('This track has no playable source.');
    playNext(item);
    toast('Playing next');
  };

  return (
    <div
      className={`track-row ${isCurrent ? 'playing' : ''}`}
      onClick={(e) => {
        // Primary row area plays the track; links and buttons keep their jobs.
        if ((e.target as HTMLElement).closest('button, a')) return;
        handlePlay();
      }}
    >
      <div className="idx">
        <span>{index != null ? index + 1 : ''}</span>
        <button
          className="row-play"
          onClick={handlePlay}
          aria-label={isCurrent && playing ? `Pause ${track.title}` : `Play ${track.title}`}
        >
          {isCurrent && playing ? <IconPause width={15} height={15} /> : <IconPlay width={15} height={15} />}
        </button>
      </div>
      {showArt ? (
        <div className="art">
          <Artwork src={track.artworkUrl} alt="" />
        </div>
      ) : (
        <div />
      )}
      <div className="meta">
        <div className="t-title">
          <Link to={`/track/${track.slug}`}>{track.title}</Link>
          {' '}
          <SourceChip sourceType={track.sourceType} />
        </div>
        <div className="t-sub">
          <Link to={`/artist/${track.artist.slug}`}>{track.artist.name}</Link>
          {track.album?.title ? <> · {track.album.title}</> : null}
        </div>
      </div>
      <div className="actions">
        <button className={`icon-btn ${isFav ? 'active' : ''}`} onClick={handleFav} aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}>
          <IconHeart width={16} height={16} filled={isFav} />
        </button>
        <button className="icon-btn" onClick={handleQueue} aria-label="Play next">
          <IconQueue width={16} height={16} />
        </button>
        <button className="icon-btn" onClick={() => setShowAdd(true)} aria-label="Add to playlist">
          <IconPlus width={16} height={16} />
        </button>
      </div>
      <div className="dur">{formatDuration(track.duration)}</div>
      {showAdd && <AddToPlaylistDialog trackId={track.id} onClose={() => setShowAdd(false)} />}
    </div>
  );
});
