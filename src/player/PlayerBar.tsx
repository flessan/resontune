import { useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { usePlayer } from './store';
import { engine } from './engine';
import { SeekBar } from './SeekBar';
import { Artwork } from '@/components/Artwork';
import { SourceChip } from '@/components/Provenance';
import { MiniSpectrum } from './MiniSpectrum';
import { ContextMenuButton } from '@/contextmenu/ContextMenuButton';
import { useContextTarget } from '@/contextmenu/useContextTarget';
import type { ContextTarget } from '@/contextmenu/types';
import { extractAccent, applyAccent } from '@/lib/artworkColor';
import {
  IconPlay, IconPause, IconPrev, IconNext, IconShuffle, IconRepeat,
  IconRepeatOne, IconVolume, IconMute, IconExpand, IconWave, IconQueue,
} from '@/components/Icons';

export function PlayerBar() {
  const item = usePlayer((s) => s.queue[s.index] ?? null);
  const index = usePlayer((s) => s.index);
  const playing = usePlayer((s) => s.playing);
  const loading = usePlayer((s) => s.loading);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const error = usePlayer((s) => s.error);
  const externalLink = usePlayer((s) => s.externalLink);
  const { toggle, next, prev, toggleShuffle, cycleRepeat, setVolume, toggleMute, setView } = usePlayer.getState();

  const miniRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    return engine.onTime((t, d) => {
      if (miniRef.current && window.innerWidth <= 860) {
        miniRef.current.style.width = d > 0 ? `${(t / d) * 100}%` : '0%';
      }
    });
  }, []);

  /* The whole interface quietly follows the playing record: extract a
     tasteful accent from the current artwork and let CSS pick it up. */
  useEffect(() => {
    let alive = true;
    if (item?.artworkUrl) {
      void extractAccent(item.artworkUrl).then((hex) => { if (alive) applyAccent(hex); });
    } else {
      applyAccent(null);
    }
    return () => { alive = false; };
  }, [item?.queueId, item?.artworkUrl]);

  const openExpanded = () => setView('expanded');

  /* The bar acts on the playing queue entry, so its menu is the queue menu. */
  const nowTarget = useMemo<ContextTarget | null>(
    () => (item ? { type: 'queue-item', item, index } : null),
    [item, index],
  );
  const ctxProps = useContextTarget(nowTarget);

  return (
    <div
      /* The bar is hidden while nothing is queued and *transitions* in when
         the first track arrives (and back out when the queue empties).
         One persistent element — never remounted, so enter and exit both
         actually play and track changes never re-animate the bar. */
      className={`player-bar ${item ? 'has-item' : ''}`}
      role="region"
      aria-label="Player"
      onClick={(e) => {
        // On mobile, tapping the bar (not a control) opens the expanded player.
        if (window.innerWidth <= 860 && (e.target as HTMLElement).closest('button') == null) {
          openExpanded();
        }
      }}
    >
      <div className="pb-miniprogress" ref={miniRef} style={{ width: 0 }} aria-hidden />
      <div className="pb-now" key={item?.queueId ?? 'idle'} {...ctxProps}>
        {item ? (
          <>
            <button className="pb-art" onClick={openExpanded} aria-label="Open player" style={{ padding: 0, border: 'none' }}>
              <Artwork src={item.artworkUrl} alt="" />
            </button>
            <div className="pb-meta">
              <div className="pb-title">
                {item.origin === 'remote' && item.trackSlug ? (
                  <Link to={`/track/${item.trackSlug}`} onClick={(e) => e.stopPropagation()}>{item.title}</Link>
                ) : (
                  item.title
                )}
                <SourceChip origin={item.origin} sourceType={item.sourceType} />
              </div>
              <div className="pb-sub">
                {error ? (
                  <span style={{ color: 'var(--ink-muted)' }}>
                    {error}
                    {externalLink && (
                      <>
                        {' '}
                        <a href={externalLink.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ textDecoration: 'underline' }}>
                          Listen on {externalLink.label}
                        </a>
                      </>
                    )}
                  </span>
                ) : item.origin === 'remote' && item.artistSlug ? (
                  <Link to={`/artist/${item.artistSlug}`} onClick={(e) => e.stopPropagation()}>{item.artistName}</Link>
                ) : (
                  item.artistName
                )}
              </div>
            </div>
            {/* The spectrum shares the row with the metadata — ambient, not boxed. */}
            <MiniSpectrum className="pb-spectrum" />
          </>
        ) : (
          <div className="pb-meta">
            <div className="pb-title" style={{ color: 'var(--ink-faint)' }}>
              {error ?? 'Nothing playing'}
            </div>
            <div className="pb-sub">Pick a track to start listening</div>
          </div>
        )}
      </div>

      <div className="pb-center">
        <div className="pb-controls">
          <button
            className={`icon-btn desktop-only ${shuffle ? 'active' : ''}`}
            onClick={toggleShuffle}
            aria-label="Shuffle"
            aria-pressed={shuffle}
          >
            <IconShuffle width={16} height={16} />
          </button>
          <button className="icon-btn" onClick={() => void prev()} aria-label="Previous track" disabled={!item}>
            <IconPrev width={18} height={18} />
          </button>
          <button className="pb-play" onClick={() => void toggle()} aria-label={playing ? 'Pause' : 'Play'} disabled={!item && !usePlayer.getState().queue.length}>
            {loading ? <span className="spin" style={{ borderTopColor: 'var(--bg)' }} /> : playing ? <IconPause width={17} height={17} /> : <IconPlay width={17} height={17} />}
          </button>
          <button className="icon-btn" onClick={() => void next()} aria-label="Next track" disabled={!item}>
            <IconNext width={18} height={18} />
          </button>
          <button
            className={`icon-btn desktop-only ${repeat !== 'off' ? 'active' : ''}`}
            onClick={cycleRepeat}
            aria-label={`Repeat: ${repeat}`}
          >
            {repeat === 'one' ? <IconRepeatOne width={16} height={16} /> : <IconRepeat width={16} height={16} />}
          </button>
        </div>
        <SeekBar />
      </div>

      <div className="pb-right">
        <button className="icon-btn desktop-only" onClick={openExpanded} aria-label="Open queue" disabled={!item}>
          <IconQueue width={17} height={17} />
        </button>
        <ContextMenuButton target={nowTarget} className="icon-btn" size={17} label="More actions for the playing track" />
        <button className="icon-btn desktop-only" onClick={() => setView('immersive')} aria-label="Full screen player" disabled={!item}>
          <IconWave width={17} height={17} />
        </button>
        <div className="vol-wrap desktop-only">
          <button className="icon-btn" onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'}>
            {muted || volume === 0 ? <IconMute width={16} height={16} /> : <IconVolume width={16} height={16} />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.02}
            value={muted ? 0 : volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            aria-label="Volume"
          />
        </div>
        <button className="icon-btn desktop-only" onClick={openExpanded} aria-label="Expand player" disabled={!item}>
          <IconExpand width={16} height={16} />
        </button>
      </div>
    </div>
  );
}
