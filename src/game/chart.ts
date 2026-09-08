/**
 * Beat detection + phrase charts.
 *
 * Detection, hold-gap math and the Preview Beat grid are FLOW 0.3.
 * Phrase language (intro / verse / build / chorus / break / drop / outro)
 * and true dual-lane chords live here.
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
  const size = 1024;
  const hop = 512;
  const energies: number[] = [];

  for (let i = 0; i + size < data.length; i += hop) {
    let energy = 0;
    for (let j = 0; j < size; j++) energy += data[i + j] * data[i + j];
    energies.push(energy / size);
  }

  const beats: number[] = [];
  const window = 22;
  for (let i = window; i < energies.length - window; i++) {
    let mean = 0;
    for (let k = i - window; k <= i + window; k++) mean += energies[k];
    mean /= window * 2 + 1;
    const t = (i * hop) / sr;
    const last = beats[beats.length - 1] ?? -99;
    if (energies[i] > mean * 1.4 && t - last > 0.22) beats.push(t);
  }

  if (beats.length < 8) {
    const out: number[] = [];
    for (let t = 1; t < buffer.duration - 0.4; t += 0.5) out.push(t);
    return out;
  }
  return beats;
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
    // Never split a hold-worthy rest — that gap becomes the tail.
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

function laneFor(index: number, easy: boolean, seed: number): 0 | 1 {
  if (easy) return (index % 2) as 0 | 1;
  return ((Math.sin(index * 12.9898 + seed) * 43758.5453) % 1 > 0.5 ? 1 : 0) as 0 | 1;
}

export function buildChart(beats: number[], options: ChartOptions): Note[] {
  const { difficulty, modifiers } = options;
  const sections = options.sections ?? inferSections(beats, beats[beats.length - 1] ?? 0);
  const easy = difficulty === 'easy';
  const dual = modifiers.has('dual');
  const classic = modifiers.has('classic');
  const times = densifyBeats(beats, difficulty);
  const notes: Note[] = [];
  let id = 0;
  let chordGroup = 1;
  const seed = times[0] ?? 0;

  const take = (time: number, lane: 0 | 1, duration: number, group: number | null, section: SectionKind) => {
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

  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    const next = times[i + 1];
    const gap = next != null ? next - t : 1.2;
    const section = sectionAt(sections, t);
    const lane = laneFor(i, easy, seed);
    const other = (1 - lane) as 0 | 1;

    const wantHold = gap >= HOLD_MIN_GAP && (classic || section === 'verse' || section === 'chorus' || section === 'outro' || (section === 'break' && gap >= 1.1));
    const wantChord =
      !easy &&
      (section === 'chorus' || section === 'drop' || (dual && section !== 'intro' && section !== 'outro')) &&
      i % (dual ? 2 : 4) === 0 &&
      gap < HOLD_MIN_GAP;

    const wantDualHold =
      !easy &&
      wantHold &&
      (classic || dual || section === 'chorus' || section === 'drop') &&
      gap >= 1.05 &&
      (classic || i % 3 === 0);

    if (wantDualHold) {
      const dur = holdDurationForGap(gap);
      const group = chordGroup++;
      take(t, 0, dur, group, section);
      take(t, 1, dur, group, section);
      continue;
    }

    if (wantHold) {
      take(t, lane, holdDurationForGap(gap), null, section);
      if (dual && section === 'drop' && gap >= 1.2) {
        take(t + 0.12, other, Math.max(0.35, holdDurationForGap(gap) - 0.2), null, section);
      }
      continue;
    }

    if (wantChord) {
      const group = chordGroup++;
      take(t, 0, 0, group, section);
      take(t, 1, 0, group, section);
      continue;
    }

    take(t, lane, 0, null, section);

    if (section === 'build' && !easy && i % 3 === 1 && gap > 0.38) {
      take(t + Math.min(0.18, gap * 0.4), other, 0, null, section);
    }
    if (section === 'drop' && difficulty === 'hard' && i % 2 === 0 && gap > 0.3) {
      take(t + gap * 0.33, other, 0, null, section);
    }
  }

  notes.sort((a, b) => a.time - b.time || a.lane - b.lane);
  if (modifiers.has('mirror')) {
    for (const n of notes) n.lane = (1 - n.lane) as 0 | 1;
  }
  return notes;
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
