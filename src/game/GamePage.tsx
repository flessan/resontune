/**
 * Flow — ResonTune's rhythm-game destination.
 *
 * Native page chrome (title, pills, sliders, local library) around a canvas
 * stage that runs the FLOW RHYTHM engine. Audio never goes through the
 * streaming player; starting a run pauses whatever was queued so the two
 * clocks cannot fight.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { GameEngine } from './engine';
import { loadPrefs, savePrefs } from './persistence';
import {
  DIFFICULTIES,
  GAME_HERITAGE,
  GAME_VERSION,
  MODIFIERS,
  type DifficultyId,
  type HudState,
  type JudgementEvent,
  type ModifierId,
} from './types';
import { comboColor } from './scoring';
import { listLocalTracks, getLocalBlob } from '@/local/db';
import type { LocalTrack } from '@/lib/types';
import { usePlayer } from '@/player/store';
import { IconPlay, IconPause, IconUpload, IconExpand } from '@/components/Icons';
import './game.css';

const emptyHud = (): HudState => ({
  score: 0,
  combo: 0,
  maxCombo: 0,
  accuracy: 100,
  health: 100,
  best: 0,
  judgedNotes: 0,
  counts: { perfect: 0, good: 0, ok: 0, miss: 0, drop: 0 },
  status: 'Ready. Start Preview Beat or choose a local audio file.',
  beatInfo: 'Tap notes + hold notes · 1 input = 1 note',
  songName: 'Preview Beat — 120 BPM + holds',
  playing: false,
  paused: false,
  result: null,
});

export default function GamePage() {
  const engineRef = useRef<GameEngine | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [hud, setHud] = useState<HudState>(emptyHud);
  const [judgement, setJudgement] = useState<JudgementEvent | null>(null);
  const [difficulty, setDifficulty] = useState<DifficultyId>('normal');
  const [modifiers, setModifiers] = useState<Set<ModifierId>>(new Set());
  const [volume, setVolume] = useState(70);
  const [offset, setOffset] = useState(0);
  const [tracks, setTracks] = useState<LocalTrack[]>([]);
  const [localId, setLocalId] = useState('');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new GameEngine();
    engineRef.current = engine;
    const prefs = loadPrefs();
    engine.setDifficulty(prefs.difficulty);
    engine.setModifiers(prefs.modifiers);
    engine.setVolume(prefs.volume);
    engine.setOffset(prefs.offset);
    setDifficulty(prefs.difficulty);
    setModifiers(new Set(prefs.modifiers));
    setVolume(Math.round(prefs.volume * 100));
    setOffset(prefs.offset);
    engine.attach(canvas);
    engine.loadPreview();
    engine.startLoop();
    const unsub = engine.subscribe((next, j) => {
      setHud(next);
      if (j) setJudgement(j);
    });
    setHud(engine.snapshot());
    void listLocalTracks().then(setTracks);
    return () => {
      unsub();
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  const persist = (patch: Partial<{ difficulty: DifficultyId; modifiers: ModifierId[]; volume: number; offset: number }>) => {
    savePrefs({
      difficulty: patch.difficulty ?? difficulty,
      modifiers: patch.modifiers ?? [...modifiers],
      volume: patch.volume ?? volume / 100,
      offset: patch.offset ?? offset,
    });
  };

  const pausePlayer = () => {
    const player = usePlayer.getState();
    if (player.playing) void player.toggle();
  };

  const onStart = () => {
    const engine = engineRef.current;
    if (!engine) return;
    if (!hud.playing) pausePlayer();
    void engine.start();
  };

  const toggleMod = (id: ModifierId) => {
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
    persist({ modifiers: [...next] });
  };

  const onDifficulty = (id: DifficultyId) => {
    setDifficulty(id);
    engineRef.current?.setDifficulty(id);
    persist({ difficulty: id });
  };

  const loadFile = async (file: File) => {
    const engine = engineRef.current;
    if (!engine) return;
    const data = await file.arrayBuffer();
    await engine.loadArrayBuffer(data, { key: `file:${file.name}`, name: file.name, kind: 'file' });
  };

  const loadLocal = async (id: string) => {
    setLocalId(id);
    if (!id) return;
    const track = tracks.find((t) => t.id === id);
    const blob = await getLocalBlob(id);
    if (!blob || !track) return;
    const engine = engineRef.current;
    if (!engine) return;
    const data = await blob.arrayBuffer();
    await engine.loadArrayBuffer(data, {
      key: `local:${id}`,
      name: `${track.title} — ${track.artist}`,
      kind: 'local',
      localId: id,
    });
  };

  useEffect(() => {
    const engine = () => engineRef.current;

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) return;
      const g = engine();
      if (!g) return;
      if (event.key === 'Escape') {
        if (g.snapshot().playing) {
          event.preventDefault();
          void g.togglePause();
        }
        return;
      }
      if (event.code === 'Space' && !g.snapshot().playing) {
        event.preventDefault();
        const player = usePlayer.getState();
        if (player.playing) void player.toggle();
        void g.start();
        return;
      }
      if (!g.capturing) return;
      if (event.repeat) return;
      event.preventDefault();
      const split = modifiers.has('split');
      g.handleInput(`k:${event.code || event.key}`, split ? g.keyLane(event.code) : null);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      engine()?.handleRelease(`k:${event.code || event.key}`);
    };

    const onVis = () => {
      const g = engine();
      if (!g) return;
      if (document.hidden && g.capturing) void g.togglePause();
    };
    const onBlur = () => {
      const g = engine();
      if (g?.capturing) void g.togglePause();
    };

    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', onBlur);
    };
  }, [modifiers]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const g = engineRef.current;
    if (!g) return;
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* */ }
    if (hud.paused) {
      void g.togglePause();
      return;
    }
    if (!hud.playing) return;
    const split = modifiers.has('split');
    g.handleInput(`p:${event.pointerId}`, split ? g.pointerLane(event.clientY) : null);
  };

  const onPointerUp = (event: React.PointerEvent) => {
    engineRef.current?.handleRelease(`p:${event.pointerId}`);
  };

  const fullscreen = () => {
    const el = document.querySelector('.flow-stage');
    if (!el) return;
    if (!document.fullscreenElement) void el.requestFullscreen?.();
    else void document.exitFullscreen?.();
  };

  const result = hud.result;
  const showIdle = !hud.playing && !result;
  const offsetLabel = `${offset > 0 ? '+' : ''}${offset}ms`;

  return (
    <div className="page flow-page">
      <div className="flow-hero">
        <div>
          <div className="flow-kicker">Flow · v{GAME_VERSION}</div>
          <h1 className="page-title">Play the beat</h1>
          <p className="page-sub">
            A horizontal rhythm game for any song on this device. Notes flow
            right to left; any key, click or tap is a hit. Music stays local —
            nothing is uploaded.
          </p>
        </div>
        <button className="icon-btn" onClick={fullscreen} aria-label="Fullscreen stage" title="Fullscreen">
          <IconExpand width={18} height={18} />
        </button>
      </div>

      <section className="flow-setup" aria-label="Flow setup">
        <div className="flow-row">
          <button className="btn small" onClick={() => engineRef.current?.loadPreview()}>Preview Beat</button>
          <button
            className="btn small flow-file"
            onClick={() => fileRef.current?.click()}
          >
            <IconUpload width={14} height={14} /> Choose song
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*,.mp3,.m4a,.aac,.ogg,.oga,.opus,.flac,.wav,.webm"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void loadFile(file);
              e.target.value = '';
            }}
          />
          {tracks.length > 0 && (
            <select
              className="flow-select"
              value={localId}
              onChange={(e) => void loadLocal(e.target.value)}
              aria-label="Play a song from your local library"
            >
              <option value="">From your library…</option>
              {tracks.map((t) => (
                <option key={t.id} value={t.id}>{t.title} — {t.artist}</option>
              ))}
            </select>
          )}
          <button className={`btn small primary`} onClick={onStart}>
            {hud.playing ? <><IconPause width={13} height={13} /> Stop</> : <><IconPlay width={13} height={13} /> Start</>}
          </button>
          <span className="flow-song" title={hud.songName}>{hud.songName}</span>
        </div>

        <div className="flow-row" role="radiogroup" aria-label="Difficulty">
          {(Object.keys(DIFFICULTIES) as DifficultyId[]).map((id) => (
            <button
              key={id}
              role="radio"
              aria-checked={difficulty === id}
              className={`pill ${difficulty === id ? 'active' : ''}`}
              onClick={() => onDifficulty(id)}
            >
              {DIFFICULTIES[id].label}
            </button>
          ))}
        </div>

        <div className="flow-row" aria-label="Modifiers">
          {MODIFIERS.map((m) => (
            <button
              key={m.id}
              className={`pill ${modifiers.has(m.id) ? 'active' : ''}`}
              onClick={() => toggleMod(m.id)}
              title={m.hint}
              aria-pressed={modifiers.has(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="flow-sliders">
          <label className="flow-slider">Volume
            <input
              type="range" min={0} max={100} value={volume}
              onChange={(e) => {
                const v = Number(e.target.value);
                setVolume(v);
                engineRef.current?.setVolume(v / 100);
                persist({ volume: v / 100 });
              }}
            />
            <span className="val">{volume}%</span>
          </label>
          <label className="flow-slider">Offset
            <input
              type="range" min={-200} max={200} step={5} value={offset}
              onChange={(e) => {
                const v = Number(e.target.value);
                setOffset(v);
                engineRef.current?.setOffset(v);
                persist({ offset: v });
              }}
            />
            <span className="val">{offsetLabel}</span>
          </label>
        </div>

        <div className="flow-meta">
          <span className="status">{hud.status}</span>
          <span>{hud.beatInfo}</span>
        </div>
      </section>

      <div
        className="flow-stage"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        <canvas ref={canvasRef} aria-label="Flow playfield" />

        <div className="flow-hud">
          <div>
            <div className="flow-score">{hud.score.toLocaleString()}</div>
            <div className="flow-combo" style={{ color: comboColor(hud.combo) }}>COMBO {hud.combo}</div>
          </div>
          <div>
            <div className="flow-acc">{hud.accuracy.toFixed(2)}%</div>
            <div className="flow-acc-label">ACCURACY</div>
            <div className="flow-best">BEST {hud.best.toLocaleString()}</div>
          </div>
        </div>

        {judgement && (
          <div
            key={judgement.id}
            className="flow-judgement show"
            style={{ color: judgement.color }}
          >
            {judgement.text}
          </div>
        )}

        {showIdle && (
          <div className="flow-center">
            <h2>Press anything on beat.</h2>
            <p>
              Notes flow from right to left. Any key, click, or tap.<br />
              <span className="flow-hold">HOLD</span> press the head, then keep holding until the tail
              crosses the line. Release early = DROP.<br />
              <span className="kbd">Esc</span> pauses.
            </p>
          </div>
        )}

        {hud.paused && (
          <div className="flow-center">
            <h2>Paused</h2>
            <p>Press <span className="kbd">Esc</span> or tap the stage to resume.</p>
          </div>
        )}

        {result && (
          <div className="flow-center">
            <h2 style={{ color: result.failed ? '#ff667d' : '#68f5d1' }}>
              {result.failed ? 'Game over' : 'Song complete'}
            </h2>
            <div className="flow-grade" style={{ color: result.grade.color }}>{result.grade.text}</div>
            <div className="flow-result-grid">
              {[
                ['SONG', result.song],
                ['DIFFICULTY', DIFFICULTIES[result.difficulty].label],
                ['SCORE', result.score.toLocaleString()],
                ['HIGH SCORE', result.best.toLocaleString()],
                ['ACCURACY', `${result.accuracy.toFixed(2)}%`],
                ['MAX COMBO', String(result.maxCombo)],
                ['PERFECT', String(result.counts.perfect)],
                ['GOOD', String(result.counts.good)],
                ['OK', String(result.counts.ok)],
                ['MISS', String(result.counts.miss)],
                ['DROP', String(result.counts.drop)],
              ].map(([k, v]) => (
                <div className="row" key={k}><span className="k">{k}</span><span className="v">{v}</span></div>
              ))}
            </div>
            {result.isRecord && <p className="flow-record">★ NEW HIGH SCORE ★</p>}
            <p style={{ marginTop: 10 }}>Press Start to play again.</p>
          </div>
        )}
      </div>

      <div className="flow-help">
        <section>
          <h3>How to play</h3>
          <p>
            This is a free-form rhythm game: every kind of input is a hit.
            What matters is your timing. Two visual lanes, one stream of notes
            — unless you turn on Split, in which case the upper lane is
            A/S/D/F (or the top half of the stage) and the lower lane is J/K/L.
          </p>
        </section>
        <section>
          <h3>Holds, duals, chords</h3>
          <p>
            <span className="flow-hold">HOLD</span>
            Press on the head and keep that input down until the tail. A second
            finger or key can still hit the next note — Dual adds overlapping
            holds and same-time chords. Classic restores the original “one hold
            blocks everything” rule.
          </p>
        </section>
        <section>
          <h3>Difficulty &amp; modifiers</h3>
          <p>
            Easy / Normal / Hard change approach speed, timing windows and
            score. Hard also densifies the chart. Hidden, Sudden, Fast and Slow
            change how notes appear; No Fail keeps you in the song; Auto plays
            the chart for study.
          </p>
        </section>
        <section>
          <h3>Your music</h3>
          <p>
            Preview Beat is always here. Choose a file, or pick something from
            your <Link to="/library">local library</Link> — the same IndexedDB
            store, never uploaded. Offset calibrates for audio latency.
            Heritage: {GAME_HERITAGE}.
          </p>
        </section>
      </div>
    </div>
  );
}
