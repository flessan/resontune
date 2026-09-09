/**
 * Beat detection + phrase charts.
 *
 * Onsets → tempo grid → phrases → patterns. Holds come from the pattern
 * language, not from waiting for a 0.85s hole in the beat stream.
 */
import {
  CHART_VERSION,
  HOLD_MIN_GAP,
  type ChartOptions,
  type ChartSection,
  type Note,
  type SectionKind,
} from './types';

export { CHART_VERSION };

export function detectBeats(buffer: Pick<AudioBuffer, 'getChannelData' | 'sampleRate' | 'duration'>): number[] {
  const data = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const onsets = detectOnsets(data, sr);
  if (onsets.length < 8) return fallbackGrid(buffer.duration);

  const { step, phase } = estimateTempo(onsets);
  const grid: number[] = [];
  const start = phase > 0.45 ? phase : phase + step;
  for (let t = start; t < buffer.duration - 0.3; t += step) {
    const near = nearestOnset(onsets, t);
    const idx = Math.round((t - start) / step);
    const downbeat = idx % 4 === 0;
    if (Math.abs(near - t) <= step * 0.42 || (downbeat && Math.abs(near - t) <= step * 0.8)) {
      const snapped = Math.abs(near - t) <= step * 0.28 ? near : t;
      if (!grid.length || snapped - grid[grid.length - 1] > step * 0.55) grid.push(snapped);
    }
  }
  if (grid.length < 8) return spaceOnsets(onsets, 0.38);
  return grid;
}

function detectOnsets(data: Float32Array, sr: number): number[] {
  const size = 1024;
  const hop = 512;
  const flux: number[] = [];
  let prev = 0;
  for (let i = 0; i + size < data.length; i += hop) {
    let low = 0;
    let high = 0;
    let prevSample = data[i];
    for (let j = 0; j < size; j++) {
      const x = data[i + j];
      const hp = x - prevSample;
      prevSample = x;
      const e = x * x;
      if (j < size * 0.18) low += e;
      high += hp * hp;
    }
    const env = low / (size * 0.18) * 0.55 + high / size * 0.45;
    flux.push(Math.max(0, env - prev));
    prev = env * 0.85 + prev * 0.15;
  }

  const onsets: number[] = [];
  const window = 18;
  for (let i = window; i < flux.length - window; i++) {
    let mean = 0;
    for (let k = i - window; k <= i + window; k++) mean += flux[k];
    mean /= window * 2 + 1;
    const t = (i * hop) / sr;
    const last = onsets[onsets.length - 1] ?? -99;
    if (flux[i] > mean * 1.35 && flux[i] >= (flux[i - 1] ?? 0) && t - last > 0.12) onsets.push(t);
  }
  return onsets;
}

function estimateTempo(onsets: number[]): { step: number; phase: number } {
  const minI = 0.33;
  const maxI = 0.86;
  const bins = new Float32Array(54);
  for (let i = 1; i < onsets.length; i++) {
    let dt = onsets[i] - onsets[i - 1];
    while (dt > maxI) dt /= 2;
    while (dt < minI && dt > 0.08) dt *= 2;
    if (dt < minI || dt > maxI) continue;
    const b = Math.round((dt - minI) / 0.01);
    if (b >= 0 && b < bins.length) bins[b] += 1;
  }
  let best = 0;
  let bestI = 17; // ~0.5s
  for (let i = 0; i < bins.length; i++) {
    const score = bins[i] + 0.45 * (bins[i - 1] ?? 0) + 0.45 * (bins[i + 1] ?? 0);
    if (score > best) {
      best = score;
      bestI = i;
    }
  }
  const step = minI + bestI * 0.01;
  return { step, phase: onsets[0] };
}

function nearestOnset(onsets: number[], t: number): number {
  let best = onsets[0];
  let bestD = Math.abs(best - t);
  for (const o of onsets) {
    const d = Math.abs(o - t);
    if (d < bestD) {
      best = o;
      bestD = d;
    }
    if (o > t && d > bestD) break;
  }
  return best;
}

function spaceOnsets(onsets: number[], minGap: number): number[] {
  const out: number[] = [];
  for (const t of onsets) {
    if (!out.length || t - out[out.length - 1] >= minGap) out.push(t);
  }
  return out;
}

function fallbackGrid(duration: number): number[] {
  const out: number[] = [];
  for (let t = 1; t < duration - 0.4; t += 0.5) out.push(t);
  return out;
}

/** FLOW 0.3 Preview Beat: 7 hits at 0.5s then a 1.75s rest, t = 1..56. */
export function previewBeats(): number[] {
  const beats: number[] = [];
  let t = 1;
  while (t < 56) {
    for (let i = 0; i < 7 && t < 56; i++) {
      beats.push(t);
      t += 0.5;
    }
    t += 1.25;
  }
  return beats;
}

export function previewSections(): ChartSection[] {
  return [
    { kind: 'intro', start: 0, end: 8 },
    { kind: 'verse', start: 8, end: 20 },
    { kind: 'build', start: 20, end: 28 },
    { kind: 'chorus', start: 28, end: 40 },
    { kind: 'break', start: 40, end: 44 },
    { kind: 'drop', start: 44, end: 52 },
    { kind: 'outro', start: 52, end: 56 },
  ];
}

export function inferSections(beats: number[], duration: number): ChartSection[] {
  if (beats.length === 0) {
    return [{ kind: 'verse', start: 0, end: duration }];
  }
  const span = Math.max(duration, beats[beats.length - 1] + 0.5);
  if (span < 18) {
    return [
      { kind: 'intro', start: 0, end: span * 0.18 },
      { kind: 'verse', start: span * 0.18, end: span * 0.55 },
      { kind: 'chorus', start: span * 0.55, end: span * 0.85 },
      { kind: 'outro', start: span * 0.85, end: span },
    ];
  }

  const intervals: number[] = [];
  for (let i = 1; i < beats.length; i++) intervals.push(beats[i] - beats[i - 1]);
  const median = [...intervals].sort((a, b) => a - b)[Math.floor(intervals.length / 2)] || 0.5;

  type Window = { t: number; density: number };
  const windows: Window[] = [];
  const step = Math.max(median * 4, 1.6);
  for (let t = 0; t < span; t += step) {
    const end = t + step;
    let n = 0;
    for (const b of beats) if (b >= t && b < end) n++;
    windows.push({ t, density: n / step });
  }
  const dens = windows.map((w) => w.density);
  const lo = percentile(dens, 0.25);
  const hi = percentile(dens, 0.72);
  const mid = percentile(dens, 0.5);

  const raw: ChartSection[] = [];
  for (const w of windows) {
    let kind: SectionKind;
    if (w.t < span * 0.1) kind = 'intro';
    else if (w.t > span * 0.88) kind = 'outro';
    else if (w.density >= hi) kind = raw.some((s) => s.kind === 'chorus') && w.t > span * 0.55 ? 'drop' : 'chorus';
    else if (w.density <= lo) kind = 'break';
    else if (w.density > mid && raw[raw.length - 1]?.kind === 'verse') kind = 'build';
    else kind = 'verse';
    const last = raw[raw.length - 1];
    if (last && last.kind === kind) last.end = w.t + step;
    else raw.push({ kind, start: w.t, end: Math.min(span, w.t + step) });
  }
  if (raw.length) raw[raw.length - 1].end = span;
  return mergeTiny(raw, span);
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}

function mergeTiny(sections: ChartSection[], span: number): ChartSection[] {
  const out: ChartSection[] = [];
  for (const s of sections) {
    const last = out[out.length - 1];
    if (last && s.end - s.start < 2.4) {
      last.end = s.end;
    } else {
      out.push({ ...s });
    }
  }
  if (out.length) out[out.length - 1].end = span;
  return out;
}

export function sectionAt(sections: ChartSection[], t: number): SectionKind {
  for (const s of sections) if (t >= s.start && t < s.end) return s.kind;
  return sections[sections.length - 1]?.kind ?? 'verse';
}

export function densifyBeats(beats: number[], difficulty: 'easy' | 'normal' | 'hard'): number[] {
  if (difficulty === 'easy' || beats.length < 2) return beats.slice();
  const out: number[] = [];
  for (let i = 0; i < beats.length; i++) {
    out.push(beats[i]);
    if (i === beats.length - 1) continue;
    const gap = beats[i + 1] - beats[i];
    if (gap >= HOLD_MIN_GAP) continue;
    if (difficulty === 'hard' && gap > 0.42) out.push(beats[i] + gap / 2);
    else if (difficulty === 'normal' && gap > 0.7) out.push(beats[i] + gap / 2);
  }
  return out;
}

/** FLOW 0.3 hold length. Zero when the gap is too short to hold. */
export function holdDurationForGap(gap: number): number {
  if (gap < HOLD_MIN_GAP) return 0;
  return Math.max(0.4, Math.min(gap - 0.45, 1.4));
}

/** Bounce L-R, with a same-lane double every few phrases. Not a random hash. */
function laneFor(index: number, easy: boolean, _seed: number): 0 | 1 {
  if (easy) return (index % 2) as 0 | 1;
  const phrase = Math.floor(index / 4);
  const pos = index % 4;
  const start = (phrase % 2) as 0 | 1;
  if (pos === 3 && phrase % 3 === 2) return start;
  return ((start + pos) % 2) as 0 | 1;
}

function chartPulse(times: number[]): number {
  const gaps: number[] = [];
  for (let i = 1; i < times.length; i++) {
    const g = times[i] - times[i - 1];
    if (g >= 0.22 && g < HOLD_MIN_GAP) gaps.push(g);
  }
  if (!gaps.length) return 0.5;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}

/** Short / medium / long from the same gap math. Easy keeps the raw duration. */
function flavoredHold(gap: number, flavor: number): number {
  const base = holdDurationForGap(gap);
  if (!base) return 0;
  const cycle = flavor % 3;
  if (cycle === 2) return Math.max(0.4, Math.min(base, 0.55));
  if (cycle === 0) return Math.max(0.4, Math.min(base, 0.95));
  return base;
}

function flavoredRaw(raw: number, flavor: number): number {
  const base = Math.max(0.45, Math.min(raw, 1.4));
  const cycle = flavor % 3;
  if (cycle === 2) return Math.max(0.45, Math.min(base, 0.55));
  if (cycle === 0) return Math.max(0.45, Math.min(base, 0.95));
  return base;
}

/** Intentional rests — intro/break leave space instead of filling every beat. */
function shouldRest(section: SectionKind, difficulty: ChartOptions['difficulty'], i: number): boolean {
  if (section === 'break' && i % 2 === 1) return true;
  if (section === 'intro' && difficulty !== 'hard' && i % 3 === 2) return true;
  if (section === 'intro' && difficulty === 'hard' && i % 2 === 1) return true;
  return false;
}

function placeBurst(
  take: (time: number, lane: 0 | 1, duration: number, group: number | null, section: SectionKind) => void,
  args: {
    easy: boolean;
    hard: boolean;
    section: SectionKind;
    t: number;
    gap: number;
    i: number;
    lane: 0 | 1;
    other: 0 | 1;
    pulse: number;
  },
): void {
  const { easy, hard, section, t, gap, i, lane, other, pulse } = args;
  if (easy || gap < 0.4 || gap >= HOLD_MIN_GAP) return;
  const eighth = Math.min(pulse * 0.5, gap * 0.5);
  if (section === 'build' && i % 4 === 1) {
    take(t + eighth, other, 0, null, section);
    if (hard && gap > 0.7) take(t + pulse, lane, 0, null, section);
  }
  if (section === 'drop' && hard && i % 8 === 2 && gap > 0.4) {
    take(t + eighth, other, 0, null, section);
  }
}

/** Mix a tap into an active hold, or a tap between sequential holds. Easy stays 1:1. Never hand off a hold. */
function weaveHoldTaps(
  take: (time: number, lane: 0 | 1, duration: number, group: number | null, section: SectionKind) => void,
  args: {
    easy: boolean;
    classic: boolean;
    dual: boolean;
    hard: boolean;
    section: SectionKind;
    t: number;
    dur: number;
    next: number | undefined;
    other: 0 | 1;
    pulse: number;
  },
): void {
  const { easy, classic, dual, hard, section, t, dur, next, other, pulse } = args;
  if (easy || classic) return;
  if (section === 'intro' || section === 'outro' || section === 'break') return;

  const beat = pulse || 0.5;
  if (dual && section === 'drop' && dur >= 0.85) {
    const off = Math.max(0.25, beat * 0.5);
    take(t + off, other, Math.max(0.4, dur - off), null, section);
    return;
  }

  const inside: number[] = [];
  if (dur >= 0.7) inside.push(t + beat);
  if (hard && dur >= 0.9 && section === 'chorus') inside.push(t + beat * 2);
  let placed = 0;
  for (const at of inside) {
    if (at <= t + 0.2 || at >= t + dur - 0.18) continue;
    if (next != null && at >= next - 0.2) continue;
    take(at, other, 0, null, section);
    placed += 1;
  }
  if (placed) return;

  const after = t + dur + 0.14;
  if (next != null && after < next - 0.2 && next - (t + dur) >= 0.32) {
    take(after, other, 0, null, section);
  }
}

type Take = (time: number, lane: 0 | 1, duration: number, group: number | null, section: SectionKind) => void;
type PatternName = 'sparse' | 'pulse' | 'alt' | 'holdGroove' | 'holdAccent' | 'burst' | 'bounce' | 'dualHold' | 'holdShort';

function pickPattern(
  section: SectionKind,
  group: number,
  hard: boolean,
  dual: boolean,
  dualCount: number,
): PatternName {
  if (section === 'intro' || section === 'break') return 'sparse';
  if (section === 'outro') return group % 2 === 0 ? 'pulse' : 'holdShort';
  if (section === 'build') return 'burst';
  if (section === 'drop') {
    if ((hard || dual) && dualCount < 3 && group % 2 === 0) return 'dualHold';
    return 'holdGroove';
  }
  if (section === 'chorus') {
    if (hard && dualCount < 2 && group % 3 === 0) return 'dualHold';
    return group % 2 === 0 ? 'holdAccent' : 'bounce';
  }
  return (['holdGroove', 'alt', 'pulse', 'holdGroove'] as const)[group % 4];
}

function patternHoldDur(slice: number[], start: number, steps: number, pulse: number, flavor: number): number {
  const t = slice[start];
  const end = slice[start + steps] ?? t + pulse * steps;
  return flavoredRaw(end - t - 0.12, flavor);
}

function tapInside(
  take: Take,
  t: number,
  dur: number,
  at: number | undefined,
  lane: 0 | 1,
  section: SectionKind,
): boolean {
  if (at == null) return false;
  if (at <= t + 0.18 || at >= t + dur - 0.15) return false;
  take(at, lane, 0, null, section);
  return true;
}

function applyPattern(
  slice: number[],
  name: PatternName,
  ctx: {
    take: Take;
    pulse: number;
    hard: boolean;
    dual: boolean;
    classic: boolean;
    section: SectionKind;
    group: number;
    holdAlt: number;
    holdFlavor: number;
    chordGroup: number;
    lastChord: number;
  },
): { holdAlt: number; holdFlavor: number; chordGroup: number; lastChord: number; dual: boolean } {
  const { take, pulse, hard, dual, classic, section, group } = ctx;
  let { holdAlt, holdFlavor, chordGroup, lastChord } = ctx;
  const laneA = (holdAlt % 2) as 0 | 1;
  const laneB = (1 - laneA) as 0 | 1;
  const bounce = (k: number) => ((group + k) % 2) as 0 | 1;
  let placedDual = false;

  const chordOk = (t: number) => t - lastChord >= 0.7;

  if (name === 'sparse') {
    for (let k = 0; k < slice.length; k += 4) take(slice[k], bounce(k), 0, null, section);
  } else if (name === 'pulse') {
    for (let k = 0; k < slice.length; k += 2) take(slice[k], laneA, 0, null, section);
  } else if (name === 'alt') {
    for (let k = 0; k < slice.length; k++) take(slice[k], bounce(k), 0, null, section);
  } else if (name === 'bounce') {
    for (let k = 0; k < slice.length; k++) {
      if (k % 3 === 2) continue;
      take(slice[k], bounce(k), 0, null, section);
    }
  } else if (name === 'burst') {
    for (let k = 0; k < slice.length; k++) {
      const t = slice[k];
      const next = slice[k + 1];
      const gap = next != null ? next - t : pulse;
      take(t, bounce(k), 0, null, section);
      if (k % 4 === 1 && gap >= 0.4 && gap < HOLD_MIN_GAP) {
        take(t + Math.min(pulse * 0.5, gap * 0.5), bounce(k + 1), 0, null, section);
      }
    }
  } else if (name === 'holdShort' || name === 'holdGroove' || name === 'holdAccent' || name === 'dualHold') {
    const t = slice[0];
    const steps = name === 'holdShort' ? 2 : name === 'holdAccent' ? 3 : 4;
    const dur = name === 'dualHold'
      ? Math.max(0.5, Math.min(1.2, (slice[3] ?? t + pulse * 3) - t - 0.12))
      : patternHoldDur(slice, 0, steps, pulse, holdFlavor++);
    if (name === 'dualHold' && !classic) {
      const groupId = chordGroup++;
      take(t, 0, dur, groupId, section);
      take(t, 1, dur, groupId, section);
      lastChord = t;
      placedDual = true;
      if (dual && slice[1] != null) take(slice[1], 0, 0, null, section);
    } else if (name === 'dualHold' && classic) {
      const groupId = chordGroup++;
      take(t, 0, dur, groupId, section);
      take(t, 1, dur, groupId, section);
      lastChord = t;
      placedDual = true;
    } else {
      const chord = name === 'holdAccent' && !classic && chordOk(t);
      const groupId = chord ? chordGroup++ : null;
      take(t, laneA, dur, groupId, section);
      if (chord) {
        take(t, laneB, 0, groupId, section);
        lastChord = t;
      }
      const insideAt = t + Math.max(0.22, Math.min(pulse, dur - 0.22));
      tapInside(take, t, dur, insideAt, laneB, section);
      if (hard && name === 'holdAccent') tapInside(take, t, dur, t + pulse * 2, laneB, section);
      const later = slice[4] ?? slice[3];
      if (later != null && later >= t + dur + 0.18) take(later, laneB, 0, null, section);
      else if (later != null) tapInside(take, t, dur, later, laneB, section);
      if (slice[6] != null && slice[6] >= t + dur + 0.15) take(slice[6], laneA, 0, null, section);
      holdAlt += 1;
    }
    if (dual && name === 'holdGroove' && !classic && dur >= 0.85) {
      const off = Math.max(0.25, pulse * 0.5);
      take(t + off, laneB, Math.max(0.4, dur - off), null, section);
    }
  }

  return { holdAlt, holdFlavor, chordGroup, lastChord, dual: placedDual };
}

function buildPhrasedChart(times: number[], options: ChartOptions, sections: ChartSection[]): Note[] {
  const { difficulty, modifiers } = options;
  const hard = difficulty === 'hard';
  const dual = modifiers.has('dual');
  const classic = modifiers.has('classic');
  const pulse = chartPulse(times);
  const notes: Note[] = [];
  let id = 0;
  const take: Take = (time, lane, duration, group, _section) => {
    notes.push({
      id: id++,
      time,
      lane,
      duration,
      hit: false,
      missed: false,
      judged: false,
      holding: false,
      chordGroup: group,
      section: sectionAt(sections, time),
    });
  };

  let holdAlt = 0;
  let holdFlavor = 0;
  let chordGroup = 1;
  let lastChord = -99;
  let dualCount = 0;
  let i = 0;
  let group = 0;

  while (i < times.length) {
    const section = sectionAt(sections, times[i]);
    const span = Math.min(8, times.length - i);
    const slice = times.slice(i, i + span);
    const name = pickPattern(section, group, hard, dual, dualCount);
    const next = applyPattern(slice, name, {
      take,
      pulse,
      hard,
      dual,
      classic,
      section,
      group,
      holdAlt,
      holdFlavor,
      chordGroup,
      lastChord,
    });
    holdAlt = next.holdAlt;
    holdFlavor = next.holdFlavor;
    chordGroup = next.chordGroup;
    lastChord = next.lastChord;
    if (next.dual) dualCount += 1;
    i += span;
    group += 1;
  }

  notes.sort((a, b) => a.time - b.time || a.lane - b.lane);
  if (modifiers.has('mirror')) {
    for (const n of notes) n.lane = (1 - n.lane) as 0 | 1;
  }
  return notes;
}

function buildLinearChart(times: number[], options: ChartOptions, sections: ChartSection[]): Note[] {
  const { difficulty, modifiers } = options;
  const easy = difficulty === 'easy';
  const dual = modifiers.has('dual');
  const classic = modifiers.has('classic');
  const pulse = chartPulse(times);
  const notes: Note[] = [];
  let id = 0;
  let chordGroup = 1;
  let holdAlt = 0;
  let holdFlavor = 0;
  let lastDual = -99;
  const isolatedAt: Record<string, number> = { verse: 0, outro: 0 };
  const seed = times[0] ?? 0;

  const take: Take = (time, lane, duration, group, section) => {
    notes.push({
      id: id++,
      time,
      lane,
      duration,
      hit: false,
      missed: false,
      judged: false,
      holding: false,
      chordGroup: group,
      section,
    });
  };

  const hard = difficulty === 'hard';

  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    const next = times[i + 1];
    const nextNext = times[i + 2];
    const gap = next != null ? next - t : 1.2;
    const section = sectionAt(sections, t);
    const lane = laneFor(i, easy, seed);
    const other = (1 - lane) as 0 | 1;

    if (gap < HOLD_MIN_GAP && shouldRest(section, difficulty, i)) continue;

    const chained = next != null && nextNext != null && nextNext - next >= HOLD_MIN_GAP;
    const wantHold =
      gap >= HOLD_MIN_GAP &&
      (classic ||
        section === 'verse' ||
        section === 'chorus' ||
        section === 'outro' ||
        (section === 'drop' && (hard || dual)));

    if (
      wantHold &&
      !chained &&
      !easy &&
      !classic &&
      (section === 'verse' || section === 'outro') &&
      isolatedAt[section]++ % 2 === 1
    ) {
      take(t, lane, 0, null, section);
      continue;
    }

    const wantChord =
      !easy &&
      gap < HOLD_MIN_GAP &&
      (section === 'chorus' || section === 'drop') &&
      i % (hard ? 8 : 4) === 0;

    const wantDualHold =
      !easy &&
      wantHold &&
      gap >= 1.05 &&
      (classic || (hard && (section === 'chorus' || section === 'drop'))) &&
      (classic || i % 3 === 0) &&
      (classic || t - lastDual >= 4);

    if (wantDualHold) {
      const dur = holdDurationForGap(gap);
      const group = chordGroup++;
      lastDual = t;
      take(t, 0, dur, group, section);
      take(t, 1, dur, group, section);
      continue;
    }

    if (wantHold) {
      const dur = easy || classic ? holdDurationForGap(gap) : flavoredHold(gap, holdFlavor++);
      const holdLane = !easy && (section === 'verse' || section === 'chorus')
        ? ((holdAlt++ % 2) as 0 | 1)
        : lane;
      const holdOther = (1 - holdLane) as 0 | 1;
      const chordIntoHold = hard && !classic && (section === 'chorus' || section === 'drop') && i % 5 === 0;
      const group = chordIntoHold ? chordGroup++ : null;
      take(t, holdLane, dur, group, section);
      if (chordIntoHold) take(t, holdOther, 0, group, section);
      weaveHoldTaps(take, {
        easy,
        classic,
        dual,
        hard,
        section,
        t,
        dur,
        next,
        other: holdOther,
        pulse,
      });
      continue;
    }

    if (wantChord) {
      const group = chordGroup++;
      take(t, 0, 0, group, section);
      take(t, 1, 0, group, section);
      continue;
    }

    take(t, lane, 0, null, section);
    placeBurst(take, { easy, hard, section, t, gap, i, lane, other, pulse });
  }

  notes.sort((a, b) => a.time - b.time || a.lane - b.lane);
  if (modifiers.has('mirror')) {
    for (const n of notes) n.lane = (1 - n.lane) as 0 | 1;
  }
  return notes;
}

export function buildChart(beats: number[], options: ChartOptions): Note[] {
  const sections = options.sections ?? inferSections(beats, beats[beats.length - 1] ?? 0);
  const easy = options.difficulty === 'easy';
  const times = easy || beats.length < 8 ? densifyBeats(beats, options.difficulty) : beats.slice();
  if (easy || times.length < 8) return buildLinearChart(times, options, sections);
  return buildPhrasedChart(times, options, sections);
}

export function chartStats(notes: Note[]): { notes: number; holds: number; chords: number } {
  const holds = notes.filter((n) => n.duration > 0).length;
  const groups = new Set(notes.filter((n) => n.chordGroup != null).map((n) => n.chordGroup));
  return { notes: notes.length, holds, chords: groups.size };
}

export function describeBeats(beats: number[], duration: number): string {
  if (beats.length < 2) return `${beats.length} beats`;
  const span = beats[beats.length - 1] - beats[0];
  const bpm = span > 0 ? Math.round(((beats.length - 1) / span) * 60) : 0;
  return `${beats.length} beats · ~${bpm} BPM · ${duration.toFixed(0)}s`;
}

export function describeChart(notes: Note[], sections: ChartSection[]): string {
  const stats = chartStats(notes);
  const phrases = sections.map((s) => s.kind).filter((k, i, a) => a[i - 1] !== k);
  const holds = stats.holds ? ` · ${stats.holds} holds` : '';
  const chords = stats.chords ? ` · ${stats.chords} chords` : '';
  return `${stats.notes} notes${holds}${chords} · ${phrases.join(' → ')}`;
}

export const previewBeatTimes = previewBeats;

export function buildNotes(times: number[], _end: number, options: ChartOptions): Note[] {
  return buildChart(times, options);
}

export function countHolds(times: number[], end: number): number {
  return buildChart(times, { difficulty: 'normal', modifiers: new Set() })
    .filter((n) => n.duration > 0 && n.time < end).length;
}

export function chartEndOf(notes: Note[]): number {
  return notes.reduce((max, n) => Math.max(max, n.time + n.duration), 0);
}
