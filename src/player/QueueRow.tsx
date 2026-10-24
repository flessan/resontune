/**
 * One row of the live queue.
 *
 * Clicking plays it, the ⋮ (or a right-click, or a long press) opens the
 * queue actions - move, remove, jump to artist. Everything goes through the
 * real player store; the menu never keeps a queue of its own.
 */
import { useMemo } from 'react';
import { Artwork } from '@/components/Artwork';
import { SourceChip } from '@/components/Provenance';
import { IconTrash } from '@/components/Icons';
import { ContextMenuButton } from '@/contextmenu/ContextMenuButton';
import { useContextTarget } from '@/contextmenu/useContextTarget';
import type { ContextTarget } from '@/contextmenu/types';
import { formatDuration } from '@/lib/format';
import type { QueueItem } from '@/lib/types';

interface Props {
  item: QueueItem;
  index: number;
  current: boolean;
  removing: boolean;
  onPlay: () => void;
  onRemove: () => void;
}

export function QueueRow({ item, index, current, removing, onPlay, onRemove }: Props) {
  const target = useMemo<ContextTarget>(() => ({ type: 'queue-item', item, index }), [item, index]);
  const ctxProps = useContextTarget(target);

  return (
    <div
      className={`queue-item-wrap ${removing ? 'removing' : ''}`}
      style={{ display: 'flex', alignItems: 'center', gap: 4 }}
      {...ctxProps}
    >
      <button className={`queue-row ${current ? 'current' : ''}`} onClick={onPlay}>
        <div className="q-art"><Artwork src={item.artworkUrl} alt="" /></div>
        <div className="q-meta">
          <div className="q-title">
            {item.title}
            <SourceChip origin={item.origin} sourceType={item.sourceType} />
          </div>
          <div className="q-sub">{item.artistName}</div>
        </div>
        <span style={{ fontSize: 11.5, color: 'var(--ink-faint)', fontVariantNumeric: 'tabular-nums' }}>
          {formatDuration(item.duration)}
        </span>
      </button>
      <ContextMenuButton target={target} className="icon-btn" size={16} />
      <button className="icon-btn" onClick={onRemove} aria-label={`Remove ${item.title} from queue`}>
        <IconTrash width={14} height={14} />
      </button>
    </div>
  );
}
