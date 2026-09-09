import { useEffect, useMemo, useRef, useState } from 'react';
import { usePlayer } from './store';
import { engine } from './engine';
import { useSettings } from '@/stores/settings';
import { VisualizerRunner, listModes } from '@/visualizer/engine';
import '@/visualizer/modes';
import { extractAccent, loadImage } from '@/lib/artworkColor';
import { isCustomThemeActive, readThemeVizPalette } from '@/theme/theme';
import { SeekBar } from './SeekBar';
import { api } from '@/lib/api';
import { OriginalBadge, SourceChip } from '@/components/Provenance';
import type { Track } from '@/lib/types';
import { useLyrics } from '@/lyrics/useLyrics';
import { LyricsView } from '@/lyrics/LyricsView';
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
  const visualizerEnabled = useSettings((s) => s.visualizerEnabled);
  const theme = useSettings((s) => s.theme);
  const customPalette = useSettings((s) => s.customPalette);
  const { setVisualizerMode, setVisualizerEnabled } = useSettings.getState();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runnerRef = useRef<VisualizerRunner | null>(null);
  const [uiVisible, setUiVisible] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [detail, setDetail] = useState<Track | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* track detail for provenance */
  useEffect(() => {
    setDetail(null);
    setShowLyrics(false);
    if (item?.origin === 'remote' && item.trackSlug) {
      api.get<{ track: Track }>(`/tracks/${item.trackSlug}`)
        .then((r) => setDetail(r.track))
        .catch(() => {});
    }
  }, [item?.queueId, item?.origin, item?.trackSlug]);

  /* Lyrics via the client-side LRCLIB resolver (local edits win). */
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

  const modes = listModes();
  const mode = modes.find((m) => m.id === modeId) ?? modes[0];

  /* build runner (rebuilds when the canvas mounts/unmounts with the toggle) */
  useEffect(() => {
    if (!visualizerEnabled || !canvasRef.current) return;
    engine.ensureAnalysis();
    const runner = new VisualizerRunner(
      canvasRef.current,
      mode,
      vSettings,
      () => engine.readFrame(),
    );
    runner.setPalette(readThemeVizPalette());
    runnerRef.current = runner;
    runner.start();
    return () => { runner.destroy(); runnerRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visualizerEnabled]);

  useEffect(() => { runnerRef.current?.setMode(mode); }, [mode]);
  useEffect(() => { runnerRef.current?.setSettings(vSettings); }, [vSettings]);
  useEffect(() => { runnerRef.current?.setPaused(!playing); }, [playing]);

  /* The theme is the visualizer's identity - follow it live. */
  useEffect(() => {
    runnerRef.current?.setPalette(readThemeVizPalette());
  }, [theme, customPalette, visualizerEnabled]);

  /* artwork accent + album image */
  useEffect(() => {
    if (!item) return;
    if (item.artworkUrl) {
      // Built-in themes let the record color the motion; a custom theme
      // keeps the user's primary as the identity.
      if (!isCustomThemeActive()) {
        void extractAccent(item.artworkUrl).then((hex) => {
          if (hex && !isCustomThemeActive()) runnerRef.current?.setAccent(hex);
        });
      }
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
      {visualizerEnabled && <canvas ref={canvasRef} aria-label="Audio visualizer" role="img" />}
      <div className={`imm-ui ${uiVisible ? '' : 'hidden'}`}>
        <div className="imm-top">
          <button className="icon-btn" onClick={() => setView('expanded')} aria-label="Exit visualizer">
            <IconClose />
          </button>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label className="visually-hidden" htmlFor="vis-mode">Visualizer style</label>
            <select
              id="vis-mode"
              className="imm-select"
              value={visualizerEnabled ? mode.id : 'off'}
              onChange={(e) => {
                if (e.target.value === 'off') { setVisualizerEnabled(false); return; }
                setVisualizerEnabled(true);
                setVisualizerMode(e.target.value);
              }}
            >
              <option value="off">Off</option>
              {modes.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <button
              className="icon-btn"
              onClick={() => setShowSettings((v) => !v)}
              aria-label="About this style"
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
            aria-label="About this style"
          >
            <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600 }}>{visualizerEnabled ? mode.name : 'Off'}</p>
            <p style={{ margin: '0 0 10px', fontSize: 12, color: 'rgba(239,234,224,0.55)' }}>
              {visualizerEnabled ? mode.description : 'The stage stays still; the music plays on.'}
            </p>
            <p style={{ margin: 0, fontSize: 12, color: 'rgba(239,234,224,0.55)' }}>
              Colors follow your theme - change it in Settings and the stage follows.
            </p>
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
            {lyr.lyrics && (
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

        {/* Lyrics take reading priority; the visualizer stays behind them
            as an ambient layer. Same DOM lyrics component as everywhere. */}
        {showLyrics && lyr.lyrics && (
          <div className="imm-lyrics" role="region" aria-label="Lyrics">
            <LyricsView
              lyrics={lyr.lyrics}
              isLocalEdit={lyr.isLocalEdit}
              followPlayback
              onSeek={(s) => usePlayer.getState().seekTo(s)}
              compact
            />
          </div>
        )}
      </div>
    </div>
  );
}
