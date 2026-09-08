/**
 * Flow session. The audio clock is the timeline.
 *
 * gameTime = (ctx.currentTime - startTime) * speed + playOffset - offsetMs/1000
 * Pause = AudioContext.suspend(). Holds tick from that same clock.
 */
import { GameAudio } from './audio';
import { buildChart, describeBeats, describeChart, detectBeats, inferSections, previewBeats, previewSections } from './chart';
import { feverOnHit, feverOnMiss, feverTick } from './fever';
import { pickHitTarget } from './judge';
import { GameView, type ViewWorld } from './renderer';
import { accuracyPct, healthOnHit, judgeTiming } from './scoring';
import {
  COUNTDOWN_LEAD,
  DIFFICULTIES,
  HOLD_CLEAR_SCORE,
  HOLD_DROP_HEALTH,
  HOLD_TICK,
  HOLD_TICK_SCORE,
  PREVIEW_SONG,
  approachFor,
  emptyCounts,
  emptyFever,
  type ActiveHold,
  type ChartSection,
  type Difficulty,
  type DifficultyId,
  type FeverState,
  type GameResult,
  type HitCounts,
  type HitRing,
  type HudState,
  type ModifierId,
  type Note,
  type Particle,
  type PracticeSettings,
  type SongRef,
  type TimingSample,
} from './types';
import { resultFromRun } from './persistence';

export type EngineEvent =
  | { type: 'ready' }
  | { type: 'started' }
  | { type: 'paused'; paused: boolean }
  | { type: 'fever'; phase: FeverState['phase'] }
  | { type: 'finished'; result: GameResult };

export const DEFAULT_PRACTICE: PracticeSettings = {
  enabled: false,
  startAt: 0,
  loop: false,
  loopStart: 0,
  loopEnd: 0,
  speed: 1,
};

export class FlowEngine {
  audio = new GameAudio();
  view: GameView | null = null;

  song: SongRef = { ...PREVIEW_SONG };
  buffer: AudioBuffer | null = null;
  beats: number[] = [];
  sections: ChartSection[] = [];
  notes: Note[] = [];
  holds: ActiveHold[] = [];
  particles: Particle[] = [];
  rings: HitRing[] = [];
  timings: TimingSample[] = [];

  difficulty: DifficultyId = 'normal';
  modifiers = new Set<ModifierId>();
  offsetMs = 0;
  practice: PracticeSettings = { ...DEFAULT_PRACTICE };
  playOffset = 0;
  speed = 1;

  startTime = 0;
  playing = false;
  paused = false;
  finished = false;
  failed = false;
  auto = false;

  score = 0;
  combo = 0;
  maxCombo = 0;
  perfectChain = 0;
  perfectChainMax = 0;
  health = 100;
  earnedPoints = 0;
  judgedNotes = 0;
  counts: HitCounts = emptyCounts();
  fever: FeverState = emptyFever();
  lastFeverPhase: FeverState['phase'] = 'idle';

  judgeFlash = '';
  judgeColor = '#ffe7c2';
  judgeLife = 0;
  pulse = 0;
  shake = 0;
  lanePulse: [number, number] = [0, 0];
  comboPunch = 0;
  judgeScale = 1;
  lastHitError: number | null = null;
  best = 0;
  bestGrade = '—';
  beatInfo = '';
  chartInfo = '';
  status = 'Pick a song.';
  private holdSeq = 0;
  private lastFeverTick = 0;
  private lastLoopCheck = 0;

  onEvent: ((e: EngineEvent) => void) | null = null;

  d(): Difficulty {
    return DIFFICULTIES[this.difficulty];
  }

  approach(): number {
    return approachFor(this.d(), this.modifiers);
  }

  now(): number {
    if (!this.playing || !this.audio.ctx) return this.playOffset;
    return (this.audio.ctx.currentTime - this.startTime) * this.speed + this.playOffset - this.offsetMs / 1000;
  }

  attach(canvas: HTMLCanvasElement): void {
    this.view?.stop();
    this.view = new GameView(canvas, () => this.world());
    this.view.start();
  }

  detach(): void {
    this.view?.stop();
    this.view = null;
  }

  dispose(): void {
    this.detach();
    this.audio.close();
  }

  async loadPreview(): Promise<void> {
    await this.audio.ensure();
    this.song = { ...PREVIEW_SONG };
    this.buffer = null;
    this.beats = previewBeats();
    this.sections = previewSections();
    this.playOffset = 0;
    this.rebuild();
    this.status = 'Preview Beat is ready.';
    this.onEvent?.({ type: 'ready' });
  }

  async loadBuffer(song: SongRef, buffer: AudioBuffer): Promise<void> {
    await this.audio.ensure();
    this.song = song;
    this.buffer = buffer;
    this.beats = detectBeats(buffer);
    this.sections = inferSections(this.beats, buffer.duration);
    this.playOffset = 0;
    this.rebuild();
    this.status = 'Chart is ready.';
    this.onEvent?.({ type: 'ready' });
  }

  setDifficulty(id: DifficultyId): void {
    this.difficulty = id;
    if (this.beats.length) this.rebuild();
  }

  setModifiers(next: Iterable<ModifierId>): void {
    this.modifiers = new Set(next);
    this.auto = this.modifiers.has('auto');
    if (this.beats.length) this.rebuild();
  }

  setPractice(next: PracticeSettings): void {
    this.practice = { ...next };
    this.speed = next.enabled ? next.speed : 1;
  }

  rebuild(): void {
    this.notes = buildChart(this.beats, { difficulty: this.difficulty, modifiers: this.modifiers, sections: this.sections });
    const duration = this.buffer?.duration ?? this.song.duration ?? 56;
    this.beatInfo = describeBeats(this.beats, duration);
    this.chartInfo = describeChart(this.notes, this.sections);
    this.resetRun();
  }

  resetRun(): void {
    this.holds = [];
    this.particles = [];
    this.rings = [];
    this.timings = [];
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.perfectChain = 0;
    this.perfectChainMax = 0;
    this.health = 100;
    this.earnedPoints = 0;
    this.judgedNotes = 0;
    this.counts = emptyCounts();
    this.fever = emptyFever();
    this.lastFeverPhase = 'idle';
    this.playing = false;
    this.paused = false;
    this.finished = false;
    this.failed = false;
    this.judgeLife = 0;
    this.pulse = 0;
    this.shake = 0;
    this.lanePulse = [0, 0];
    this.comboPunch = 0;
    this.judgeScale = 1;
    this.lastHitError = null;
    this.playOffset = this.practice.enabled ? this.practice.startAt : 0;
    this.speed = this.practice.enabled ? this.practice.speed : 1;
    for (const n of this.notes) {
      n.hit = false;
      n.missed = false;
      n.judged = false;
      n.holding = false;
    }
  }

  async begin(): Promise<void> {
    await this.audio.ensure();
    this.audio.stopPreview();
    this.resetRun();
    const lead = COUNTDOWN_LEAD;
    const when = this.audio.now() + lead;
    this.startTime = when;
    this.playing = true;
    this.paused = false;
    this.status = 'Ready.';
    this.lastFeverTick = this.audio.now();
    if (this.buffer) {
      this.audio.playBuffer(this.buffer, when, {
        offset: this.playOffset,
        rate: this.speed,
        onEnded: () => {
          if (this.practice.enabled && this.practice.loop) return;
          this.finish(false);
        },
      });
    }
    this.onEvent?.({ type: 'started' });
  }

  async togglePause(): Promise<void> {
    if (!this.playing || this.finished) return;
    if (this.paused) {
      await this.audio.resume();
      this.paused = false;
      this.status = '';
    } else {
      await this.audio.suspend();
      this.paused = true;
      this.status = 'Paused.';
    }
    this.onEvent?.({ type: 'paused', paused: this.paused });
  }

  async stopSession(): Promise<void> {
    this.audio.stopMusic();
    if (this.paused) await this.audio.resume();
    this.playing = false;
    this.paused = false;
    this.finished = false;
    this.status = 'Stopped.';
  }

  get capturing(): boolean {
    return this.playing && !this.paused && !this.finished;
  }

  setOffset(ms: number): void {
    this.offsetMs = ms;
  }

  setVolume(volume: number): void {
    this.audio.setMaster(volume);
  }

  tap(id: string, lane: 0 | 1 | null): void {
    if (!this.playing || this.paused || this.finished) return;
    if (this.holds.some((h) => h.inputId === id)) return;
    const classic = this.modifiers.has('classic');
    if (classic && this.holds.length) return;

    const now = this.now();
    const d = this.d();
    const split = this.modifiers.has('split');
    const target = pickHitTarget(this.notes, now, d, lane, split);
    if (!target) return;
    if (target.early) {
      this.flash('TOO EARLY', '#b5aaa0');
      return;
    }

    const note = target.note;
    const difference = now - note.time;
    const judged = judgeTiming(difference, d);
    if (judged.kind === 'early') {
      this.flash(judged.label, judged.color);
      return;
    }
    if (judged.kind === 'late') return;
    if (judged.kind !== 'perfect' && judged.kind !== 'great' && judged.kind !== 'good') return;

    this.applyHit(note, judged.kind, judged.points, judged.label, judged.color, difference);
    if (note.duration > 0) this.beginHold(note, now, id);
  }

  release(id: string): void {
    const hold = this.holds.find((h) => h.inputId === id);
    if (!hold) return;
    const now = this.now();
    if (now + 0.04 >= hold.until) this.clearHold(hold, true);
    else this.clearHold(hold, false);
  }

  tick(): void {
    if (!this.playing || this.paused || this.finished) {
      this.advanceFx(0.016);
      return;
    }

    const now = this.now();
    const audioNow = this.audio.now();
    const dt = Math.min(0.05, Math.max(0, audioNow - this.lastFeverTick));
    this.lastFeverTick = audioNow;

    if (this.auto) this.autoplay(now);

    const prevPhase = this.fever.phase;
    this.fever = feverTick(this.fever, dt);
    if (this.fever.phase !== prevPhase) this.onEvent?.({ type: 'fever', phase: this.fever.phase });

    this.missPassed(now);
    this.tickHolds(now);
    this.maybeLoop(now);
    this.advanceFx(dt);

    if (!this.practice.enabled && this.health <= 0 && !this.modifiers.has('nofail')) {
      this.finish(true);
      return;
    }

    if (!this.buffer && now > 56) this.finish(false);
  }

  snapshot(): HudState {
    return {
      mode: this.finished ? 'result' : this.paused ? 'paused' : this.playing ? 'play' : 'prep',
      song: this.song,
      score: this.score,
      combo: this.combo,
      maxCombo: this.maxCombo,
      perfectChain: this.perfectChain,
      accuracy: accuracyPct(this.earnedPoints, this.judgedNotes),
      health: this.health,
      best: this.best,
      bestGrade: this.bestGrade,
      judgedNotes: this.judgedNotes,
      counts: { ...this.counts },
      fever: { ...this.fever },
      status: this.status,
      beatInfo: this.beatInfo,
      playing: this.playing,
      paused: this.paused,
      result: null,
      noteCount: this.notes.length,
      holdCount: this.notes.filter((n) => n.duration > 0).length,
      duration: this.buffer?.duration ?? this.song.duration ?? 56,
    };
  }

  buildResult(failed: boolean): GameResult {
    return resultFromRun({
      failed,
      song: this.song,
      difficulty: this.difficulty,
      modifiers: [...this.modifiers],
      speed: this.speed,
      score: this.score,
      accuracy: accuracyPct(this.earnedPoints, this.judgedNotes),
      maxCombo: this.maxCombo,
      perfectChainMax: this.perfectChainMax,
      feverPeak: this.fever.peak,
      feverActivations: this.fever.activations,
      counts: this.counts,
      practice: this.practice.enabled,
      isRecord: false,
      best: this.best,
    });
  }

  world(): ViewWorld {
    this.tick();
    const bands = this.playing && !this.paused ? this.audio.bands() : { bass: 0, level: 0 };
    return {
      now: this.now(),
      notes: this.notes,
      holds: this.holds,
      particles: this.particles,
      rings: this.rings,
      timings: this.timings,
      approach: this.approach(),
      hidden: this.modifiers.has('hidden'),
      sudden: this.modifiers.has('sudden'),
      score: this.score,
      combo: this.combo,
      maxCombo: this.maxCombo,
      perfectChain: this.perfectChain,
      health: this.health,
      accuracy: accuracyPct(this.earnedPoints, this.judgedNotes),
      fever: this.fever,
      best: this.best,
      playing: this.playing,
      paused: this.paused,
      finished: this.finished,
      countdown: this.playing && !!this.audio.ctx && this.audio.now() < this.startTime,
      countdownRemain: this.audio.ctx && this.playing ? Math.max(0, this.startTime - this.audio.now()) : 0,
      judgeFlash: this.judgeFlash,
      judgeColor: this.judgeColor,
      judgeLife: this.judgeLife,
      pulse: this.pulse,
      shake: this.shake,
      lanePulse: this.lanePulse,
      comboPunch: this.comboPunch,
      judgeScale: this.judgeScale,
      lastHitError: this.lastHitError,
      goodWindow: this.d().good,
      songTitle: this.song.title,
      songArtist: this.song.artist,
      difficulty: this.d().label,
      status: this.status,
      duration: this.buffer?.duration ?? this.song.duration ?? 56,
      playOffset: this.playOffset,
      speed: this.speed,
      bass: bands.bass,
      level: bands.level,
      section: this.currentSection(),
      practice: this.practice.enabled,
    };
  }

  private currentSection() {
    const t = this.now();
    for (const s of this.sections) if (t >= s.start && t < s.end) return s.kind;
    return this.sections[this.sections.length - 1]?.kind ?? 'verse';
  }

  private applyHit(note: Note, kind: 'perfect' | 'great' | 'good', points: number, label: string, color: string, error: number): void {
    note.hit = true;
    note.judged = true;
    this.judgedNotes += 1;
    this.earnedPoints += points;
    this.counts[kind] += 1;
    const mul = this.fever.multiplier;
    this.score += Math.round(points * this.d().scoreMul * mul);
    this.combo += 1;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    if (kind === 'perfect') {
      this.perfectChain += 1;
      this.perfectChainMax = Math.max(this.perfectChainMax, this.perfectChain);
    } else {
      this.perfectChain = 0;
    }
    this.health = healthOnHit(kind, this.health);
    const prev = this.fever.phase;
    this.fever = feverOnHit(this.fever, kind);
    if (this.fever.phase !== prev) {
      this.onEvent?.({ type: 'fever', phase: this.fever.phase });
      if (this.fever.phase === 'fever' || this.fever.phase === 'flow') this.audio.hit('fever');
    }
    this.lastHitError = error;
    this.timings.push({ error, kind });
    if (this.timings.length > 40) this.timings.shift();
    this.flash(label, color);
    this.pulse = kind === 'perfect' ? 1 : 0.62;
    this.lanePulse[note.lane] = kind === 'perfect' ? 1 : kind === 'great' ? 0.72 : 0.48;
    this.comboPunch = kind === 'perfect' ? 1 : 0.55;
    this.judgeScale = kind === 'perfect' ? 1.16 : kind === 'great' ? 1 : 0.9;
    const chord = note.chordGroup != null;
    const sfx = note.duration > 0 ? 'hold' : chord && kind === 'perfect' ? 'chord' : kind;
    this.audio.hit(sfx);
    this.burst(note.lane, color, kind === 'perfect' ? 12 : 7);
    if (this.combo === 10 || this.combo === 25 || this.combo === 50 || this.combo === 100) {
      this.burst(note.lane, '#ffe7c2', 14);
      this.pulse = 1;
    }
  }

  private missNote(note: Note): void {
    if (note.judged) return;
    note.missed = true;
    note.judged = true;
    this.judgedNotes += 1;
    this.counts.miss += 1;
    this.combo = 0;
    this.perfectChain = 0;
    this.health = Math.max(0, this.health - this.d().healthMiss);
    this.fever = feverOnMiss(this.fever);
    this.flash('MISS', '#ffb4ab');
    this.shake = 0.55;
    this.audio.hit('miss');
  }

  private missPassed(now: number): void {
    const late = this.d().miss;
    for (const note of this.notes) {
      if (note.judged || note.holding) continue;
      if (now - note.time > late) this.missNote(note);
    }
  }

  private beginHold(note: Note, now: number, inputId: string): void {
    note.holding = true;
    this.holds.push({
      note,
      id: `h${this.holdSeq++}`,
      inputId,
      until: note.time + note.duration,
      nextTick: now + HOLD_TICK,
    });
  }

  private tickHolds(now: number): void {
    for (const hold of [...this.holds]) {
      if (now >= hold.until) {
        this.clearHold(hold, true);
        continue;
      }
      if (now >= hold.nextTick) {
        this.score += HOLD_TICK_SCORE;
        hold.nextTick += HOLD_TICK;
      }
    }
  }

  private clearHold(hold: ActiveHold, success: boolean): void {
    this.holds = this.holds.filter((h) => h.id !== hold.id);
    hold.note.holding = false;
    if (success) {
      this.score += HOLD_CLEAR_SCORE;
      this.flash('CLEAR', '#ffe7c2');
      this.audio.hit('clear');
      this.lanePulse[hold.note.lane] = 0.85;
      this.burst(hold.note.lane, '#ffe7c2', 10);
    } else {
      this.counts.drop += 1;
      this.combo = 0;
      this.perfectChain = 0;
      this.health = Math.max(0, this.health - HOLD_DROP_HEALTH);
      this.fever = feverOnMiss(this.fever);
      this.flash('DROP', '#ffb4ab');
      this.audio.hit('drop');
    }
  }

  private autoplay(now: number): void {
    for (const note of this.notes) {
      if (note.judged || note.holding) continue;
      if (now >= note.time) {
        this.applyHit(note, 'perfect', 300, 'PERFECT', '#ffe7c2', 0);
        if (note.duration > 0) this.beginHold(note, now, 'auto');
      }
    }
  }

  private maybeLoop(now: number): void {
    if (!this.practice.enabled || !this.practice.loop || !this.buffer) return;
    const end = this.practice.loopEnd || this.buffer.duration;
    if (now < end) return;
    if (now - this.lastLoopCheck < 0.05) return;
    this.lastLoopCheck = now;
    const start = this.practice.loopStart;
    this.playOffset = start;
    this.startTime = this.audio.now();
    this.audio.playBuffer(this.buffer, this.startTime, {
      offset: start,
      rate: this.speed,
      onEnded: () => {
        if (this.practice.loop) return;
        this.finish(false);
      },
    });
    for (const n of this.notes) {
      if (n.time >= start) {
        n.hit = false;
        n.missed = false;
        n.judged = false;
        n.holding = false;
      }
    }
    this.holds = [];
  }

  private finish(failed: boolean): void {
    if (this.finished) return;
    this.finished = true;
    this.failed = failed;
    this.playing = false;
    this.audio.stopMusic();
    this.status = failed ? 'Dropped.' : 'Cleared.';
    this.onEvent?.({ type: 'finished', result: this.buildResult(failed) });
  }

  private flash(text: string, color: string): void {
    this.judgeFlash = text;
    this.judgeColor = color;
    this.judgeLife = 1;
  }

  private burst(lane: 0 | 1, color: string, n: number): void {
    const view = this.view;
    if (!view) return;
    const { x, y } = view.receptor(lane);
    this.rings.push({ x, y, r: 20, life: 1, color, width: 2.4 });
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 40 + Math.random() * 90;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 1,
        size: 1.4 + Math.random() * 2.2,
        color,
      });
    }
  }

  private advanceFx(dt: number): void {
    this.judgeLife = Math.max(0, this.judgeLife - dt * 1.6);
    this.pulse = Math.max(0, this.pulse - dt * 4);
    this.shake = Math.max(0, this.shake - dt * 6);
    this.lanePulse[0] = Math.max(0, this.lanePulse[0] - dt * 5.5);
    this.lanePulse[1] = Math.max(0, this.lanePulse[1] - dt * 5.5);
    this.comboPunch = Math.max(0, this.comboPunch - dt * 4.2);
    this.judgeScale += (1 - this.judgeScale) * Math.min(1, dt * 8);
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.9;
      p.vy *= 0.9;
      p.life -= dt * 1.8;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const r of this.rings) {
      r.r += dt * 90;
      r.life -= dt * 2.2;
    }
    this.rings = this.rings.filter((r) => r.life > 0);
  }
}
