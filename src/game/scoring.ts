/**
 * Scoring, accuracy and grades.
 *
 * Windows are FLOW 0.3; labels are Perfect / Great / Good.
 * Accuracy uses tap/head judgements only (earned / judged * 300).
 */
import {
  DIFFICULTIES,
  HIT_GOOD,
  HIT_GREAT,
  HIT_PERFECT,
  type Difficulty,
  type Grade,
  type HitKind,
} from './types';

export interface TimingJudge {
  kind: HitKind | 'early' | 'late';
  label: string;
  color: string;
  points: number;
}

export const JUDGEMENT_COLORS = {
  perfect: '#f4e4c1',
  great: '#e8b48a',
  good: '#c9a27a',
  miss: '#d98980',
  drop: '#d98980',
  early: '#b5aaa0',
  clear: '#f4e4c1',
  fever: '#f0c36b',
  flow: '#ffe7b0',
};

export function judgeTiming(difference: number, d: Difficulty): TimingJudge {
  if (difference < -d.good) {
    return { kind: 'early', label: 'TOO EARLY', color: JUDGEMENT_COLORS.early, points: 0 };
  }
  if (difference > d.miss) {
    return { kind: 'late', label: 'TOO LATE', color: JUDGEMENT_COLORS.miss, points: 0 };
  }
  const timing = Math.abs(difference);
  if (timing <= d.perfect) {
    return { kind: 'perfect', label: 'PERFECT', color: JUDGEMENT_COLORS.perfect, points: HIT_PERFECT };
  }
  if (timing <= d.great) {
    return { kind: 'great', label: 'GREAT', color: JUDGEMENT_COLORS.great, points: HIT_GREAT };
  }
  return { kind: 'good', label: 'GOOD', color: JUDGEMENT_COLORS.good, points: HIT_GOOD };
}

export function accuracyPct(earnedPoints: number, judgedNotes: number): number {
  if (judgedNotes <= 0) return 100;
  return (earnedPoints / (judgedNotes * HIT_PERFECT)) * 100;
}

export function healthOnHit(kind: HitKind, health: number): number {
  const add = kind === 'perfect' ? 3 : kind === 'great' ? 2 : kind === 'good' ? 1 : 0;
  return Math.min(100, health + add);
}

export function comboColor(combo: number, fever = false): string {
  if (fever) return '#f0c36b';
  if (combo >= 50) return '#f4e4c1';
  if (combo >= 25) return '#e8b48a';
  return '#efeae0';
}

export function gradeFor(accuracy: number, failed: boolean): Grade {
  if (failed) return { text: 'F', color: '#d98980' };
  if (accuracy >= 99.5) return { text: 'SS', color: '#f4e4c1' };
  if (accuracy >= 95) return { text: 'S', color: '#f4e4c1' };
  if (accuracy >= 88) return { text: 'A', color: '#e8b48a' };
  if (accuracy >= 78) return { text: 'B', color: '#c9a27a' };
  if (accuracy >= 65) return { text: 'C', color: '#c9a27a' };
  if (accuracy >= 50) return { text: 'D', color: '#d4a574' };
  return { text: 'F', color: '#d98980' };
}

export { DIFFICULTIES };
