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

  it('weaves a tap on the other lane during a Normal hold', () => {
    const notes = buildChart([1, 2.8], {
      difficulty: 'normal',
      modifiers: new Set(),
      sections: [{ kind: 'verse', start: 0, end: 10 }],
    });
    const hold = notes.find((n) => n.duration > 0 && n.time === 1);
    expect(hold).toBeTruthy();
    const during = notes.filter((n) => n.duration === 0 && n.time > 1 && n.time < 1 + hold!.duration);
    expect(during.length).toBeGreaterThan(0);
    expect(during.some((n) => n.lane !== hold!.lane)).toBe(true);
  });

  it('places a tap between sequential holds', () => {
    const notes = buildChart([1, 1.85, 2.7], {
      difficulty: 'normal',
      modifiers: new Set(),
      sections: [{ kind: 'verse', start: 0, end: 10 }],
    });
    const holds = notes.filter((n) => n.duration > 0).sort((a, b) => a.time - b.time);
    expect(holds.length).toBeGreaterThanOrEqual(2);
    const between = notes.filter((n) => n.duration === 0 && n.time > holds[0].time && n.time < holds[1].time);
    expect(between.length).toBeGreaterThan(0);
  });

  it('alternates verse holds across lanes on Normal', () => {
    const notes = buildChart([1, 2.8, 4.6], {
      difficulty: 'normal',
      modifiers: new Set(),
      sections: [{ kind: 'verse', start: 0, end: 10 }],
    });
    const holds = notes.filter((n) => n.duration > 0).sort((a, b) => a.time - b.time);
    expect(holds.length).toBeGreaterThanOrEqual(2);
    expect(holds[0].lane).not.toBe(holds[1].lane);
  });

  it('keeps Normal chorus holds on one lane unless Dual or Classic is on', () => {
    const notes = buildChart([1, 2.2], {
      difficulty: 'normal',
      modifiers: new Set(),
      sections: [{ kind: 'chorus', start: 0, end: 8 }],
    });
    expect(notes.filter((n) => n.time === 1 && n.duration > 0)).toHaveLength(1);
  });

  it('places simultaneous dual holds on Hard chorus', () => {
    const notes = buildChart([1, 2.2], {
      difficulty: 'hard',
      modifiers: new Set(),
      sections: [{ kind: 'chorus', start: 0, end: 8 }],
    });
    const heads = notes.filter((n) => n.time === 1 && n.duration > 0);
    expect(heads).toHaveLength(2);
    expect(heads.map((n) => n.lane).sort()).toEqual([0, 1]);
  });

  it('pairs a Hard chorus hold with a same-time tap', () => {
    const notes = buildChart([1, 1.3, 1.6, 1.9, 2.2, 3.4], {
      difficulty: 'hard',
      modifiers: new Set(),
      sections: [{ kind: 'chorus', start: 0, end: 10 }],
    });
    const at = notes.filter((n) => n.time === 3.4);
    const hold = at.find((n) => n.duration > 0);
    const tap = at.find((n) => n.duration === 0);
    expect(hold).toBeTruthy();
    expect(tap).toBeTruthy();
    expect(hold!.lane).not.toBe(tap!.lane);
    expect(hold!.chordGroup).not.toBeNull();
    expect(hold!.chordGroup).toBe(tap!.chordGroup);
  });

  it('staggers a second Dual drop hold on the other lane', () => {
    const notes = buildChart([1, 2.8], {
      difficulty: 'normal',
      modifiers: new Set(['dual']),
      sections: [{ kind: 'drop', start: 0, end: 10 }],
    });
    const holds = notes.filter((n) => n.duration > 0).sort((a, b) => a.time - b.time);
    expect(holds.length).toBeGreaterThanOrEqual(2);
    expect(holds[0].time).toBe(1);
    expect(holds[1].time).toBeCloseTo(1.25);
    expect(holds[0].lane).not.toBe(holds[1].lane);
  });

  it('adds a second tap inside a Hard chorus hold', () => {
    const notes = buildChart([1, 1.3, 3.2], {
      difficulty: 'hard',
      modifiers: new Set(),
      sections: [{ kind: 'chorus', start: 0, end: 10 }],
    });
    const hold = notes.find((n) => n.duration > 0 && n.time === 1.3);
    expect(hold).toBeTruthy();
    const inside = notes.filter((n) => n.duration === 0 && n.time > 1.3 && n.time < 1.3 + hold!.duration);
    expect(inside.length).toBeGreaterThanOrEqual(2);
  });

  it('leaves rests in intro and break instead of filling every beat', () => {
    const times = [1, 1.4, 1.8, 2.2];
    const intro = buildChart(times, {
      difficulty: 'normal',
      modifiers: new Set(),
      sections: [{ kind: 'intro', start: 0, end: 10 }],
    });
    expect(intro.some((n) => n.time === 1.8)).toBe(false);
    expect(intro.some((n) => n.time === 1)).toBe(true);
    const hardIntro = buildChart(times, {
      difficulty: 'hard',
      modifiers: new Set(),
      sections: [{ kind: 'intro', start: 0, end: 10 }],
    });
    expect(hardIntro.some((n) => n.time === 1.8)).toBe(true);
    const brk = buildChart(times, {
      difficulty: 'normal',
      modifiers: new Set(),
      sections: [{ kind: 'break', start: 0, end: 10 }],
    });
    expect(brk.some((n) => n.time === 1.4)).toBe(false);
  });

  it('adds a phrase burst during the build', () => {
    const notes = buildChart([1, 1.5, 2, 2.5], {
      difficulty: 'normal',
      modifiers: new Set(),
      sections: [{ kind: 'build', start: 0, end: 10 }],
    });
    expect(notes.some((n) => n.time > 1.5 && n.time < 2)).toBe(true);
    const easy = buildChart([1, 1.5, 2, 2.5], {
      difficulty: 'easy',
      modifiers: new Set(),
      sections: [{ kind: 'build', start: 0, end: 10 }],
    });
    expect(easy).toHaveLength(4);
  });

  it('places pattern holds on a tight quarter grid without 0.85s gaps', () => {
    const times = Array.from({ length: 32 }, (_, i) => 1 + i * 0.5);
    const notes = buildChart(times, {
      difficulty: 'normal',
      modifiers: new Set(),
      sections: [
        { kind: 'verse', start: 0, end: 12 },
        { kind: 'chorus', start: 12, end: 20 },
      ],
    });
    const holds = notes.filter((n) => n.duration > 0);
    expect(holds.length).toBeGreaterThan(0);
    expect(holds.some((h) => notes.some((n) => n.duration === 0 && n.time > h.time && n.time < h.time + h.duration))).toBe(true);
    const easy = buildChart(times, { difficulty: 'easy', modifiers: new Set() });
    expect(easy.filter((n) => n.duration > 0 && n.time < times[times.length - 1])).toHaveLength(0);
  });

  it('does not weave taps into Easy holds', () => {
    const notes = buildChart([1, 2.8], {
      difficulty: 'easy',
      modifiers: new Set(),
      sections: [{ kind: 'verse', start: 0, end: 10 }],
    });
    expect(notes).toHaveLength(2);
    expect(notes.every((n) => n.chordGroup == null)).toBe(true);
  });
});

describe('phrase feel', () => {
  const times = previewBeatTimes();
  const sections = previewSections();

  it('gives intro breathing room and chorus more intensity', () => {
    const normal = buildChart(times, { difficulty: 'normal', modifiers: new Set(), sections });
    const intro = normal.filter((n) => n.section === 'intro');
    const verse = normal.filter((n) => n.section === 'verse');
    const chorus = normal.filter((n) => n.section === 'chorus');
    const introSpan = 8;
    const verseSpan = 12;
    const chorusSpan = 12;
    expect(intro.length / introSpan).toBeLessThan(verse.length / verseSpan);
    expect(chorus.filter((n) => n.chordGroup != null).length).toBeGreaterThan(0);
    expect(chorus.length).toBeGreaterThan(intro.length);
  });

  it('keeps inside-hold taps inside their parent hold', () => {
    const notes = buildChart(times, { difficulty: 'normal', modifiers: new Set(), sections });
    const holds = notes.filter((n) => n.duration > 0);
    for (const hold of holds) {
      const inside = notes.filter(
        (n) => n !== hold && n.duration === 0 && n.time > hold.time && n.time < hold.time + hold.duration,
      );
      for (const tap of inside) {
        expect(tap.time).toBeGreaterThan(hold.time + 0.18);
        expect(tap.time).toBeLessThan(hold.time + hold.duration - 0.15);
      }
    }
  });

  it('does not spam dual holds or back-to-back chords on Hard', () => {
    const hard = buildChart(times, { difficulty: 'hard', modifiers: new Set(), sections });
    const dualHolds = new Set(
      hard
        .filter((n) => n.duration > 0 && n.chordGroup != null)
        .filter((n) => hard.filter((o) => o.chordGroup === n.chordGroup && o.duration > 0).length === 2)
        .map((n) => n.chordGroup),
    );
    expect(dualHolds.size).toBeGreaterThan(0);
    expect(dualHolds.size).toBeLessThanOrEqual(3);
    const chordTimes = [...new Set(hard.filter((n) => n.chordGroup != null && n.duration === 0).map((n) => n.time))].sort(
      (a, b) => a - b,
    );
    const tight = chordTimes.filter((t, i) => i > 0 && t - chordTimes[i - 1] < 0.7);
    expect(tight.length).toBe(0);
  });

  it('varies hold lengths on Normal instead of cloning every tail', () => {
    const notes = buildChart(times, { difficulty: 'normal', modifiers: new Set(), sections });
    const durs = [...new Set(notes.filter((n) => n.duration > 0).map((n) => n.duration.toFixed(2)))];
    expect(durs.length).toBeGreaterThan(1);
  });

  it('bounces Normal lanes instead of pinning everything to lane 0', () => {
    const notes = buildChart(times, { difficulty: 'normal', modifiers: new Set(), sections });
    const taps = notes.filter((n) => n.duration === 0 && n.chordGroup == null);
    const lane0 = taps.filter((n) => n.lane === 0).length;
    const lane1 = taps.filter((n) => n.lane === 1).length;
    expect(Math.min(lane0, lane1) / Math.max(lane0, lane1)).toBeGreaterThan(0.35);
  });

  it('treats chords as accents, not a stream', () => {
    const normal = buildChart(times, { difficulty: 'normal', modifiers: new Set(), sections });
    const groups = new Set(normal.filter((n) => n.chordGroup != null).map((n) => n.chordGroup));
    const taps = normal.filter((n) => n.duration === 0 && n.chordGroup == null).length;
    expect(groups.size).toBeGreaterThan(0);
    expect(groups.size).toBeLessThan(taps / 3);
  });
});
