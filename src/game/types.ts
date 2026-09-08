/**
 * Flow — ResonTune's rhythm game.
 *
 * Gameplay constants and types are ported from the standalone FLOW RHYTHM
 * engine in `/game.html` (v0.3.0). Timing windows, hold math, scoring and
 * the any-input rule are the source of truth; this module only names them.
 */

export const GAME_VERSION = '0.4.0';
export const GAME_HERITAGE = 'FLOW RHYTHM 0.3.0';

export type DifficultyId = 'easy' | 'normal' | 'hard';

export interface Difficulty {
  id: DifficultyId;
  label: string;
  /** Seconds a note spends approaching the receptor. */
  approach: number;
  perfect: number;
  good: number;
  ok: number;
  miss: number;
  healthMiss: number;
  scoreMul: number;
}

/** Copied verbatim from game.html. */
export const DIFFICULTIES: Record<DifficultyId, Difficulty> = {
  easy: { id: 'easy', label: 'Easy', approach: 2.20, perfect: 0.078, good: 0.145, ok: 0.215, miss: 0.265, healthMiss: 12, scoreMul: 0.80 },
  normal: { id: 'normal', label: 'Normal', approach: 1.70, perfect: 0.060, good: 0.120, ok: 0.185, miss: 0.220, healthMiss: 18, scoreMul: 1.00 },
  hard: { id: 'hard', label: 'Hard', approach: 1.25, perfect: 0.048, good: 0.098, ok: 0.150, miss: 0.190, healthMiss: 26, scoreMul: 1.25 },
};

export const HOLD_MIN_GAP = 0.85;
export const HOLD_TICK = 0.12;
export const HOLD_TICK_SCORE = 20;
export const HOLD_CLEAR_SCORE = 150;
export const HOLD_DROP_HEALTH = 10;

export const HIT_PERFECT = 300;
export const HIT_GOOD = 200;
export const HIT_OK = 100;

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
  { id: 'classic', label: 'Classic', hint: 'A hold occupies every input, like FLOW 0.3' },
  { id: 'dual', label: 'Dual', hint: 'Overlapping holds and chords on both lanes' },
  { id: 'hidden', label: 'Hidden', hint: 'Notes fade before the receptor' },
  { id: 'sudden', label: 'Sudden', hint: 'Notes appear late' },
  { id: 'fast', label: 'Fast', hint: 'Shorter approach time' },
  { id: 'slow', label: 'Slow', hint: 'Longer approach time' },
  { id: 'nofail', label: 'No Fail', hint: 'Health never ends the song' },
  { id: 'auto', label: 'Auto', hint: 'The chart plays itself' },
  { id: 'mirror', label: 'Mirror', hint: 'Swap upper and lower lanes' },
];

export type HitKind = 'perfect' | 'good' | 'ok' | 'miss' | 'drop';

export type JudgementKind = 'perfect' | 'good' | 'ok' | 'miss' | 'drop' | 'early' | 'late' | 'clear' | 'info';

export interface Note {
  id: number;
  time: number;
  lane: 0 | 1;
  duration: number;
  hit: boolean;
  missed: boolean;
  judged: boolean;
  holding: boolean;
  /** True when this note was generated as a same-time pair. */
  chord: boolean;
}

export interface ActiveHold {
  note: Note;
  id: string;
  until: number;
  nextTick: number;
}

export interface HitCounts {
  perfect: number;
  good: number;
  ok: number;
  miss: number;
  drop: number;
}

export interface Grade {
  text: string;
  color: string;
}

export interface SongRef {
  key: string;
  name: string;
  kind: 'preview' | 'file' | 'local';
  localId?: string;
}

export interface GameResult {
  failed: boolean;
  song: string;
  songKey: string;
  difficulty: DifficultyId;
  modifiers: ModifierId[];
  score: number;
  accuracy: number;
  maxCombo: number;
  counts: HitCounts;
  grade: Grade;
  isRecord: boolean;
  best: number;
}

export interface HudState {
  score: number;
  combo: number;
  maxCombo: number;
  accuracy: number;
  health: number;
  best: number;
  judgedNotes: number;
  counts: HitCounts;
  status: string;
  beatInfo: string;
  songName: string;
  playing: boolean;
  paused: boolean;
  result: GameResult | null;
}

export interface JudgementEvent {
  id: number;
  text: string;
  color: string;
  kind: JudgementKind;
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
}

export interface TimingSample {
  error: number;
  kind: HitKind;
}

export interface ChartOptions {
  difficulty: DifficultyId;
  modifiers: ReadonlySet<ModifierId>;
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
