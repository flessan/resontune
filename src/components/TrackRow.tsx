import { Link } from 'react-router-dom';
import { memo, useMemo } from 'react';
import type { Track } from '@/lib/types';
import { usePlayer } from '@/player/store';
import { useAuth } from '@/stores/auth';
import { trackToQueueItem } from '@/providers';
import { formatDuration } from '@/lib/format';
import { toast } from '@/stores/toast';
import { Artwork } from './Artwork';
import { SourceChip } from './Provenance';
import { IconPlay, IconPause, IconHeart } from './Icons';
import { ContextMenuButton } from '@/contextmenu/ContextMenuButton';
import { useContextTarget } from '@/contextmenu/useContextTarget';
import type { ContextTarget } from '@/contextmenu/types';

interface Props {
  track: Track;
  index?: number;
  /** full list used to build the queue when this row is played */
  context?: Track[];
  showArt?: boolean;
  /** Release pages repeat their own title on every row; they turn it off. */
  showAlbum?: boolean;
  /** Set when this row is inside a playlist, to offer "Remove from this playlist". */
  playlist?: { id: string; title: string; owned: boolean };
  /** Called after a contextual action mutates the list this row belongs to. */
  onChanged?: () => void;
}

export const TrackRow = memo(function TrackRow({ track, index, context, showArt = true, showAlbum = true, playlist, onChanged }: Props) {
  const currentId = usePlayer((s) => (s.queue[s.index]?.origin === 'remote' ? s.queue[s.index]?.id : null));
  const playing = usePlayer((s) => s.playing);
  const { playQueue, toggle } = usePlayer.getState();
  const user = useAuth((s) => s.user);
  const isFav = useAuth((s) => s.favoriteIds.has(track.id));

  // One target description drives right-click, the ⋮ button and long-press.
  const target = useMemo<ContextTarget>(
    () => ({ type: 'track', track, context, playlist, onChanged }),
    [track, context, playlist, onChanged],
  );
  const ctxProps = useContextTarget(target);

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

  return (
    <div
      className={`track-row ${isCurrent ? 'playing' : ''}`}
      {...ctxProps}
      onClick={(e) => {
        // Primary row area plays the track; links and buttons keep their jobs.
        if ((e.target as HTMLElement).closest('button, a')) return;
        handlePlay();
      }}
    >
      <div className="idx">
        {isCurrent && playing ? (
          <span className="eq" aria-hidden><i /><i /><i /></span>
        ) : (
          <span>{index != null ? index + 1 : ''}</span>
        )}
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
          {/* On touch the index column is gone, so the artwork carries the
              "this is the one playing" tell. */}
          {isCurrent && (
            <span className="art-state" aria-hidden>
              {playing ? <span className="eq"><i /><i /><i /></span> : <IconPlay width={16} height={16} />}
            </span>
          )}
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
          {showAlbum && track.album?.title ? <> · {track.album.title}</> : null}
        </div>
      </div>
      <div className="actions">
        <button className={`icon-btn fav-btn ${isFav ? 'active' : ''}`} onClick={handleFav} aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}>
          <IconHeart width={16} height={16} filled={isFav} />
        </button>
        <ContextMenuButton target={target} className="icon-btn" />
      </div>
      <div className="dur">{formatDuration(track.duration)}</div>
    </div>
  );
});
