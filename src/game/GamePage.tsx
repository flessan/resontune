/**
 * Flow destination. Select → prep → play → result.
 * Play HUD is painted on the canvas; React only handles session screens.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FlowEngine, DEFAULT_PRACTICE } from './engine';
import { loadSave, writeSave, scoreKey, readBest, recordBest, bestLine } from './persistence';
import { fetchCatalogSlice, fetchTrackBySlug, loadCatalogSong, loadFileSong, loadLocalSong } from './source';
import { PrepScreen, ResultScreen, SelectScreen } from './screens';
import { laneFromCode, laneFromPointer } from './input';
import {
  PREVIEW_SONG,
  type DifficultyId,
  type GameResult,
  type ModifierId,
  type PracticeSettings,
  type SessionMode,
  type SongRef,
} from './types';
import { listLocalTracks } from '@/local/db';
import type { LocalTrack, Track } from '@/lib/types';
import { usePlayer } from '@/player/store';
import { IconExpand } from '@/components/Icons';
import './game.css';

export default function GamePage() {
  const [params] = useSearchParams();
  const engineRef = useRef<FlowEngine | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mode, setMode] = useState<SessionMode>('select');
  const [song, setSong] = useState<SongRef>(PREVIEW_SONG);
  const [chartInfo, setChartInfo] = useState('');
  const [beatInfo, setBeatInfo] = useState('');
  const [duration, setDuration] = useState(56);
  const [difficulty, setDifficulty] = useState<DifficultyId>('normal');
  const [modifiers, setModifiers] = useState<Set<ModifierId>>(new Set());
  const [offset, setOffset] = useState(0);
  const [practice, setPractice] = useState<PracticeSettings>({ ...DEFAULT_PRACTICE });
  const [best, setBest] = useState(0);
  const [bestGrade, setBestGrade] = useState('—');
  const [result, setResult] = useState<GameResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [local, setLocal] = useState<LocalTrack[]>([]);
  const [catalog, setCatalog] = useState<Track[]>([]);
  const deepLink = params.get('track');

  useEffect(() => {
    const engine = new FlowEngine();
    engineRef.current = engine;
    const save = loadSave();
    engine.setDifficulty(save.lastDifficulty);
    engine.setModifiers(save.lastModifiers);
    engine.setOffset(save.offsetMs);
    setDifficulty(save.lastDifficulty);
    setModifiers(new Set(save.lastModifiers));
    setOffset(save.offsetMs);
    engine.onEvent = (event) => {
      if (event.type === 'ready') {
        setSong({ ...engine.song });
        setChartInfo(engine.chartInfo);
        setBeatInfo(engine.beatInfo);
        setDuration(engine.buffer?.duration ?? engine.song.duration ?? 56);
        refreshBest(engine);
      }
      if (event.type === 'finished') finishRun(engine, event.result);
    };
    void listLocalTracks().then(setLocal);
    void fetchCatalogSlice().then(setCatalog);
    return () => {
      engine.dispose();
      engineRef.current = null;
      delete document.body.dataset.flow;
    };
  }, []);

  useEffect(() => {
    if (!deepLink || !engineRef.current) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError('');
      try {
        const track = await fetchTrackBySlug(deepLink);
        if (cancelled) return;
        await openCatalog(track);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not open that track in Flow.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [deepLink]);

  useEffect(() => {
    document.body.dataset.flow = mode;
    return () => { delete document.body.dataset.flow; };
  }, [mode]);

  const persistPrefs = (patch: { difficulty?: DifficultyId; modifiers?: ModifierId[]; offsetMs?: number }) => {
    const save = loadSave();
    writeSave({
      ...save,
      lastDifficulty: patch.difficulty ?? difficulty,
      lastModifiers: patch.modifiers ?? [...modifiers],
      offsetMs: patch.offsetMs ?? offset,
    });
  };

  const refreshBest = (engine: FlowEngine) => {
    const save = loadSave();
    const key = scoreKey(engine.song.key, engine.difficulty, engine.modifiers);
    const entry = readBest(save, key);
    const line = bestLine(entry);
    engine.best = line.score;
    engine.bestGrade = line.grade;
    setBest(line.score);
    setBestGrade(line.grade);
  };

  const finishRun = (engine: FlowEngine, raw: GameResult) => {
    engine.detach();
    let next = raw;
    if (!raw.practice) {
      const save = loadSave();
      const key = scoreKey(raw.song.key, raw.difficulty, raw.modifiers);
      const recorded = recordBest(save, key, raw);
      if (recorded.isRecord) writeSave(recorded.save);
      next = { ...raw, isRecord: recorded.isRecord, best: Math.max(raw.score, readBest(recorded.save, key)?.score ?? raw.best) };
    }
    setResult(next);
    setMode('result');
  };

  const applyChartPrefs = () => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setDifficulty(difficulty);
    engine.setModifiers(modifiers);
    engine.setOffset(offset);
    engine.setPractice(practice);
    refreshBest(engine);
    setChartInfo(engine.chartInfo);
    setBeatInfo(engine.beatInfo);
  };

  const openPreview = async () => {
    const engine = engineRef.current;
    if (!engine) return;
    setLoading(true);
    setError('');
    try {
      await engine.loadPreview();
      setSong({ ...PREVIEW_SONG });
      setMode('prep');
      applyChartPrefs();
    } finally {
      setLoading(false);
    }
  };

  const openFile = async (file: File) => {
    const engine = engineRef.current;
    if (!engine) return;
    setLoading(true);
    setError('');
    try {
      await engine.audio.ensure();
      const loaded = await loadFileSong(file, engine.audio);
      await engine.loadBuffer(loaded.song, loaded.buffer);
      setMode('prep');
      applyChartPrefs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that file.');
    } finally {
      setLoading(false);
    }
  };

  const openLocal = async (track: LocalTrack) => {
    const engine = engineRef.current;
    if (!engine) return;
    setLoading(true);
    setError('');
    try {
      await engine.audio.ensure();
      const loaded = await loadLocalSong(track.id, track.title, track.artist, engine.audio);
      await engine.loadBuffer(loaded.song, loaded.buffer);
      setMode('prep');
      applyChartPrefs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load that song.');
    } finally {
      setLoading(false);
    }
  };

  const openCatalog = async (track: Track) => {
    const engine = engineRef.current;
    if (!engine) return;
    setLoading(true);
    setError('');
    try {
      await engine.audio.ensure();
      const loaded = await loadCatalogSong(track, engine.audio);
      await engine.loadBuffer(loaded.song, loaded.buffer);
      setMode('prep');
      applyChartPrefs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not chart this track.');
    } finally {
      setLoading(false);
    }
  };

  const onDifficulty = (id: DifficultyId) => {
    setDifficulty(id);
    engineRef.current?.setDifficulty(id);
    persistPrefs({ difficulty: id });
    const engine = engineRef.current;
    if (engine) {
      setChartInfo(engine.chartInfo);
      refreshBest(engine);
    }
  };

  const onToggleMod = (id: ModifierId) => {
    const next = new Set(modifiers);
    if (next.has(id)) next.delete(id);
    else {
      next.add(id);
      if (id === 'classic') next.delete('split');
      if (id === 'split') next.delete('classic');
      if (id === 'fast') next.delete('slow');
      if (id === 'slow') next.delete('fast');
    }
    setModifiers(next);
    engineRef.current?.setModifiers(next);
    persistPrefs({ modifiers: [...next] });
    const engine = engineRef.current;
    if (engine) {
      setChartInfo(engine.chartInfo);
      refreshBest(engine);
    }
  };

  const onOffset = (ms: number) => {
    setOffset(ms);
    engineRef.current?.setOffset(ms);
    persistPrefs({ offsetMs: ms });
  };

  const onPractice = (next: PracticeSettings) => {
    setPractice(next);
    engineRef.current?.setPractice(next);
  };

  const pauseStreaming = () => {
    const player = usePlayer.getState();
    if (player.playing) void player.toggle();
  };

  const startPlay = () => {
    const engine = engineRef.current;
    if (!engine) return;
    pauseStreaming();
    engine.setDifficulty(difficulty);
    engine.setModifiers(modifiers);
    engine.setOffset(offset);
    engine.setPractice(practice);
    refreshBest(engine);
    setMode('play');
  };

  useLayoutEffect(() => {
    if (mode !== 'play') return;
    const canvas = canvasRef.current;
    const engine = engineRef.current;
    if (!canvas || !engine) return;
    engine.attach(canvas);
    void engine.begin();
    return () => {
      engine.detach();
    };
  }, [mode]);

  useEffect(() => {
    if (mode !== 'play') return;
    const engine = () => engineRef.current;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) return;
      const g = engine();
      if (!g) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        void g.togglePause();
        return;
      }
      if (!g.capturing) {
        if (event.code === 'Space' && g.paused) {
          event.preventDefault();
          void g.togglePause();
        }
        return;
      }
      if (event.repeat) return;
      event.preventDefault();
      event.stopPropagation();
      const split = modifiers.has('split');
      g.tap(`k:${event.code || event.key}`, split ? laneFromCode(event.code) : null);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      engine()?.release(`k:${event.code || event.key}`);
    };
    const onVis = () => {
      const g = engine();
      if (g?.capturing && document.hidden) void g.togglePause();
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    window.addEventListener('keyup', onKeyUp);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      window.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [mode, modifiers]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const g = engineRef.current;
    if (!g) return;
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* */ }
    if (g.paused) {
      void g.togglePause();
      return;
    }
    if (!g.capturing) return;
    const split = modifiers.has('split');
    const rect = event.currentTarget.getBoundingClientRect();
    g.tap(`p:${event.pointerId}`, split ? laneFromPointer(event.clientY - rect.top, rect.height) : null);
  };

  const onPointerUp = (event: React.PointerEvent) => {
    engineRef.current?.release(`p:${event.pointerId}`);
  };

  const fullscreen = () => {
    const el = document.querySelector('.flow-stage');
    if (!el) return;
    if (!document.fullscreenElement) void el.requestFullscreen?.();
    else void document.exitFullscreen?.();
  };

  const leavePlay = useCallback(async () => {
    await engineRef.current?.stopSession();
    engineRef.current?.detach();
    setMode('prep');
  }, []);

  if (mode === 'play') {
    return (
      <div className="flow-live">
        <div
          className="flow-stage"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onContextMenu={(e) => e.preventDefault()}
        >
          <canvas ref={canvasRef} aria-label="Flow playfield" />
          <button type="button" className="flow-fs" onClick={fullscreen} aria-label="Fullscreen">
            <IconExpand width={16} height={16} />
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'result' && result) {
    return (
      <ResultScreen
        result={result}
        onRetry={() => {
          setResult(null);
          startPlay();
        }}
        onPrep={() => {
          setResult(null);
          setMode('prep');
        }}
        onSelect={() => {
          setResult(null);
          setMode('select');
        }}
      />
    );
  }

  if (mode === 'prep') {
    return (
      <PrepScreen
        song={song}
        chartInfo={chartInfo}
        beatInfo={beatInfo}
        difficulty={difficulty}
        modifiers={modifiers}
        offset={offset}
        practice={practice}
        best={best}
        bestGrade={bestGrade}
        duration={duration}
        onDifficulty={onDifficulty}
        onToggleMod={onToggleMod}
        onOffset={onOffset}
        onPractice={onPractice}
        onPlay={startPlay}
        onPreviewAudio={() => {
          const engine = engineRef.current;
          if (!engine?.buffer) return;
          const from = Math.max(0, (engine.sections.find((s) => s.kind === 'chorus' || s.kind === 'drop')?.start ?? duration * 0.25));
          void engine.audio.ensure().then(() => engine.audio.playPreview(engine.buffer!, from, 8));
        }}
        onBack={() => {
          engineRef.current?.audio.stopPreview();
          void leavePlay();
          setMode('select');
        }}
      />
    );
  }

  return (
    <SelectScreen
      local={local}
      catalog={catalog}
      error={error}
      loading={loading}
      onPreview={() => void openPreview()}
      onFile={(file) => void openFile(file)}
      onLocal={(t) => void openLocal(t)}
      onCatalog={(t) => void openCatalog(t)}
    />
  );
}
