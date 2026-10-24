/**
 * Pure hit-target selection. Timing still comes from the caller (audio clock).
 *
 * Chords: two notes share `chordGroup` and the same time. Each input consumes
 * one of them; a second distinct input is required for the partner.
 */
import type { Difficulty, Note } from './types';

export function pickHitTarget(
  notes: Note[],
  now: number,
  d: Difficulty,
  laneHint: 0 | 1 | null,
  split: boolean,
): { note: Note; early: boolean } | null {
  for (const note of notes) {
    if (note.judged || note.holding) continue;
    if (split && laneHint != null && note.lane !== laneHint) continue;

    const difference = now - note.time;
    if (difference < -d.good) return { note, early: true };
    if (difference > d.miss) continue;
    return { note, early: false };
  }
  return null;
}
