import { memo, useEffect, useState } from 'react';
import type { LocalTrack } from '@/lib/types';
import { usePlayer } from '@/player/store';
import { localTrackToQueueItem, resolveLocalArtworkUrl } from '@/providers';
import { updateLocalTrack, deleteLocalTrack } from '@/local/db';
import { formatDuration } from '@/lib/format';
import { toast } from '@/stores/toast';
import { IconPlay, IconPause, IconHeart, IconTrash, IconQueue } from './Icons';

interface Props {
  track: LocalTrack;
  index?: number;
  context?: LocalTrack[];
  onChanged?: () => void;
}

export const LocalTrackRow = memo(function LocalTrackRow({ track, index, context, onChanged }: Props) {
  const currentId = usePlayer((s) => (s.queue[s.index]?.origin === 'local' ? s.queue[s.index]?.id : null));
  const playing = usePlayer((s) => s.playing);
  const [art, setArt] = useState<string | null>(null);
  const [fav, setFav] = useState(track.favorite);

  useEffect(() => {
    if (track.hasArtwork) {
      void resolveLocalArtworkUrl(track.id).then(setArt);
    }
  }, [track.id, track.hasArtwork]);

  const isCurrent = currentId === track.id;

  const handlePlay = async () => {
    if (isCurrent) return void usePlayer.getState().toggle();
    const list = context ?? [track];
    const items = await Promise.all(
      list.map(async (t) => localTrackToQueueItem(t, t.hasArtwork ? await resolveLocalArtworkUrl(t.id) : null)),
    );
    const start = list.findIndex((t) => t.id === track.id);
    void usePlayer.getState().playQueue(items, Math.max(0, start));
  };

  const handleFav = async () => {
    const next = { ...track, favorite: !fav };
    await updateLocalTrack(next);
    setFav(!fav);
    onChanged?.();
  };

  const handleDelete = async () => {
    if (!window.confirm(`Remove “${track.title}” from your local library? The original file on disk is not affected.`)) return;
    await deleteLocalTrack(track.id);
    toast('Removed from local library');
    onChanged?.();
  };

  const handleQueue = async () => {
    const item = localTrackToQueueItem(track, track.hasArtwork ? await resolveLocalArtworkUrl(track.id) : null);
    usePlayer.getState().playNext(item);
    toast('Playing next');
  };

  return (
    <div
      className={`track-row ${isCurrent ? 'playing' : ''}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button, a')) return;
        void handlePlay();
      }}
    >
      <div className="idx">
        <span>{index != null ? index + 1 : ''}</span>
        <button className="row-play" onClick={() => void handlePlay()} aria-label={isCurrent && playing ? `Pause ${track.title}` : `Play ${track.title}`}>
          {isCurrent && playing ? <IconPause width={15} height={15} /> : <IconPlay width={15} height={15} />}
        </button>
      </div>
      <div className="art">
        {art ? <img src={art} alt="" /> : <div className="art-fallback" style={{ fontSize: 18 }}>♪</div>}
      </div>
      <div className="meta">
        <div className="t-title">
          {track.title}
          <span className="source-chip local">Local</span>
        </div>
        <div className="t-sub">{track.artist}{track.album ? ` · ${track.album}` : ''}</div>
      </div>
      <div className="actions">
        <button className={`icon-btn ${fav ? 'active' : ''}`} onClick={() => void handleFav()} aria-label={fav ? 'Unfavorite' : 'Favorite'}>
          <IconHeart width={16} height={16} filled={fav} />
        </button>
        <button className="icon-btn" onClick={() => void handleQueue()} aria-label="Play next">
          <IconQueue width={16} height={16} />
        </button>
        <button className="icon-btn" onClick={() => void handleDelete()} aria-label="Remove from library">
          <IconTrash width={16} height={16} />
        </button>
      </div>
      <div className="dur">{formatDuration(track.duration)}</div>
    </div>
  );
});
