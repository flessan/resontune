/**
 * Flow game engine.
 *
 * Clock: `audioContext.currentTime - startTime - offset`. Pause is
 * `AudioContext.suspend()`, so music and notes freeze together. That
 * contract is the original FLOW RHYTHM timing model and is not to be
 * replaced with HTMLMediaElement.currentTime.
 */
import { GameAudio } from './audio';
import { buildNotes, chartEndOf, countHolds, detectBeats, previewBeatTimes } from './chart';
import { laneFromCode, laneFromPointer } from './input';
import { loadBest, saveBest } from './persistence';
import { GameView } from './renderer';
import {
  accuracyPct,
  comboColor,
  gradeFor,
  healthOnHit,
  JUDGEMENT_COLORS,
  judgeTiming,
} from './scoring';
import {
  approachFor,
  COUNTDOWN_LEAD,
  DIFFICULTIES,
  HOLD_CLEAR_SCORE,
  HOLD_DROP_HEALTH,
  HOLD_TICK,
  HOLD_TICK_SCORE,
  type ActiveHold,
  type Difficulty,
  type DifficultyId,
  type GameResult,
  type HitCounts,
  type HudState,
  type JudgementEvent,
  type ModifierId,
  type Note,
  type SongRef,
} from './types';

export type EngineListener = (hud: HudState, judgement: JudgementEvent | null) => void;

export class GameEngine {
  readonly view = new GameView();
  private readonly audio = new GameAudio();
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private listeners = new Set<EngineListener>();

  private difficulty: DifficultyId = 'normal';
  private modifiers = new Set<ModifierId>();
  private volume = 0.7;
  private offsetMs = 0;

  private song: SongRef = { key: 'preview', name: 'Preview Beat — 120 BPM + holds', kind: 'preview' };
  private beatTimes: number[] = [];
  private buffer: AudioBuffer | null = null;
  private notes: Note[] = [];
  private chartEnd = 0;
  private holds = new Map<string, ActiveHold>();

  private playing = false;
  private paused = false;
  private startTime = 0;
  private score = 0;
  private combo = 0;
  private maxCombo = 0;
  private earnedPoints = 0;
  private judgedNotes = 0;
  private counts: HitCounts = emptyCounts();
  private health = 100;
  private result: GameResult | null = null;
  private status = 'Ready. Start Preview Beat or choose a local audio file.';
  private judgement: JudgementEvent | null = null;
  private judgementSeq = 0;

  private raf = 0;
  private lastTs = 0;
  private destroyed = false;
  private wakeLock: WakeLockSentinel | null = null;
  private reducedMotion = false;

  attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.view.resize(canvas, this.ctx!);
    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  }

  subscribe(fn: EngineListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  get capturing(): boolean {
    return this.playing && !this.paused;
  }

  setDifficulty(id: DifficultyId): void {
    this.difficulty = id;
    this.emit();
  }

  setModifiers(mods: Iterable<ModifierId>): void {
    this.modifiers = new Set(mods);
    if (this.modifiers.has('classic')) this.modifiers.delete('split');
    if (this.modifiers.has('fast') && this.modifiers.has('slow')) this.modifiers.delete('slow');
    this.emit();
  }

  setVolume(level: number): void {
    this.volume = level;
    this.audio.setVolume(level);
  }

  setOffset(ms: number): void {
    this.offsetMs = ms;
  }

  loadPreview(): void {
    this.stop('Preview beat loaded. Press Start.');
    this.buffer = null;
    this.beatTimes = previewBeatTimes();
    this.song = { key: 'preview', name: 'Preview Beat — 120 BPM + holds', kind: 'preview' };
    this.status = 'Preview beat loaded. Press Start.';
    this.showJudgement('PREVIEW', '#719cff', 'info');
    this.emit();
  }

  async loadArrayBuffer(data: ArrayBuffer, song: SongRef): Promise<void> {
    this.stop('Loading song and detecting beats…');
    this.song = song;
    this.beatTimes = [];
    this.buffer = null;
    this.status = 'Loading song and detecting beats…';
    this.emit();
    try {
      const buffer = await this.audio.decode(data);
      this.buffer = buffer;
      this.beatTimes = detectBeats(buffer);
      this.status = `Ready: ${song.name}`;
      this.showJudgement('READY', '#68f5d1', 'info');
      this.emit();
    } catch (err) {
      console.warn('[flow] decode failed', err);
      this.status = 'Could not read that audio file. Try MP3, WAV, OGG, or M4A.';
      this.showJudgement('ERROR', '#ff667d', 'miss');
      this.emit();
      throw err;
    }
  }

  async start(): Promise<void> {
    if (this.playing) {
      this.stop();
      return;
    }
    if (!this.beatTimes.length) this.loadPreview();

    await this.audio.resume();
    const ac = this.audio.ensure();
    const D = DIFFICULTIES[this.difficulty];
    const endTime = this.buffer ? this.buffer.duration : (this.beatTimes[this.beatTimes.length - 1] ?? 0) + 2;
    this.notes = buildNotes(this.beatTimes, endTime, { difficulty: this.difficulty, modifiers: this.modifiers });
    this.chartEnd = chartEndOf(this.notes);
    this.resetScore();
    this.result = null;
    this.playing = true;
    this.paused = false;
    this.startTime = ac.currentTime + COUNTDOWN_LEAD;
    this.view.resetFx();

    this.status = this.buffer
      ? `Playing ${this.song.name} (${D.label}). Tap heads, hold tails.`
      : `Playing Preview Beat (${D.label}). Tap heads, hold tails.`;

    if (this.buffer) {
      this.audio.playBuffer(this.buffer, this.startTime, () => {
        if (this.playing) this.finish(false);
      });
    } else {
      this.audio.startMetronome(this.startTime);
    }

    void this.requestWakeLock();
    this.emit();
  }

  stop(message = 'Game stopped.'): void {
    if (this.audio.context?.state === 'suspended') void this.audio.resume();
    this.playing = false;
    this.paused = false;
    this.cancelHoldsSilent();
    this.audio.stopNodes();
    this.releaseWakeLock();
    this.status = message;
    this.result = null;
    this.emit();
  }

  async togglePause(): Promise<void> {
    if (!this.playing) return;
    if (!this.paused) {
      this.paused = true;
      await this.audio.suspend();
      this.status = 'Paused. Press Esc or tap the stage to resume.';
    } else {
      this.paused = false;
      await this.audio.resume();
      this.status = this.buffer
        ? 'Playing custom song. Any input hits one note.'
        : 'Playing Preview Beat. Any input hits one note.';
    }
    this.emit();
  }

  handleInput(inputId: string, laneHint: 0 | 1 | null = null): void {
    if (!this.playing || this.paused) return;
    const now = this.gameTime();
    if (now < 0) return;
    if (this.holds.has(inputId)) return;
    if (this.modifiers.has('classic') && this.holds.size > 0) return;

    const D = this.diff();
    const note = this.nextNote(laneHint);
    if (!note) return;

    const difference = now - note.time;
    const judged = judgeTiming(difference, D);

    if (judged.kind === 'early') {
      this.showJudgement(judged.label, judged.color, 'early');
      return;
    }
    if (judged.kind === 'late') {
      this.registerMiss(note);
      this.showJudgement(judged.label, judged.color, 'late');
      return;
    }
    if (judged.kind !== 'perfect' && judged.kind !== 'good' && judged.kind !== 'ok') return;

    if (note.duration > 0) {
      note.holding = true;
      this.holds.set(inputId, {
        note,
        id: inputId,
        until: note.time + note.duration,
        nextTick: now + HOLD_TICK,
      });
      this.applyHit(judged.points, judged.label, judged.color, judged.kind, note.lane, difference);
      return;
    }

    note.hit = true;
    note.judged = true;
    this.applyHit(judged.points, judged.label, judged.color, judged.kind, note.lane, difference);
  }

  handleRelease(inputId: string): void {
    if (!this.holds.has(inputId)) return;
    this.endHold(inputId, 'release');
  }

  pointerLane(clientY: number): 0 | 1 {
    if (!this.canvas) return 0;
    const rect = this.canvas.getBoundingClientRect();
    return laneFromPointer(clientY - rect.top, rect.height);
  }

  keyLane(code: string): 0 | 1 | null {
    return laneFromCode(code);
  }

  startLoop(): void {
    const tick = (ts: number) => {
      if (this.destroyed) return;
      this.raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (ts - this.lastTs) / 1000 || 0);
      this.lastTs = ts;
      this.frame(dt, ts / 1000);
    };
    this.raf = requestAnimationFrame(tick);
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.stop();
    void this.audio.close();
    this.listeners.clear();
  }

  snapshot(): HudState {
    const end = this.buffer ? this.buffer.duration : (this.beatTimes[this.beatTimes.length - 1] ?? 0) + 2;
    const noteCount = this.notes.length || this.beatTimes.length;
    const holds = this.notes.length
      ? this.notes.filter((n) => n.duration > 0).length
      : countHolds(this.beatTimes, end);
    const extra = this.buffer ? ` · ${this.buffer.duration.toFixed(1)}s` : '';
    const inputRule = this.modifiers.has('split') ? 'split lanes' : '1 input = 1 note';
    return {
      score: this.score,
      combo: this.combo,
      maxCombo: this.maxCombo,
      accuracy: accuracyPct(this.earnedPoints, this.judgedNotes),
      health: this.health,
      best: loadBest(this.song.key, this.difficulty, this.modifiers),
      judgedNotes: this.judgedNotes,
      counts: { ...this.counts },
      status: this.status,
      beatInfo: noteCount
        ? `${noteCount} notes (${holds} hold) · ${inputRule}${extra}`
        : 'Tap notes + hold notes · 1 input = 1 note',
      songName: this.song.name,
      playing: this.playing,
      paused: this.paused,
      result: this.result,
    };
  }

  /* ------------------------------- internals ------------------------------ */

  private diff(): Difficulty {
    return DIFFICULTIES[this.difficulty];
  }

  private gameTime(): number {
    if (!this.playing || !this.audio.context) return 0;
    return this.audio.context.currentTime - this.startTime - this.offsetMs / 1000;
  }

  private nextNote(laneHint: 0 | 1 | null): Note | undefined {
    if (this.modifiers.has('split') && laneHint != null) {
      return this.notes.find((n) => !n.judged && !n.holding && n.lane === laneHint);
    }
    return this.notes.find((n) => !n.judged && !n.holding);
  }

  private applyHit(points: number, label: string, color: string, kind: 'perfect' | 'good' | 'ok', lane: 0 | 1, error: number): void {
    const D = this.diff();
    this.score += Math.round(points * D.scoreMul);
    this.combo += 1;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.earnedPoints += points;
    this.judgedNotes += 1;
    this.counts[kind] += 1;
    this.health = healthOnHit(kind, this.health);

    const fx = this.view.hitX();
    const fy = this.view.laneY(lane);
    this.view.spawnParticles(fx, fy, color, kind === 'perfect' ? 16 : 10, kind === 'perfect' ? 1.25 : 0.9);
    this.view.spawnRing(fx, fy, color);
    this.view.pulseLane(lane);
    this.view.pushSample(error, kind);
    this.audio.playHit(kind);
    vib(kind === 'perfect' ? 14 : 9);

    this.showJudgement(label, color, kind);
    if (this.combo > 0 && this.combo % 25 === 0) this.celebrate(this.combo);
    this.emit();
  }

  private registerMiss(note: Note): void {
    if (!note || note.judged || note.holding) return;
    const D = this.diff();
    note.missed = true;
    note.judged = true;
    this.combo = 0;
    this.judgedNotes += 1;
    this.counts.miss += 1;
    this.health = Math.max(0, this.health - D.healthMiss);
    this.view.addShake(5, 0.22);
    this.view.flash('255,102,125', 0.08);
    this.audio.playHit('miss');
    vib(45);
    this.showJudgement('MISS', JUDGEMENT_COLORS.miss, 'miss');
    this.emit();
  }

  private updateHolds(now: number): void {
    if (this.paused) return;
    const D = this.diff();
    for (const [id, h] of [...this.holds]) {
      while (h.nextTick < h.until && now >= h.nextTick) {
        h.nextTick += HOLD_TICK;
        this.score += Math.round(HOLD_TICK_SCORE * D.scoreMul);
        this.combo += 1;
        this.maxCombo = Math.max(this.maxCombo, this.combo);
        this.view.spawnParticles(this.view.hitX(), this.view.laneY(h.note.lane), this.view.laneColor(h.note.lane), 2, 0.5);
      }
      if (now >= h.until) this.endHold(id, 'complete');
    }
  }

  private endHold(inputId: string, reason: 'complete' | 'release'): void {
    const h = this.holds.get(inputId);
    if (!h) return;
    this.holds.delete(inputId);
    const note = h.note;
    const now = this.gameTime();
    const D = this.diff();

    if (reason === 'complete' || now >= h.until - 0.1) {
      note.judged = true;
      note.hit = true;
      note.holding = false;
      this.score += Math.round(HOLD_CLEAR_SCORE * D.scoreMul);
      this.view.spawnRing(this.view.hitX(), this.view.laneY(note.lane), '#68f5d1');
      this.view.spawnParticles(this.view.hitX(), this.view.laneY(note.lane), '#68f5d1', 12, 1.1);
      this.showJudgement('CLEAR', '#68f5d1', 'clear');
      this.audio.playTail(true);
      vib(15);
    } else {
      note.judged = true;
      note.missed = true;
      note.holding = false;
      this.combo = 0;
      this.counts.drop += 1;
      this.health = Math.max(0, this.health - HOLD_DROP_HEALTH);
      this.showJudgement('DROP', '#ff667d', 'drop');
      this.audio.playTail(false);
      this.view.addShake(6, 0.25);
      this.view.flash('255,102,125', 0.1);
      vib([40, 30, 40]);
    }
    this.emit();
  }

  private cancelHoldsSilent(): void {
    for (const h of this.holds.values()) h.note.judged = true;
    this.holds.clear();
  }

  private autoplay(now: number): void {
    if (!this.modifiers.has('auto') || this.paused) return;
    for (const note of this.notes) {
      if (note.judged || note.holding) continue;
      if (now + 0.012 < note.time) break;
      this.handleInput(`auto:${note.id}`, note.lane);
      if (note.duration > 0) {
        /* release is driven by endHold(complete) via the clock */
      }
    }
  }

  private finish(failed: boolean): void {
    if (!this.playing) return;
    this.playing = false;
    this.cancelHoldsSilent();
    this.audio.stopNodes();
    this.releaseWakeLock();

    const accuracy = accuracyPct(this.earnedPoints, this.judgedNotes);
    const prevBest = loadBest(this.song.key, this.difficulty, this.modifiers);
    const isRecord = !failed && this.judgedNotes > 0 && this.score > prevBest;
    if (isRecord) {
      saveBest(this.song.key, this.difficulty, this.modifiers, {
        score: this.score,
        accuracy,
        grade: gradeFor(accuracy, failed).text,
        maxCombo: this.maxCombo,
        at: Date.now(),
      });
    }

    const grade = gradeFor(accuracy, failed);
    this.result = {
      failed,
      song: this.song.name,
      songKey: this.song.key,
      difficulty: this.difficulty,
      modifiers: [...this.modifiers],
      score: this.score,
      accuracy,
      maxCombo: this.maxCombo,
      counts: { ...this.counts },
      grade,
      isRecord,
      best: Math.max(loadBest(this.song.key, this.difficulty, this.modifiers), this.score),
    };
    this.status = failed
      ? `Game over — health depleted. Final score: ${this.score.toLocaleString()}`
      : `Song complete! Final score: ${this.score.toLocaleString()}`;
    this.showJudgement(failed ? 'FAILED' : 'FINISHED', failed ? '#ff667d' : '#68f5d1', failed ? 'miss' : 'clear');
    this.view.addShake(failed ? 10 : 4, failed ? 0.5 : 0.25);
    this.audio.playFinish(failed);
    vib(failed ? [80, 60, 80] : [30, 40, 30]);
    this.emit();
  }

  private resetScore(): void {
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.earnedPoints = 0;
    this.judgedNotes = 0;
    this.counts = emptyCounts();
    this.health = 100;
    this.holds.clear();
  }

  private celebrate(combo: number): void {
    this.showJudgement(`${combo} COMBO`, '#ff75c5', 'info');
    this.view.spawnParticles(this.view.hitX(), this.view.laneY(0), '#ff75c5', 12, 1.1);
    this.view.spawnParticles(this.view.hitX(), this.view.laneY(1), '#719cff', 12, 1.1);
    this.view.flash('255,117,197', 0.12);
    this.view.addShake(3, 0.2);
  }

  private showJudgement(text: string, color: string, kind: JudgementEvent['kind']): void {
    this.judgementSeq += 1;
    this.judgement = { id: this.judgementSeq, text, color, kind };
  }

  private emit(): void {
    const snap = this.snapshot();
    for (const fn of this.listeners) fn(snap, this.judgement);
  }

  private frame(dt: number, pulseNow: number): void {
    if (!this.canvas || !this.ctx) return;
    this.view.resize(this.canvas, this.ctx);
    const now = this.playing ? this.gameTime() : 0;
    const D = this.diff();
    const approach = approachFor(D, this.modifiers);

    if (this.playing && !this.paused) {
      this.updateHolds(now);
      this.autoplay(now);
      for (const note of this.notes) {
        if (note.judged || note.holding) continue;
        if (now - note.time > D.miss) this.registerMiss(note);
      }
      if (this.health <= 0 && !this.modifiers.has('nofail')) {
        this.finish(true);
      } else if (!this.buffer && this.notes.length > 0 && now > this.chartEnd + 0.6) {
        if (this.notes.every((n) => n.judged)) this.finish(false);
      }
    }

    this.view.draw(this.ctx, {
      notes: this.notes,
      holds: [...this.holds.values()],
      playing: this.playing,
      paused: this.paused,
      now,
      approach,
      missWindow: D.miss,
      difficulty: D,
      modifiers: this.modifiers,
      health: this.health,
      chartEnd: this.chartEnd,
      songDuration: this.buffer ? this.buffer.duration : Math.max(this.chartEnd, 60),
      counts: this.counts,
      judgedNotes: this.judgedNotes,
      combo: this.combo,
      freq: this.audio.pullFrequency(),
      reducedMotion: this.reducedMotion,
    }, dt, pulseNow);
  }

  private async requestWakeLock(): Promise<void> {
    try {
      if ('wakeLock' in navigator) this.wakeLock = await navigator.wakeLock.request('screen');
    } catch { /* denied */ }
  }

  private releaseWakeLock(): void {
    try { void this.wakeLock?.release(); } catch { /* */ }
    this.wakeLock = null;
  }
}

function emptyCounts(): HitCounts {
  return { perfect: 0, good: 0, ok: 0, miss: 0, drop: 0 };
}

function vib(pattern: number | number[]): void {
  try { navigator.vibrate?.(pattern); } catch { /* unsupported */ }
}

export { comboColor };
