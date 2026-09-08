/**
 * Flow — ResonTune's rhythm game.
 *
 * Timing windows, hold-gap math and the audio-clock contract come from
 * FLOW RHYTHM (`game.html`). Chart language, Fever, session flow and
 * presentation are the ResonTune redesign.
 */

export const GAME_VERSION = '0.5.0';
export const CHART_VERSION = 3;
export const GAME_HERITAGE = 'FLOW RHYTHM 0.3.0';

export type DifficultyId = 'easy' | 'normal' | 'hard';

export interface Difficulty {
  id: DifficultyId;
  label: string;
  approach: number;
  perfect: number;
  great: number;
  good: number;
  miss: number;
  healthMiss: number;
  scoreMul: number;
}

/** Windows match FLOW 0.3 (great ← good, good ← ok). */
export const DIFFICULTIES: Record<DifficultyId, Difficulty> = {
  easy: { id: 'easy', label: 'Easy', approach: 2.20, perfect: 0.078, great: 0.145, good: 0.215, miss: 0.265, healthMiss: 12, scoreMul: 0.80 },
  normal: { id: 'normal', label: 'Normal', approach: 1.70, perfect: 0.060, great: 0.120, good: 0.185, miss: 0.220, healthMiss: 18, scoreMul: 1.00 },
  hard: { id: 'hard', label: 'Hard', approach: 1.25, perfect: 0.048, great: 0.098, good: 0.150, miss: 0.190, healthMiss: 26, scoreMul: 1.25 },
};

export const HOLD_MIN_GAP = 0.85;
export const HOLD_TICK = 0.12;
export const HOLD_TICK_SCORE = 20;
export const HOLD_CLEAR_SCORE = 150;
export const HOLD_DROP_HEALTH = 10;

export const HIT_PERFECT = 300;
export const HIT_GREAT = 200;
export const HIT_GOOD = 100;

export const COUNTDOWN_LEAD = 3.2;

export type ModifierId =
  | 'split'
  | 'classic'
  | 'dual'
  | 'hidden'
  | 'sudden'
  | 'nofail'
  | 'mirror'
  | 'fast'
  | 'slow'
  | 'auto';

export const MODIFIERS: { id: ModifierId; label: string; hint: string }[] = [
  { id: 'split', label: 'Split', hint: 'Upper / lower lanes take their own input' },
  { id: 'classic', label: 'Classic', hint: 'A hold occupies every input' },
  { id: 'dual', label: 'Dual', hint: 'More chords and overlapping holds' },
  { id: 'hidden', label: 'Hidden', hint: 'Notes fade before the receptor' },
  { id: 'sudden', label: 'Sudden', hint: 'Notes appear late' },
  { id: 'fast', label: 'Fast', hint: 'Shorter approach time' },
  { id: 'slow', label: 'Slow', hint: 'Longer approach time' },
  { id: 'nofail', label: 'No Fail', hint: 'Health never ends the song' },
  { id: 'auto', label: 'Auto', hint: 'The chart plays itself' },
  { id: 'mirror', label: 'Mirror', hint: 'Swap upper and lower lanes' },
];

export type HitKind = 'perfect' | 'great' | 'good' | 'miss' | 'drop';
export type JudgementKind = HitKind | 'early' | 'late' | 'clear' | 'fever' | 'flow' | 'info';

export type SectionKind = 'intro' | 'verse' | 'build' | 'chorus' | 'break' | 'drop' | 'outro';

export interface ChartSection {
  kind: SectionKind;
  start: number;
  end: number;
}

export interface Note {
  id: number;
  time: number;
  lane: 0 | 1;
  duration: number;
  hit: boolean;
  missed: boolean;
  judged: boolean;
  holding: boolean;
  /** Same-time partner group. Both notes must be hit with distinct inputs. */
  chordGroup: number | null;
  section: SectionKind;
}

export interface ActiveHold {
  note: Note;
  id: string;
  inputId: string;
  until: number;
  nextTick: number;
}

export interface HitCounts {
  perfect: number;
  great: number;
  good: number;
  miss: number;
  drop: number;
}

export interface Grade {
  text: string;
  color: string;
}

export type SongKind = 'preview' | 'file' | 'local' | 'catalog';

export interface SongRef {
  key: string;
  title: string;
  artist: string;
  kind: SongKind;
  localId?: string;
  trackId?: string;
  trackSlug?: string;
  artworkUrl?: string | null;
  duration?: number | null;
}

export type FeverPhase = 'idle' | 'fever' | 'flow';

export interface FeverState {
  meter: number;
  phase: FeverPhase;
  timeLeft: number;
  multiplier: number;
  activations: number;
  peak: FeverPhase;
}

export interface PracticeSettings {
  enabled: boolean;
  startAt: number;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  speed: number;
}

export interface GameResult {
  failed: boolean;
  song: SongRef;
  difficulty: DifficultyId;
  modifiers: ModifierId[];
  speed: number;
  score: number;
  accuracy: number;
  maxCombo: number;
  perfectChainMax: number;
  feverPeak: FeverPhase;
  feverActivations: number;
  counts: HitCounts;
  grade: Grade;
  isRecord: boolean;
  best: number;
  practice: boolean;
}

export type SessionMode = 'select' | 'prep' | 'play' | 'paused' | 'result';

export interface HudState {
  mode: SessionMode;
  song: SongRef;
  score: number;
  combo: number;
  maxCombo: number;
  perfectChain: number;
  accuracy: number;
  health: number;
  best: number;
  bestGrade: string;
  judgedNotes: number;
  counts: HitCounts;
  fever: FeverState;
  status: string;
  beatInfo: string;
  playing: boolean;
  paused: boolean;
  result: GameResult | null;
  noteCount: number;
  holdCount: number;
  duration: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
  color: string;
}

export interface HitRing {
  x: number;
  y: number;
  r: number;
  life: number;
  color: string;
  width: number;
}

export interface TimingSample {
  error: number;
  kind: HitKind;
}

export interface ChartOptions {
  difficulty: DifficultyId;
  modifiers: ReadonlySet<ModifierId>;
  sections?: ChartSection[];
}

export function approachFor(d: Difficulty, modifiers: ReadonlySet<ModifierId>): number {
  let a = d.approach;
  if (modifiers.has('fast')) a *= 0.72;
  if (modifiers.has('slow')) a *= 1.38;
  return a;
}

export function modifierKey(modifiers: ReadonlySet<ModifierId> | Iterable<ModifierId>): string {
  return [...modifiers].filter((id) => id !== 'auto').sort().join('+') || 'none';
}

export function emptyCounts(): HitCounts {
  return { perfect: 0, great: 0, good: 0, miss: 0, drop: 0 };
}

export function emptyFever(): FeverState {
  return { meter: 0, phase: 'idle', timeLeft: 0, multiplier: 1, activations: 0, peak: 'idle' };
}

export const PREVIEW_SONG: SongRef = {
  key: 'preview',
  title: 'Preview Beat',
  artist: 'Flow Metronome',
  kind: 'preview',
  duration: 56,
};
