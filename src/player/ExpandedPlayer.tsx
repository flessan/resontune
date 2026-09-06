import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePlayer } from './store';
import { engine } from './engine';
import { SeekBar } from './SeekBar';
import { api } from '@/lib/api';
import { Artwork } from '@/components/Artwork';
import { SourceChip, provenanceLabel } from '@/components/Provenance';
import { useSettings } from '@/stores/settings';
import { VisualizerRunner, listModes } from '@/visualizer/engine';
import '@/visualizer/modes';
import { setTypographyText } from '@/visualizer/modes/typography';
import { extractAccent, loadImage } from '@/lib/artworkColor';
import type { Track } from '@/lib/types';
import { formatDuration } from '@/lib/format';
import {
  IconPlay, IconPause, IconPrev, IconNext, IconShuffle, IconRepeat, IconRepeatOne,
  IconClose, IconWave, IconTrash,
} from '@/components/Icons';

type Tab = 'queue' | 'lyrics' | 'about';

/**
 * Live visualizer strip inside the expanded player — the same engine and
 * mode registry as the immersive view, rendered into a wide panel under
 * the artwork, with a compact control surface (mode + three sliders).
 * Settings persist through the settings store (localStorage).
 */
function VisualizerStrip({ item }: { item: { artworkUrl: string | null; title: string; artistName: string; queueId: string } }) {
  const modeId = useSettings((s) => s.visualizerMode);
  const vSettings = useSettings((s) => s.visualizer);
  const { setVisualizerMode, updateVisualizer } = useSettings.getState();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runnerRef = useRef<VisualizerRunner | null>(null);
  const [showTuning, setShowTuning] = useState(false);

  const modes = listModes();
  const mode = modes.find((m) => m.id === modeId) ?? modes[0];

  useEffect(() => {
    if (!canvasRef.current) return;
    engine.ensureAnalysis();
    const runner = new VisualizerRunner(canvasRef.current, mode, vSettings, () => engine.readFrame());
    runnerRef.current = runner;
    runner.start();
    return () => runner.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { runnerRef.current?.setMode(mode); }, [mode]);
  useEffect(() => { runnerRef.current?.setSettings(vSettings); }, [vSettings]);

  useEffect(() => {
    setTypographyText(item.title, item.artistName);
    if (item.artworkUrl) {
      void extractAccent(item.artworkUrl).then((hex) => { if (hex) runnerRef.current?.setAccent(hex); });
      void loadImage(item.artworkUrl)
        .then((img) => runnerRef.current?.setArtwork(img))
        .catch(() => runnerRef.current?.setArtwork(null));
    } else {
      runnerRef.current?.setArtwork(null);
    }
  }, [item.queueId, item.artworkUrl, item.title, item.artistName]);

  return (
    <div className="ps-vis">
      <canvas ref={canvasRef} className="ps-vis-canvas" aria-hidden="true" />
      <div className="ps-vis-controls">
        <label className="visually-hidden" htmlFor="ps-vis-mode">Visualizer mode</label>
        <select
          id="ps-vis-mode"
          className="ps-vis-select"
          value={mode.id}
          onChange={(e) => setVisualizerMode(e.target.value)}
        >
          {modes.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        <button
          className={`icon-btn ${showTuning ? 'active' : ''}`}
          onClick={() => setShowTuning((v) => !v)}
          aria-label="Visualizer tuning"
          aria-expanded={showTuning}
        >
          <IconWave width={14} height={14} />
        </button>
      </div>
      {showTuning && (
        <div className="ps-vis-tuning">
          {([
            ['Sensitivity', 'sensitivity', 0.4, 2],
            ['Intensity', 'intensity', 0.4, 2],
            ['Speed', 'speed', 0.3, 2],
          ] as const).map(([label, key, min, max]) => (
            <label key={key}>
              <span>{label}</span>
              <input
                type="range"
                min={min}
                max={max}
                step={0.05}
                value={vSettings[key]}
                onChange={(e) => updateVisualizer({ [key]: Number(e.target.value) })}
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export function ExpandedPlayer() {
  const item = usePlayer((s) => s.queue[s.index] ?? null);
  const queue = usePlayer((s) => s.queue);
  const index = usePlayer((s) => s.index);
  const playing = usePlayer((s) => s.playing);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const rate = usePlayer((s) => s.rate);
  const { toggle, next, prev, toggleShuffle, cycleRepeat, setView, jumpTo, removeFromQueue, setRate } = usePlayer.getState();

  const [tab, setTab] = useState<Tab>('queue');
  const [detail, setDetail] = useState<Track | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setView('compact');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setView]);

  useEffect(() => {
    setDetail(null);
    if (item?.origin === 'remote' && item.trackSlug) {
      api.get<{ track: Track }>(`/tracks/${item.trackSlug}`)
        .then((r) => setDetail(r.track))
        .catch(() => {});
    }
  }, [item?.queueId, item?.origin, item?.trackSlug]);

  if (!item) return null;

  const lyrics = detail?.lyrics?.body;

  return (
    <div className="player-sheet" role="dialog" aria-modal="true" aria-label="Now playing">
      <div className="ps-backdrop" aria-hidden>
        {item.artworkUrl && <img src={item.artworkUrl} alt="" />}
      </div>

      <div className="ps-topbar">
        <button className="icon-btn" onClick={() => setView('compact')} aria-label="Close expanded player">
          <IconClose />
        </button>
        <span style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
          Now playing {item.origin === 'local' ? '· local file' : ''}
        </span>
        <button className="icon-btn" onClick={() => setView('immersive')} aria-label="Open visualizer">
          <IconWave />
        </button>
      </div>

      <div className="ps-body">
        <div className="ps-left">
          <div className="ps-art">
            <Artwork src={item.artworkUrl} alt={`Artwork for ${item.title}`} />
          </div>
          <div className="ps-titleblock">
            <h2 className="ps-track-title">{item.title}</h2>
            <p className="ps-track-artist">
              {item.origin === 'remote' && item.artistSlug ? (
                <Link to={`/artist/${item.artistSlug}`} onClick={() => setView('compact')}>
                  {item.artistName}
                </Link>
              ) : (
                item.artistName
              )}
              {item.albumTitle ? <> — {item.albumTitle}</> : null}
            </p>
          </div>
          <VisualizerStrip item={item} />
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
                  <div key={q.queueId} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button className={`queue-row ${i === index ? 'current' : ''}`} onClick={() => void jumpTo(i)}>
                      <div className="q-art"><Artwork src={q.artworkUrl} alt="" /></div>
                      <div className="q-meta">
                        <div className="q-title">
                          {q.title}
                          <SourceChip origin={q.origin} sourceType={q.sourceType} />
                        </div>
                        <div className="q-sub">{q.artistName}</div>
                      </div>
                      <span style={{ fontSize: 11.5, color: 'var(--ink-faint)', fontVariantNumeric: 'tabular-nums' }}>
                        {formatDuration(q.duration)}
                      </span>
                    </button>
                    <button className="icon-btn" onClick={() => removeFromQueue(q.queueId)} aria-label={`Remove ${q.title} from queue`}>
                      <IconTrash width={14} height={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {tab === 'lyrics' && (
              lyrics ? (
                <div className="lyrics-body">{lyrics}</div>
              ) : (
                <div className="empty" style={{ marginTop: 12 }}>
                  <h3>No lyrics</h3>
                  <p>{item.origin === 'local' ? 'Lyrics aren\u2019t available for local files yet.' : 'This track has no lyrics on file.'}</p>
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
                    style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--line-strong)', background: 'var(--bg-raised)' }}
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
        </div>
      </div>
    </div>
  );
}
