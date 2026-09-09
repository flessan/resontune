import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '@/components/AppLink';
import { DUR, PLAYER_ART, PLAYER_TITLE, prefersReducedMotion, shouldViewTransition, withViewTransition } from '@/lib/motion';
import { usePlayer } from './store';
import { engine } from './engine';
import { SeekBar } from './SeekBar';
import { QueueRow } from './QueueRow';
import { api } from '@/lib/api';
import { Artwork } from '@/components/Artwork';
import { SourceChip, provenanceLabel } from '@/components/Provenance';
import { useSettings } from '@/stores/settings';
import { VisualizerRunner, listModes } from '@/visualizer/engine';
import '@/visualizer/modes';
import { extractAccent, loadImage } from '@/lib/artworkColor';
import { isCustomThemeActive, readThemeVizPalette } from '@/theme/theme';
import { useLyrics } from '@/lyrics/useLyrics';
import { LyricsView } from '@/lyrics/LyricsView';
import type { Track } from '@/lib/types';
import { formatDuration } from '@/lib/format';
import {
  IconPlay, IconPause, IconPrev, IconNext, IconShuffle, IconRepeat, IconRepeatOne,
  IconClose, IconWave,
} from '@/components/Icons';

type Tab = 'queue' | 'lyrics' | 'about';

/**
 * Ambient visualizer layer for the expanded player. Not a panel - a
 * full-width canvas that lives on the sheet surface itself, behind the
 * controls, fading upward so the music's motion feels like part of the
 * room rather than a component. Same engine and mode registry as the
 * immersive view; the color language comes from the active theme.
 */
function AmbientVisualizer({ item }: { item: { artworkUrl: string | null; title: string; artistName: string; queueId: string } }) {
  const modeId = useSettings((s) => s.visualizerMode);
  const vSettings = useSettings((s) => s.visualizer);
  const theme = useSettings((s) => s.theme);
  const customPalette = useSettings((s) => s.customPalette);
  const playing = usePlayer((s) => s.playing);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runnerRef = useRef<VisualizerRunner | null>(null);

  const modes = listModes();
  const mode = modes.find((m) => m.id === modeId) ?? modes[0];

  useEffect(() => {
    if (!canvasRef.current) return;
    engine.ensureAnalysis();
    const runner = new VisualizerRunner(canvasRef.current, mode, vSettings, () => engine.readFrame());
    runner.setPalette(readThemeVizPalette());
    runnerRef.current = runner;
    runner.start();
    return () => runner.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { runnerRef.current?.setMode(mode); }, [mode]);
  useEffect(() => { runnerRef.current?.setSettings(vSettings); }, [vSettings]);
  useEffect(() => { runnerRef.current?.setPaused(!playing); }, [playing]);

  /* The theme is the visualizer's identity: re-read the derived tokens
     whenever the theme or the custom palette changes. */
  useEffect(() => {
    runnerRef.current?.setPalette(readThemeVizPalette());
  }, [theme, customPalette]);

  useEffect(() => {
    if (item.artworkUrl) {
      // On built-in themes the accent quietly follows the record; a custom
      // theme is the user's identity, so their primary wins.
      if (!isCustomThemeActive()) {
        void extractAccent(item.artworkUrl).then((hex) => { if (hex && !isCustomThemeActive()) runnerRef.current?.setAccent(hex); });
      }
      void loadImage(item.artworkUrl)
        .then((img) => runnerRef.current?.setArtwork(img))
        .catch(() => runnerRef.current?.setArtwork(null));
    } else {
      runnerRef.current?.setArtwork(null);
    }
  }, [item.queueId, item.artworkUrl, item.title, item.artistName]);

  return <canvas ref={canvasRef} className="ps-ambient" aria-hidden="true" />;
}

/**
 * Contextual visualizer control - a small popover off the player controls.
 * Style + on/off only: the user picks a look, the theme picks the colors,
 * and the engine handles everything technical.
 */
function VisualizerControl() {
  const modeId = useSettings((s) => s.visualizerMode);
  const enabled = useSettings((s) => s.visualizerEnabled);
  const { setVisualizerMode, setVisualizerEnabled } = useSettings.getState();
  const [open, setOpen] = useState(false);
  const modes = listModes();

  return (
    <div style={{ position: 'relative' }}>
      <button
        className={`icon-btn ${open ? 'active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-label="Visualizer"
        aria-expanded={open}
      >
        <IconWave width={17} height={17} />
      </button>
      {open && (
        <div className="ps-vis-pop" role="group" aria-label="Visualizer">
          <div className="pill-row" role="radiogroup" aria-label="Visualizer style">
            <button
              type="button"
              role="radio"
              aria-checked={!enabled}
              className={`pill ${!enabled ? 'active' : ''}`}
              onClick={() => setVisualizerEnabled(false)}
            >
              Off
            </button>
            {modes.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={enabled && modeId === m.id}
                className={`pill ${enabled && modeId === m.id ? 'active' : ''}`}
                title={m.description}
                onClick={() => { setVisualizerEnabled(true); setVisualizerMode(m.id); }}
              >
                {m.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ExpandedPlayer() {
  const visualizerEnabled = useSettings((s) => s.visualizerEnabled);
  const item = usePlayer((s) => s.queue[s.index] ?? null);
  const queue = usePlayer((s) => s.queue);
  const index = usePlayer((s) => s.index);
  const playing = usePlayer((s) => s.playing);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const rate = usePlayer((s) => s.rate);
  const { toggle, next, prev, toggleShuffle, cycleRepeat, setView, jumpTo, removeFromQueue, setRate } = usePlayer.getState();

  const [tab, setTab] = useState<Tab>('queue');
  const [removing, setRemoving] = useState<string | null>(null);

  // Lyrics: LRCLIB (or a personal local edit) via the client-side
  // resolver - never the ResonTune database. Follows the queue item.
  const lyricsRef = useMemo(
    () => (item ? {
      origin: item.origin,
      id: item.id,
      title: item.title,
      artistName: item.artistName,
      albumTitle: item.albumTitle ?? null,
      duration: item.duration ?? null,
    } : null),
    [item?.origin, item?.id, item?.title, item?.artistName, item?.albumTitle, item?.duration],
  );
  const lyr = useLyrics(lyricsRef);

  /* Soft-collapse a queue row, then actually remove it. */
  const removeQueued = (queueId: string) => {
    if (removing) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { removeFromQueue(queueId); return; }
    setRemoving(queueId);
    window.setTimeout(() => {
      removeFromQueue(queueId);
      setRemoving(null);
    }, 180);
  };
  const [detail, setDetail] = useState<Track | null>(null);
  const [closing, setClosing] = useState(false);

  /* Close by morphing back into the mini player when View Transitions
     are available; otherwise play the sheet's CSS return, then unmount.
     Playback is never touched. */
  const close = () => {
    if (closing) return;
    if (prefersReducedMotion()) { setView('compact'); return; }
    if (shouldViewTransition()) {
      withViewTransition(() => setView('compact'), 'player-collapse');
      return;
    }
    setClosing(true);
    window.setTimeout(() => setView('compact'), DUR.quick + 60);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closing]);

  useEffect(() => {
    setDetail(null);
    if (item?.origin === 'remote' && item.trackSlug) {
      api.get<{ track: Track }>(`/tracks/${item.trackSlug}`)
        .then((r) => setDetail(r.track))
        .catch(() => { });
    }
  }, [item?.queueId, item?.origin, item?.trackSlug]);

  /* Barely-perceptible audio-responsive breath on the artwork. Direct DOM
     transform in its own rAF loop - no React state per frame. Skipped
     entirely under prefers-reduced-motion. */
  const artRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf: number;
    let level = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const frame = engine.readFrame();
      const target = frame ? frame.bass : 0;
      level += (target - level) * 0.12;
      if (artRef.current) {
        artRef.current.style.transform = `scale(${1 + level * 0.008})`;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (!item) return null;

  return (
    <div className={`player-sheet ${closing ? 'closing' : ''}`} role="dialog" aria-modal="true" aria-label="Now playing">
      <div className="ps-backdrop" aria-hidden>
        {item.artworkUrl && <img src={item.artworkUrl} alt="" />}
      </div>

      {/* Ambient audio-reactive layer: spans the lower half of the sheet,
          fades upward, sits behind everything interactive. */}
      {visualizerEnabled && <AmbientVisualizer item={item} />}

      <div className="ps-topbar">
        <button className="icon-btn" onClick={close} aria-label="Close expanded player">
          <IconClose />
        </button>
        <span style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
          Now playing {item.origin === 'local' ? '· local file' : ''}
        </span>
        <button className="icon-btn" onClick={() => withViewTransition(() => setView('immersive'), 'fade')} aria-label="Full screen">
          <IconWave />
        </button>
      </div>

      <div className="ps-body">
        <div className="ps-left">
          {/* keyed on the queue item so track changes crossfade the artwork */}
          <div className="ps-art" ref={artRef} key={item.queueId} style={{ viewTransitionName: PLAYER_ART }}>
            <Artwork src={item.artworkUrl} alt={`Artwork for ${item.title}`} />
          </div>
          <div className="ps-titleblock">
            <h2 className="ps-track-title" style={{ viewTransitionName: PLAYER_TITLE }}>{item.title}</h2>
            <p className="ps-track-artist">
              {item.origin === 'remote' && item.artistSlug ? (
                <Link to={`/artist/${item.artistSlug}`} onClick={() => withViewTransition(() => setView('compact'), 'player-collapse')}>
                  {item.artistName}
                </Link>
              ) : (
                item.artistName
              )}
              {item.albumTitle ? <> - {item.albumTitle}</> : null}
            </p>
          </div>
        </div>

        <div className="ps-right">
          <div className="ps-tabs" role="tablist">
            {(['queue', 'lyrics', 'about'] as Tab[]).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                className={tab === t ? 'active' : ''}
                onClick={() => setTab(t)}
              >
                {t === 'queue' ? `Queue (${queue.length})` : t === 'lyrics' ? 'Lyrics' : 'About'}
              </button>
            ))}
          </div>

          <div className="ps-panel">
            {tab === 'queue' && (
              <div>
                {queue.map((q, i) => (
                  <QueueRow
                    key={q.queueId}
                    item={q}
                    index={i}
                    current={i === index}
                    removing={removing === q.queueId}
                    onPlay={() => void jumpTo(i)}
                    onRemove={() => removeQueued(q.queueId)}
                  />
                ))}
              </div>
            )}

            {tab === 'lyrics' && (
              lyr.lyrics ? (
                <LyricsView
                  lyrics={lyr.lyrics}
                  isLocalEdit={lyr.isLocalEdit}
                  followPlayback
                  onSeek={(s) => usePlayer.getState().seekTo(s)}
                  onSave={lyr.save}
                  onReset={lyr.reset}
                  compact
                />
              ) : (
                <div className="empty" style={{ marginTop: 12 }}>
                  <h3>{lyr.loading ? 'Looking for lyrics\u2026' : 'No lyrics'}</h3>
                  {!lyr.loading && <p>No lyrics were found for this track on LRCLIB.</p>}
                </div>
              )
            )}

            {tab === 'about' && (
              <div style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--ink-soft)' }}>
                {item.origin === 'local' ? (
                  <>
                    <p><strong>Local file.</strong> This track lives on your device and never leaves it.</p>
                    <p style={{ color: 'var(--ink-muted)' }}>{item.albumTitle ?? 'No album metadata.'}</p>
                  </>
                ) : detail ? (
                  <>
                    <p style={{ fontSize: 12.5, color: 'var(--ink-muted)' }}>
                      {provenanceLabel(detail.sourceType)}
                    </p>
                    {detail.description && <p>{detail.description}</p>}
                    {detail.credits && <p style={{ color: 'var(--ink-muted)' }}>{detail.credits}</p>}
                    {detail.license && (
                      <p>
                        License:{' '}
                        {detail.license.url ? (
                          <a href={detail.license.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
                            {detail.license.name}
                          </a>
                        ) : (
                          detail.license.name
                        )}
                      </p>
                    )}
                    {detail.rightsHolder && (
                      <p style={{ fontSize: 12.5, color: 'var(--ink-faint)' }}>Rights holder: {detail.rightsHolder}</p>
                    )}
                    <p style={{ marginTop: 16 }}>
                      <Link to={`/track/${detail.slug}`} onClick={() => setView('compact')} className="btn small">
                        Open track page
                      </Link>
                    </p>
                  </>
                ) : (
                  <p style={{ color: 'var(--ink-muted)' }}>Loading…</p>
                )}
                <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <label htmlFor="rate" style={{ fontSize: 12.5, color: 'var(--ink-muted)' }}>Playback speed</label>
                  <select
                    id="rate"
                    value={rate}
                    onChange={(e) => setRate(Number(e.target.value))}
                    className="ps-vis-select"
                    style={{ width: 'auto', padding: '5px 10px' }}
                  >
                    {[0.75, 0.9, 1, 1.1, 1.25, 1.5].map((r) => (
                      <option key={r} value={r}>{r}×</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="ps-controls-zone">
        <SeekBar />
        <div className="ps-main-controls">
          <button className={`icon-btn ${shuffle ? 'active' : ''}`} onClick={toggleShuffle} aria-label="Shuffle" aria-pressed={shuffle}>
            <IconShuffle />
          </button>
          <button className="icon-btn" onClick={() => void prev()} aria-label="Previous">
            <IconPrev width={22} height={22} />
          </button>
          <button className="ps-play" onClick={() => void toggle()} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? <IconPause width={24} height={24} /> : <IconPlay width={24} height={24} />}
          </button>
          <button className="icon-btn" onClick={() => void next()} aria-label="Next">
            <IconNext width={22} height={22} />
          </button>
          <button className={`icon-btn ${repeat !== 'off' ? 'active' : ''}`} onClick={cycleRepeat} aria-label={`Repeat: ${repeat}`}>
            {repeat === 'one' ? <IconRepeatOne /> : <IconRepeat />}
          </button>
          <VisualizerControl />
        </div>
      </div>
    </div>
  );
}
