import { describe, expect, it } from 'vitest';
import { pickHitTarget } from './judge';
import { DIFFICULTIES, type Note } from './types';

function note(partial: Partial<Note> & Pick<Note, 'id' | 'time' | 'lane'>): Note {
  return {
    duration: 0,
    hit: false,
    missed: false,
    judged: false,
    holding: false,
    chordGroup: null,
    section: 'verse',
    ...partial,
  };
}

const N = DIFFICULTIES.normal;

describe('hit target selection', () => {
  it('does not consume a note that is still too early', () => {
    const notes = [note({ id: 0, time: 2, lane: 0 })];
    const hit = pickHitTarget(notes, 2 - N.good - 0.05, N, null, false);
    expect(hit?.early).toBe(true);
    expect(notes[0].judged).toBe(false);
  });

  it('picks the first note inside the window', () => {
    const notes = [note({ id: 0, time: 1, lane: 0 }), note({ id: 1, time: 1.5, lane: 1 })];
    const hit = pickHitTarget(notes, 1.01, N, null, false);
    expect(hit?.note.id).toBe(0);
    expect(hit?.early).toBe(false);
  });

  it('requires a second tap for the other half of a chord', () => {
    const notes = [
      note({ id: 0, time: 1, lane: 0, chordGroup: 1 }),
      note({ id: 1, time: 1, lane: 1, chordGroup: 1 }),
    ];
    const first = pickHitTarget(notes, 1, N, null, false);
    expect(first?.note.lane).toBe(0);
    first!.note.judged = true;
    const second = pickHitTarget(notes, 1, N, null, false);
    expect(second?.note.lane).toBe(1);
  });

  it('honours Split lane hints', () => {
    const notes = [note({ id: 0, time: 1, lane: 0 }), note({ id: 1, time: 1.02, lane: 1 })];
    const hit = pickHitTarget(notes, 1.02, N, 1, true);
    expect(hit?.note.id).toBe(1);
  });
});
