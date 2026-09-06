import { useEffect, useRef, useState } from 'react';
import { usePlayer } from './store';
import { engine } from './engine';
import { useSettings } from '@/stores/settings';
import { VisualizerRunner, listModes } from '@/visualizer/engine';
import '@/visualizer/modes';
import { setTypographyText } from '@/visualizer/modes/typography';
import { extractAccent, loadImage } from '@/lib/artworkColor';
import { SeekBar } from './SeekBar';
import { api } from '@/lib/api';
import { OriginalBadge, SourceChip } from '@/components/Provenance';
import type { Track } from '@/lib/types';
import {
  IconPlay, IconPause, IconPrev, IconNext, IconClose, IconSettings, IconMic,
} from '@/components/Icons';

/**
 * Immersive player: fullscreen canvas visualizer + minimal chrome that
 * fades away. The visualizer consumes real analysis frames from the engine.
 */
export function ImmersivePlayer() {
  const item = usePlayer((s) => s.queue[s.index] ?? null);
  const playing = usePlayer((s) => s.playing);
  const { toggle, next, prev, setView } = usePlayer.getState();
  const modeId = useSettings((s) => s.visualizerMode);
  const vSettings = useSettings((s) => s.visualizer);
  const { setVisualizerMode, updateVisualizer } = useSettings.getState();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runnerRef = useRef<VisualizerRunner | null>(null);
  const [uiVisible, setUiVisible] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [detail, setDetail] = useState<Track | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* track detail for provenance + lyrics */
  useEffect(() => {
    setDetail(null);
    setShowLyrics(false);
    if (item?.origin === 'remote' && item.trackSlug) {
      api.get<{ track: Track }>(`/tracks/${item.trackSlug}`)
        .then((r) => setDetail(r.track))
        .catch(() => {});
    }
  }, [item?.queueId, item?.origin, item?.trackSlug]);

  const modes = listModes();
  const mode = modes.find((m) => m.id === modeId) ?? modes[0];

  /* build runner */
  useEffect(() => {
    if (!canvasRef.current) return;
    engine.ensureAnalysis();
    const runner = new VisualizerRunner(
      canvasRef.current,
      mode,
      vSettings,
      () => engine.readFrame(),
    );
    runnerRef.current = runner;
    runner.start();
    return () => runner.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { runnerRef.current?.setMode(mode); }, [mode]);
  useEffect(() => { runnerRef.current?.setSettings(vSettings); }, [vSettings]);

  /* artwork accent + album image + typography text */
  useEffect(() => {
    if (!item) return;
    setTypographyText(item.title, item.artistName);
    if (item.artworkUrl) {
      void extractAccent(item.artworkUrl).then((hex) => {
        if (hex) runnerRef.current?.setAccent(hex);
      });
      void loadImage(item.artworkUrl)
        .then((img) => runnerRef.current?.setArtwork(img))
        .catch(() => runnerRef.current?.setArtwork(null));
    } else {
      runnerRef.current?.setArtwork(null);
    }
  }, [item?.queueId, item?.artworkUrl, item?.title, item?.artistName, item]);

  /* auto-hide UI */
  useEffect(() => {
    const bump = () => {
      setUiVisible(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => {
        if (!showSettings) setUiVisible(false);
      }, 3500);
    };
    bump();
    window.addEventListener('pointermove', bump);
    window.addEventListener('keydown', bump);
    return () => {
      window.removeEventListener('pointermove', bump);
      window.removeEventListener('keydown', bump);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [showSettings]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setView('compact');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setView]);

  const analysisMissing = !engine.analysisReady;

  return (
    <div className="immersive">
      <canvas ref={canvasRef} aria-label="Audio visualizer" role="img" />
      <div className={`imm-ui ${uiVisible ? '' : 'hidden'}`}>
        <div className="imm-top">
          <button className="icon-btn" onClick={() => setView('expanded')} aria-label="Exit visualizer">
            <IconClose />
          </button>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label className="visually-hidden" htmlFor="vis-mode">Visualizer mode</label>
            <select
              id="vis-mode"
              className="imm-select"
              value={mode.id}
              onChange={(e) => setVisualizerMode(e.target.value)}
            >
              {modes.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <button
              className="icon-btn"
              onClick={() => setShowSettings((v) => !v)}
              aria-label="Visualizer settings"
              aria-expanded={showSettings}
            >
              <IconSettings />
            </button>
          </div>
        </div>

        {showSettings && (
          <div
            style={{
              position: 'absolute', right: 32, top: 76, width: 260,
              background: 'rgba(16,15,12,0.92)', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 10, padding: 18, backdropFilter: 'blur(8px)',
            }}
            role="group"
            aria-label="Visualizer settings"
          >
            <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600 }}>{mode.name}</p>
            <p style={{ margin: '0 0 14px', fontSize: 12, color: 'rgba(239,234,224,0.55)' }}>{mode.description}</p>
            {([
              ['sensitivity', 'Sensitivity', 0.4, 2],
              ['intensity', 'Intensity', 0.4, 2],
              ['speed', 'Speed', 0.3, 2],
              ['opacity', 'Opacity', 0.2, 1],
              ['smoothing', 'Smoothing', 0, 0.95],
              ['scale', 'Scale', 0.5, 1.6],
            ] as const).map(([key, label, min, max]) => (
              <div key={key} style={{ marginBottom: 10 }}>
                <label htmlFor={`vs-${key}`} style={{ fontSize: 11.5, display: 'flex', justifyContent: 'space-between', color: 'rgba(239,234,224,0.7)' }}>
                  {label}
                  <span>{vSettings[key].toFixed(2)}</span>
                </label>
                <input
                  id={`vs-${key}`}
                  type="range"
                  min={min}
                  max={max}
                  step={0.01}
                  value={vSettings[key]}
                  onChange={(e) => updateVisualizer({ [key]: Number(e.target.value) })}
                  style={{ width: '100%', accentColor: 'var(--accent)' }}
                />
              </div>
            ))}
          </div>
        )}

        <div className="imm-bottom">
          <div className="imm-meta">
            {item ? (
              <>
                <div className="t">{item.title}</div>
                <div className="a" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {item.artistName}
                  {item.sourceType === 'original'
                    ? <OriginalBadge compact />
                    : <SourceChip origin={item.origin} sourceType={item.sourceType} />}
                </div>
              </>
            ) : (
              <div className="a">Nothing playing</div>
            )}
            {analysisMissing && (
              <div className="a" style={{ marginTop: 6, fontSize: 12.5 }}>
                Press play to start audio analysis.
              </div>
            )}
          </div>
          <div style={{ flex: 1, maxWidth: 480 }}>
            <SeekBar compact />
          </div>
          <div className="imm-controls">
            {detail?.lyrics?.body && (
              <button
                className={`icon-btn ${showLyrics ? 'active' : ''}`}
                onClick={() => setShowLyrics((v) => !v)}
                aria-label="Toggle lyrics"
                aria-pressed={showLyrics}
              >
                <IconMic width={18} height={18} />
              </button>
            )}
            <button className="icon-btn" onClick={() => void prev()} aria-label="Previous"><IconPrev /></button>
            <button className="icon-btn" onClick={() => void toggle()} aria-label={playing ? 'Pause' : 'Play'} style={{ width: 44, height: 44 }}>
              {playing ? <IconPause width={22} height={22} /> : <IconPlay width={22} height={22} />}
            </button>
            <button className="icon-btn" onClick={() => void next()} aria-label="Next"><IconNext /></button>
          </div>
        </div>

        {showLyrics && detail?.lyrics?.body && (
          <div className="imm-lyrics" role="region" aria-label="Lyrics">
            {detail.lyrics.body}
          </div>
        )}
      </div>
    </div>
  );
}
