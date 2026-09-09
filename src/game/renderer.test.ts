import { describe, expect, it } from 'vitest';
import { noteVisible } from './renderer';
import type { Note } from './types';

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

describe('hold visibility', () => {
  it('keeps a judged hold on stage while it is still being held', () => {
    const hold = note({
      id: 0,
      time: 2,
      lane: 0,
      duration: 1.3,
      judged: true,
      hit: true,
      holding: true,
    });
    expect(noteVisible(hold, 2.5, 1.2)).toBe(true);
    expect(noteVisible(hold, 3.1, 1.2)).toBe(true);
  });

  it('removes the hold only after it is no longer holding', () => {
    const hold = note({
      id: 0,
      time: 2,
      lane: 0,
      duration: 1.3,
      judged: true,
      hit: true,
      holding: false,
    });
    expect(noteVisible(hold, 2.5, 1.2)).toBe(false);
  });

  it('does not cull an approaching hold by its head time alone', () => {
    const hold = note({ id: 1, time: 4, lane: 1, duration: 1.3 });
    expect(noteVisible(hold, 3.2, 1.2)).toBe(true);
  });

  it('hides judged taps immediately', () => {
    const tap = note({ id: 2, time: 1, lane: 0, judged: true, hit: true });
    expect(noteVisible(tap, 1.05, 1.2)).toBe(false);
  });
});
