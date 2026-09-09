import { describe, expect, it } from 'vitest';
import { accuracyPct, gradeFor, healthOnHit, judgeTiming } from './scoring';
import { DIFFICULTIES, HIT_GOOD, HIT_GREAT, HIT_PERFECT } from './types';

const N = DIFFICULTIES.normal;

describe('timing windows (FLOW 0.3 Normal)', () => {
  it('awards PERFECT / GREAT / GOOD inside the original windows', () => {
    expect(judgeTiming(0, N)).toMatchObject({ kind: 'perfect', points: HIT_PERFECT });
    expect(judgeTiming(N.perfect, N).kind).toBe('perfect');
    expect(judgeTiming(N.great, N).kind).toBe('great');
    expect(judgeTiming(N.good, N).kind).toBe('good');
    expect(judgeTiming(N.great, N).points).toBe(HIT_GREAT);
    expect(judgeTiming(N.good, N).points).toBe(HIT_GOOD);
  });

  it('rejects too-early taps without consuming the note', () => {
    const j = judgeTiming(-N.good - 0.001, N);
    expect(j.kind).toBe('early');
    expect(j.points).toBe(0);
  });

  it('marks taps past the miss window as late', () => {
    const j = judgeTiming(N.miss + 0.001, N);
    expect(j.kind).toBe('late');
    expect(j.points).toBe(0);
  });
});

describe('accuracy and grades', () => {
  it('is 100% with no judgements, then earned / (n * 300)', () => {
    expect(accuracyPct(0, 0)).toBe(100);
    expect(accuracyPct(300, 1)).toBe(100);
    expect(accuracyPct(200, 1)).toBeCloseTo((200 / 300) * 100);
    expect(accuracyPct(300 + 200 + 100, 3)).toBeCloseTo((600 / 900) * 100);
  });

  it('maps the original SS–F thresholds', () => {
    expect(gradeFor(99.5, false).text).toBe('SS');
    expect(gradeFor(95, false).text).toBe('S');
    expect(gradeFor(88, false).text).toBe('A');
    expect(gradeFor(78, false).text).toBe('B');
    expect(gradeFor(65, false).text).toBe('C');
    expect(gradeFor(50, false).text).toBe('D');
    expect(gradeFor(49, false).text).toBe('F');
    expect(gradeFor(100, true).text).toBe('F');
  });

  it('restores a little health on a hit', () => {
    expect(healthOnHit('perfect', 90)).toBe(93);
    expect(healthOnHit('great', 99)).toBe(100);
    expect(healthOnHit('good', 50)).toBe(51);
  });
});
