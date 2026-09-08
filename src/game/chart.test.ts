import { describe, expect, it } from 'vitest';
import {
  buildChart,
  buildNotes,
  chartEndOf,
  countHolds,
  densifyBeats,
  detectBeats,
  holdDurationForGap,
  previewBeatTimes,
  previewSections,
} from './chart';
import { HOLD_MIN_GAP } from './types';

describe('preview beat (FLOW 0.3)', () => {
  it('emits 120 BPM quarters with a hold-sized gap every 8th note', () => {
    const times = previewBeatTimes();
    expect(times[0]).toBe(1);
    expect(times.at(-1)!).toBeLessThan(56);

    const gaps = times.slice(1).map((t, i) => t - times[i]);
    const wide = gaps.filter((g) => g === 1.75);
    const tight = gaps.filter((g) => g === 0.5);
    expect(wide.length).toBeGreaterThan(0);
    expect(tight.length).toBeGreaterThan(wide.length);
    expect(gaps.every((g) => g === 0.5 || g === 1.75)).toBe(true);
  });

  it('turns those wide gaps into holds with the original duration formula', () => {
    const times = previewBeatTimes();
    const end = times[times.length - 1] + 2;
    expect(countHolds(times, end)).toBeGreaterThan(0);
    expect(holdDurationForGap(0.5)).toBe(0);
    expect(holdDurationForGap(HOLD_MIN_GAP)).toBeCloseTo(Math.min(1.4, Math.max(0.4, HOLD_MIN_GAP - 0.45)));
    expect(holdDurationForGap(1.75)).toBeCloseTo(1.3);
  });
});

describe('beat detection', () => {
  it('falls back to a 0.5s grid when the signal has no peaks', () => {
    const sampleRate = 44100;
    const duration = 4;
    const samples = new Float32Array(sampleRate * duration);
    const beats = detectBeats({
      getChannelData: () => samples,
      sampleRate,
      duration,
    });
    expect(beats[0]).toBe(1);
    expect(beats.every((t, i) => i === 0 || t - beats[i - 1] === 0.5)).toBe(true);
  });

  it('picks isolated energy peaks above the local average', () => {
    const sampleRate = 44100;
    const duration = 12;
    const samples = new Float32Array(sampleRate * duration);
    for (let t = 1; t <= 10; t++) {
      const i = Math.floor(t * sampleRate);
      for (let k = 0; k < 800; k++) samples[i + k] = 1;
    }
    const beats = detectBeats({
      getChannelData: () => samples,
      sampleRate,
      duration,
    });
    expect(beats.length).toBeGreaterThanOrEqual(4);
    expect(beats[0]).toBeGreaterThan(0.7);
    expect(beats[0]).toBeLessThan(1.4);
  });
});

describe('chart construction', () => {
  it('alternates lanes on Easy and preserves hold tails', () => {
    const times = [1, 1.5, 2, 3.8, 4.3];
    const notes = buildNotes(times, 6, { difficulty: 'easy', modifiers: new Set() });
    expect(notes.map((n) => n.lane)).toEqual([0, 1, 0, 1, 0]);
    const hold = notes.find((n) => n.time === 2);
    expect(hold?.duration).toBeCloseTo(holdDurationForGap(1.8));
    expect(chartEndOf(notes)).toBeGreaterThan(2);
  });

  it('mirrors lanes when the Mirror modifier is on', () => {
    const times = [1, 1.5, 2, 2.5];
    const notes = buildNotes(times, 4, { difficulty: 'easy', modifiers: new Set(['mirror']) });
    expect(notes.map((n) => n.lane)).toEqual([1, 0, 1, 0]);
  });

  it('densifies Hard without eating hold-worthy gaps', () => {
    const times = [1, 1.5, 3.2];
    const dense = densifyBeats(times, 'hard');
    expect(dense.some((t) => t > 1 && t < 1.5)).toBe(true);
    expect(dense.filter((t) => t > 1.5 && t < 3.2)).toHaveLength(0);
    expect(densifyBeats(times, 'normal')).toEqual(times);
  });

  it('adds overlapping holds and chords only with Dual', () => {
    const times = previewBeatTimes().slice(0, 24);
    const end = times[times.length - 1] + 2;
    const base = buildNotes(times, end, { difficulty: 'hard', modifiers: new Set() });
    const dual = buildNotes(times, end, { difficulty: 'hard', modifiers: new Set(['dual']) });
    expect(dual.length).toBeGreaterThanOrEqual(base.length);
  });

  it('phrases Preview Beat and puts real chords on chorus/drop', () => {
    const times = previewBeatTimes();
    const sections = previewSections();
    const easy = buildChart(times, { difficulty: 'easy', modifiers: new Set(), sections });
    const hard = buildChart(times, { difficulty: 'hard', modifiers: new Set(), sections });
    expect(easy.every((n) => n.chordGroup == null)).toBe(true);
    expect(hard.some((n) => n.chordGroup != null && n.section === 'chorus')).toBe(true);
    const group = hard.find((n) => n.chordGroup != null)!.chordGroup;
    const pair = hard.filter((n) => n.chordGroup === group);
    expect(pair).toHaveLength(2);
    expect(new Set(pair.map((n) => n.lane)).size).toBe(2);
    expect(pair[0].time).toBe(pair[1].time);
  });

  it('can occupy both lanes with a dual hold', () => {
    const notes = buildChart([1, 2.2], {
      difficulty: 'normal',
      modifiers: new Set(['classic']),
      sections: [{ kind: 'chorus', start: 0, end: 8 }],
    });
    const heads = notes.filter((n) => n.time === 1);
    expect(heads).toHaveLength(2);
    expect(heads.every((n) => n.duration > 0)).toBe(true);
    expect(heads.map((n) => n.lane).sort()).toEqual([0, 1]);
  });
});
