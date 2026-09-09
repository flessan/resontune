import { describe, expect, it } from 'vitest';
import { activeLineIndex, looksSynced, parseLrc } from './lrc';

const SAMPLE = `[ar:Resona]
[ti:Night Drive]
[00:12.40]Headlights on the wet asphalt
[00:17.85]Counting mile markers home
[00:24.00]
[00:31.02]The radio hums an old refrain`;

describe('LRC parsing', () => {
  it('parses timestamped lines and skips metadata tags', () => {
    const lines = parseLrc(SAMPLE);
    expect(lines).toHaveLength(4);
    expect(lines[0]).toEqual({ time: 12.4, text: 'Headlights on the wet asphalt' });
    expect(lines[2]).toEqual({ time: 24, text: '' }); // instrumental gap keeps its slot
    expect(lines[3].time).toBeCloseTo(31.02);
  });

  it('supports multiple timestamps on one line (repeated chorus)', () => {
    const lines = parseLrc('[00:10.00][01:10.00]Same chorus line');
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.time)).toEqual([10, 70]);
    expect(lines[0].text).toBe('Same chorus line');
  });

  it('sorts out-of-order stamps and tolerates 2/3-digit fractions', () => {
    const lines = parseLrc('[00:30]Later\n[00:05.123]Earlier');
    expect(lines[0].text).toBe('Earlier');
    expect(lines[0].time).toBeCloseTo(5.123);
    expect(lines[1].time).toBe(30);
  });

  it('returns [] for plain text, garbage, null and undefined', () => {
    expect(parseLrc('Just some plain lyrics\nwith lines')).toEqual([]);
    expect(parseLrc('[not-a-tag] hello')).toEqual([]);
    expect(parseLrc(null)).toEqual([]);
    expect(parseLrc(undefined)).toEqual([]);
    expect(parseLrc('')).toEqual([]);
  });

  it('rejects impossible seconds', () => {
    expect(parseLrc('[00:99.00]bad clock')).toEqual([]);
  });

  it('looksSynced distinguishes synced from plain text', () => {
    expect(looksSynced(SAMPLE)).toBe(true);
    expect(looksSynced('la la la')).toBe(false);
  });
});

describe('active line lookup', () => {
  const lines = parseLrc(SAMPLE);

  it('is -1 before the first line and progresses with the clock', () => {
    expect(activeLineIndex(lines, 0)).toBe(-1);
    expect(activeLineIndex(lines, 12.4)).toBe(0);
    expect(activeLineIndex(lines, 20)).toBe(1);
    expect(activeLineIndex(lines, 500)).toBe(3);
  });

  it('answers correctly after an arbitrary seek in either direction', () => {
    expect(activeLineIndex(lines, 32)).toBe(3); // seek forward
    expect(activeLineIndex(lines, 13)).toBe(0); // seek back
    expect(activeLineIndex(lines, 5)).toBe(-1); // seek before the intro
  });

  it('handles empty input and bad clocks', () => {
    expect(activeLineIndex([], 10)).toBe(-1);
    expect(activeLineIndex(lines, NaN)).toBe(-1);
  });
});
