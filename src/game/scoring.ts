/**
 * Scoring, accuracy and grades — formulas copied from game.html.
 *
 * Accuracy uses only tap/head judgements (earnedPoints / judgedNotes * 300).
 * Hold ticks and CLEAR bonuses add score and combo but do not change accuracy.
 */
import {
  DIFFICULTIES,
  HIT_GOOD,
  HIT_OK,
  HIT_PERFECT,
  type Difficulty,
  type Grade,
  type HitKind,
  type JudgementKind,
} from './types';

export interface TimingJudge {
  kind: HitKind | 'early' | 'late';
  label: string;
  color: string;
  points: number;
}

const COLORS = {
  perfect: '#68f5d1',
  good: '#719cff',
  ok: '#ffd46b',
  miss: '#ff667d',
  drop: '#ff667d',
  early: '#aeb8c9',
  clear: '#68f5d1',
};

export function judgeTiming(difference: number, d: Difficulty): TimingJudge {
  if (difference < -d.ok) {
    return { kind: 'early', label: 'TOO EARLY', color: COLORS.early, points: 0 };
  }
  if (difference > d.miss) {
    return { kind: 'late', label: 'TOO LATE', color: COLORS.miss, points: 0 };
  }
  const timing = Math.abs(difference);
  if (timing <= d.perfect) {
    return { kind: 'perfect', label: 'PERFECT', color: COLORS.perfect, points: HIT_PERFECT };
  }
  if (timing <= d.good) {
    return { kind: 'good', label: 'GOOD', color: COLORS.good, points: HIT_GOOD };
  }
  return { kind: 'ok', label: 'OK', color: COLORS.ok, points: HIT_OK };
}

export function accuracyPct(earnedPoints: number, judgedNotes: number): number {
  if (judgedNotes <= 0) return 100;
  return (earnedPoints / (judgedNotes * HIT_PERFECT)) * 100;
}

export function healthOnHit(kind: HitKind, health: number): number {
  const add = kind === 'perfect' ? 3 : kind === 'good' ? 2 : kind === 'ok' ? 1 : 0;
  return Math.min(100, health + add);
}

export function comboColor(combo: number): string {
  if (combo >= 50) return '#ff75c5';
  if (combo >= 25) return '#ffd46b';
  return '#68f5d1';
}

export function gradeFor(accuracy: number, failed: boolean): Grade {
  if (failed) return { text: 'F', color: '#ff667d' };
  if (accuracy >= 99.5) return { text: 'SS', color: '#68f5d1' };
  if (accuracy >= 95) return { text: 'S', color: '#68f5d1' };
  if (accuracy >= 88) return { text: 'A', color: '#719cff' };
  if (accuracy >= 78) return { text: 'B', color: '#ffd46b' };
  if (accuracy >= 65) return { text: 'C', color: '#ffd46b' };
  if (accuracy >= 50) return { text: 'D', color: '#ff9f6b' };
  return { text: 'F', color: '#ff667d' };
}

export function judgementKind(kind: TimingJudge['kind'] | 'drop' | 'clear'): JudgementKind {
  if (kind === 'late') return 'late';
  return kind;
}

export { COLORS as JUDGEMENT_COLORS, DIFFICULTIES };
