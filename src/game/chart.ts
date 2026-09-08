/**
 * Beat detection and chart construction.
 *
 * `detectBeats` and the hold-gap formula are the FLOW RHYTHM originals.
 * Pattern assignment, Hard density, chords and dual holds are layered on
 * top and can be turned off without touching the timing math.
 */
import {
  HOLD_MIN_GAP,
  type ChartOptions,
  type DifficultyId,
  type Note,
} from './types';

export interface BeatSource {
  getChannelData(channel: number): Float32Array;
  sampleRate: number;
  duration: number;
}

/** Preview Beat from game.html: 120 BPM quarters with a hold every 8th note. */
export function previewBeatTimes(): number[] {
  const beatTimes: number[] = [];
  let t = 1;
  let i = 0;
  while (t < 56) {
    beatTimes.push(t);
    t += i % 8 === 7 ? 1.75 : 0.5;
    i++;
  }
  return beatTimes;
}

export function countHolds(times: number[], endTime: number): number {
  let holds = 0;
  for (let i = 0; i < times.length; i++) {
    const next = times[i + 1] !== undefined ? times[i + 1] : endTime;
    if (next - times[i] >= HOLD_MIN_GAP) holds++;
  }
  return holds;
}

export function holdDurationForGap(gap: number): number {
  if (gap < HOLD_MIN_GAP) return 0;
  return Math.min(1.4, Math.max(0.4, gap - 0.45));
}

/**
 * Energy-peak beat tracker from game.html. Frame 1024 / hop 512, local
 * average window 22, peak radius 3, 1.40× threshold, 0.22s refractory.
 * Falls back to a 0.5s grid when fewer than 8 beats are found.
 */
export function detectBeats(buffer: BeatSource): number[] {
  const samples = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;

  const frameSize = 1024;
  const hopSize = 512;
  const energies: number[] = [];

  for (let offset = 0; offset + frameSize < samples.length; offset += hopSize) {
    let energy = 0;
    for (let i = 0; i < frameSize; i++) {
      const sample = samples[offset + i];
      energy += sample * sample;
    }
    energies.push(energy / frameSize);
  }

  const beats: number[] = [];
  const averageWindow = 22;
  let previousBeat = -1;

  for (let i = averageWindow; i < energies.length - averageWindow; i++) {
    let averageEnergy = 0;
    for (let j = i - averageWindow; j <= i + averageWindow; j++) averageEnergy += energies[j];
    averageEnergy /= averageWindow * 2 + 1;

    let isPeak = true;
    for (let j = i - 3; j <= i + 3; j++) {
      if (energies[j] > energies[i]) {
        isPeak = false;
        break;
      }
    }

    const time = (i * hopSize) / sampleRate;
    const strongEnough = energies[i] > averageEnergy * 1.40;
    const farEnoughFromPrevious = time - previousBeat > 0.22;

    if (isPeak && strongEnough && farEnoughFromPrevious) {
      beats.push(time);
      previousBeat = time;
    }
  }

  if (beats.length < 8) {
    const fallback: number[] = [];
    for (let time = 1; time < buffer.duration; time += 0.5) fallback.push(time);
    return fallback;
  }

  return beats;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromTimes(times: number[]): number {
  let s = times.length * 2654435761;
  for (let i = 0; i < times.length; i += Math.max(1, Math.floor(times.length / 8))) {
    s ^= Math.floor(times[i] * 1000) + i * 97;
  }
  return s >>> 0;
}

/**
 * Insert mid-gap taps on Hard without touching hold-worthy gaps, so the
 * original hold formula still fires on the same wide spaces.
 */
export function densifyBeats(times: number[], endTime: number, difficulty: DifficultyId): number[] {
  if (difficulty !== 'hard') return times.slice();
  const out: number[] = [];
  for (let i = 0; i < times.length; i++) {
    out.push(times[i]);
    const next = times[i + 1] !== undefined ? times[i + 1] : endTime;
    const gap = next - times[i];
    if (gap > 0.42 && gap < HOLD_MIN_GAP) {
      out.push(times[i] + gap * 0.5);
    }
  }
  return out;
}

function assignLanes(count: number, difficulty: DifficultyId, rand: () => number, mirror: boolean): Array<0 | 1> {
  const lanes: Array<0 | 1> = [];
  if (difficulty === 'easy') {
    for (let i = 0; i < count; i++) lanes.push((i % 2) as 0 | 1);
  } else {
    let lane: 0 | 1 = 0;
    let remaining = difficulty === 'hard' ? 3 + Math.floor(rand() * 3) : 2 + Math.floor(rand() * 2);
    for (let i = 0; i < count; i++) {
      lanes.push(lane);
      remaining -= 1;
      if (remaining <= 0) {
        lane = lane === 0 ? 1 : 0;
        remaining = difficulty === 'hard' ? 2 + Math.floor(rand() * 4) : 2 + Math.floor(rand() * 3);
      }
    }
  }
  if (mirror) {
    for (let i = 0; i < lanes.length; i++) lanes[i] = lanes[i] === 0 ? 1 : 0;
  }
  return lanes;
}

export function buildNotes(beatTimes: number[], endTime: number, opts: ChartOptions): Note[] {
  const times = densifyBeats(beatTimes, endTime, opts.difficulty);
  const rand = mulberry32(seedFromTimes(times) ^ (opts.difficulty === 'hard' ? 7 : opts.difficulty === 'normal' ? 3 : 1));
  const lanes = assignLanes(times.length, opts.difficulty, rand, opts.modifiers.has('mirror'));

  const notes: Note[] = times.map((time, index) => {
    const next = times[index + 1] !== undefined ? times[index + 1] : endTime;
    const duration = holdDurationForGap(next - time);
    return {
      id: index,
      time,
      lane: lanes[index],
      duration,
      hit: false,
      missed: false,
      judged: false,
      holding: false,
      chord: false,
    };
  });

  if (opts.modifiers.has('dual')) {
    addChords(notes, rand, endTime);
    addDualHolds(notes, rand);
  }

  notes.sort((a, b) => a.time - b.time || a.lane - b.lane);
  for (let i = 0; i < notes.length; i++) notes[i].id = i;
  return notes;
}

function addChords(notes: Note[], rand: () => number, _endTime: number): void {
  const extras: Note[] = [];
  for (const note of notes) {
    if (note.duration > 0) continue;
    if (rand() > 0.14) continue;
    const other: 0 | 1 = note.lane === 0 ? 1 : 0;
    const clash = notes.some((n) => n.lane === other && Math.abs(n.time - note.time) < 0.08);
    if (clash) continue;
    extras.push({
      id: -1,
      time: note.time,
      lane: other,
      duration: 0,
      hit: false,
      missed: false,
      judged: false,
      holding: false,
      chord: true,
    });
    note.chord = true;
  }
  notes.push(...extras);
}

function addDualHolds(notes: Note[], rand: () => number): void {
  const extras: Note[] = [];
  for (const note of notes) {
    if (note.duration < 0.7) continue;
    if (rand() > 0.28) continue;
    const start = note.time + 0.22;
    const duration = Math.min(0.7, note.duration - 0.38);
    if (duration < 0.4) continue;
    const other: 0 | 1 = note.lane === 0 ? 1 : 0;
    extras.push({
      id: -1,
      time: start,
      lane: other,
      duration,
      hit: false,
      missed: false,
      judged: false,
      holding: false,
      chord: false,
    });
  }
  notes.push(...extras);
}

export function chartEndOf(notes: Note[]): number {
  return notes.reduce((max, n) => Math.max(max, n.time + n.duration), 0);
}
