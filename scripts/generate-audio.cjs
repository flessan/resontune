#!/usr/bin/env node
/**
 * ResonTune seed-audio generator.
 *
 * Renders the demo catalog as ORIGINAL procedurally-composed music so the
 * repository ships with real, playable, licensing-clean audio. Every seed
 * track is synthesized here (chords, bass, arps, leads, percussion) and
 * encoded to MP3. Nothing is downloaded and nothing is copyrighted by a
 * third party — the output is dedicated to the public domain (CC0) and the
 * seed data marks it that way honestly.
 *
 * Usage: npm run seed:audio     (writes media/audio/*.mp3)
 */
const fs = require('node:fs');
const path = require('node:path');
let Mp3Encoder; // loaded via dynamic import in main()

const SR = 44100;
const OUT = path.resolve(__dirname, '../media/audio');
fs.mkdirSync(OUT, { recursive: true });

/* ---------------------------------- utils --------------------------------- */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* Scales as semitone sets */
const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixo: [0, 2, 4, 5, 7, 9, 10],
  pentMin: [0, 3, 5, 7, 10],
  pentMaj: [0, 2, 4, 7, 9],
};

function degreeToMidi(root, scale, degree) {
  const n = scale.length;
  const oct = Math.floor(degree / n);
  const idx = ((degree % n) + n) % n;
  return root + oct * 12 + scale[idx];
}

/* ------------------------------- synthesis -------------------------------- */

class Song {
  constructor(seconds) {
    this.len = Math.floor(seconds * SR);
    this.L = new Float32Array(this.len);
    this.R = new Float32Array(this.len);
  }

  /** Additive tone with ADSR. type: sine | tri | saw | organ | glass */
  tone(t0, dur, freq, gain, opts = {}) {
    const { type = 'sine', attack = 0.01, release = 0.15, pan = 0, vib = 0, detune = 0 } = opts;
    const start = Math.floor(t0 * SR);
    const total = Math.floor((dur + release) * SR);
    const aS = Math.max(1, Math.floor(attack * SR));
    const rS = Math.max(1, Math.floor(release * SR));
    const sS = total - rS;
    const gl = gain * clamp(1 - pan, 0, 1);
    const gr = gain * clamp(1 + pan, 0, 1);
    const w = (freq * (1 + detune)) * 2 * Math.PI / SR;
    let harm;
    switch (type) {
      case 'saw': harm = [1, 0.5, 0.33, 0.25, 0.2, 0.16, 0.14]; break;
      case 'tri': harm = [1, 0, 0.111, 0, 0.04]; break;
      case 'organ': harm = [1, 0.6, 0, 0.4, 0, 0.25]; break;
      case 'glass': harm = [1, 0, 0, 0.3, 0, 0, 0.12]; break;
      default: harm = [1];
    }
    for (let i = 0; i < total; i++) {
      const idx = start + i;
      if (idx < 0 || idx >= this.len) continue;
      let env;
      if (i < aS) env = i / aS;
      else if (i > sS) env = Math.max(0, 1 - (i - sS) / rS);
      else env = 1;
      const t = i / SR;
      const vibr = vib ? Math.sin(2 * Math.PI * 5 * t) * vib : 0;
      let s = 0;
      for (let h = 0; h < harm.length; h++) {
        if (!harm[h]) continue;
        s += harm[h] * Math.sin(w * (h + 1) * i * (1 + vibr));
      }
      const v = s * env;
      this.L[idx] += v * gl;
      this.R[idx] += v * gr;
    }
  }

  /** Plucked string (decaying harmonics + slight inharmonicity). */
  pluck(t0, dur, freq, gain, opts = {}) {
    const { pan = 0, bright = 1 } = opts;
    const start = Math.floor(t0 * SR);
    const total = Math.floor(Math.min(dur + 0.6, 3) * SR);
    const gl = gain * clamp(1 - pan, 0, 1);
    const gr = gain * clamp(1 + pan, 0, 1);
    const w = freq * 2 * Math.PI / SR;
    const H = 6;
    for (let i = 0; i < total; i++) {
      const idx = start + i;
      if (idx < 0 || idx >= this.len) continue;
      const t = i / SR;
      let s = 0;
      for (let h = 1; h <= H; h++) {
        const amp = Math.pow(bright, h - 1) / h;
        const decay = Math.exp(-t * (2.2 + h * 1.6) * (freq > 300 ? 1.4 : 1));
        s += amp * decay * Math.sin(w * h * (1 + 0.0004 * h * h) * i);
      }
      const attack = Math.min(1, i / (0.003 * SR));
      const v = s * attack;
      this.L[idx] += v * gl;
      this.R[idx] += v * gr;
    }
  }

  kick(t0, gain = 0.9) {
    const start = Math.floor(t0 * SR);
    const total = Math.floor(0.28 * SR);
    for (let i = 0; i < total; i++) {
      const idx = start + i;
      if (idx < 0 || idx >= this.len) continue;
      const t = i / SR;
      const f = 120 * Math.exp(-t * 22) + 42;
      const env = Math.exp(-t * 16);
      const v = Math.sin(2 * Math.PI * f * t) * env * gain;
      this.L[idx] += v; this.R[idx] += v;
    }
  }

  hat(t0, gain = 0.16, open = false, rng) {
    const start = Math.floor(t0 * SR);
    const total = Math.floor((open ? 0.22 : 0.05) * SR);
    let lp = 0;
    for (let i = 0; i < total; i++) {
      const idx = start + i;
      if (idx < 0 || idx >= this.len) continue;
      const n = rng() * 2 - 1;
      // crude highpass: subtract lowpassed noise
      lp += 0.25 * (n - lp);
      const env = Math.exp(-i / SR * (open ? 26 : 90));
      const v = (n - lp) * env * gain;
      this.L[idx] += v * 0.8; this.R[idx] += v * 1.1;
    }
  }

  snare(t0, gain = 0.35, rng) {
    const start = Math.floor(t0 * SR);
    const total = Math.floor(0.18 * SR);
    for (let i = 0; i < total; i++) {
      const idx = start + i;
      if (idx < 0 || idx >= this.len) continue;
      const t = i / SR;
      const env = Math.exp(-t * 30);
      const v = ((rng() * 2 - 1) * 0.8 + Math.sin(2 * Math.PI * 190 * t) * 0.4) * env * gain;
      this.L[idx] += v; this.R[idx] += v;
    }
  }

  /** Ping-pong echo + gentle master fade + normalize. */
  finalize(echoSec, echoGain) {
    if (echoGain > 0) {
      const d = Math.floor(echoSec * SR);
      for (let i = this.len - 1; i >= d; i--) {
        this.L[i] += this.R[i - d] * echoGain;
        this.R[i] += this.L[i - d] * echoGain * 0.8;
      }
    }
    const fade = Math.floor(2.5 * SR);
    for (let i = 0; i < fade; i++) {
      const g = i / fade;
      this.L[i] *= g; this.R[i] *= g;
      this.L[this.len - 1 - i] *= g;
      this.R[this.len - 1 - i] *= g;
    }
    let peak = 0;
    for (let i = 0; i < this.len; i++) {
      peak = Math.max(peak, Math.abs(this.L[i]), Math.abs(this.R[i]));
    }
    const norm = peak > 0 ? 0.88 / peak : 1;
    for (let i = 0; i < this.len; i++) { this.L[i] *= norm; this.R[i] *= norm; }
  }

  encodeMp3(file) {
    const enc = new Mp3Encoder(2, SR, 160);
    const block = 1152;
    const chunks = [];
    const l16 = new Int16Array(block);
    const r16 = new Int16Array(block);
    for (let i = 0; i < this.len; i += block) {
      const n = Math.min(block, this.len - i);
      for (let j = 0; j < n; j++) {
        l16[j] = clamp(this.L[i + j], -1, 1) * 32767;
        r16[j] = clamp(this.R[i + j], -1, 1) * 32767;
      }
      const buf = enc.encodeBuffer(l16.subarray(0, n), r16.subarray(0, n));
      if (buf.length) chunks.push(Buffer.from(buf));
    }
    const end = enc.flush();
    if (end.length) chunks.push(Buffer.from(end));
    fs.writeFileSync(file, Buffer.concat(chunks));
  }
}

/* ------------------------------- composition ------------------------------ */

function compose(spec) {
  const rng = mulberry32(spec.seed);
  const scale = SCALES[spec.scale];
  const spb = 60 / spec.bpm;             // seconds per beat
  const barSec = spb * 4;
  const bars = spec.bars;
  const seconds = bars * barSec + 3;
  const song = new Song(seconds);
  const prog = spec.prog;                // chord root degrees per bar

  const chordTones = (deg) => [deg, deg + 2, deg + 4];

  // Section energy curve: intro -> build -> full -> outro
  const energy = (bar) => {
    const p = bar / bars;
    if (p < 0.12) return 0.35;
    if (p < 0.3) return 0.6;
    if (p < 0.82) return 1;
    if (p < 0.92) return 0.7;
    return 0.4;
  };

  for (let bar = 0; bar < bars; bar++) {
    const t0 = bar * barSec;
    const deg = prog[bar % prog.length];
    const tones = chordTones(deg);
    const e = energy(bar);

    /* Pads */
    if (spec.pad && e >= spec.pad.from) {
      for (let k = 0; k < tones.length; k++) {
        const m = degreeToMidi(spec.root, scale, tones[k]);
        song.tone(t0, barSec * 0.98, midiHz(m), spec.pad.gain * (k === 0 ? 1 : 0.75), {
          type: spec.pad.type, attack: barSec * 0.3, release: barSec * 0.4,
          pan: (k - 1) * 0.35, vib: 0.0012, detune: (rng() - 0.5) * 0.002,
        });
      }
    }

    /* Bass */
    if (spec.bass && e >= spec.bass.from) {
      const m = degreeToMidi(spec.root - 24, scale, deg);
      const pat = spec.bass.pattern; // beats at which bass hits
      for (const b of pat) {
        const dur = spec.bass.dur * spb;
        song.tone(t0 + b * spb, dur, midiHz(m), spec.bass.gain * e, {
          type: 'tri', attack: 0.008, release: 0.08,
        });
        if (spec.bass.octaves && rng() < 0.3) {
          song.tone(t0 + (b + 0.5) * spb, dur * 0.5, midiHz(m + 12), spec.bass.gain * 0.5 * e, {
            type: 'tri', attack: 0.008, release: 0.06,
          });
        }
      }
    }

    /* Arpeggio */
    if (spec.arp && e >= spec.arp.from) {
      const steps = spec.arp.steps;      // subdivisions per bar
      for (let s = 0; s < steps; s++) {
        if (rng() < spec.arp.rest) continue;
        const tone = tones[(s + (bar % 2)) % tones.length] + spec.arp.octave * scale.length;
        const m = degreeToMidi(spec.root, scale, tone);
        const tt = t0 + (s / steps) * barSec + (s % 2 ? spec.swing * spb : 0);
        if (spec.arp.pluck) {
          song.pluck(tt, barSec / steps, midiHz(m), spec.arp.gain * e, {
            pan: Math.sin(s * 1.3) * 0.5, bright: 0.72,
          });
        } else {
          song.tone(tt, (barSec / steps) * 0.85, midiHz(m), spec.arp.gain * e, {
            type: spec.arp.type || 'glass', attack: 0.004, release: 0.12,
            pan: Math.sin(s * 1.3) * 0.5,
          });
        }
      }
    }

    /* Lead melody — random walk on the scale, phrase per 2 bars */
    if (spec.lead && e >= spec.lead.from && bar >= spec.lead.startBar) {
      if (bar % 2 === 0) {
        let degWalk = deg + scale.length + Math.floor(rng() * 3);
        let t = 0;
        const phraseBeats = 8;
        while (t < phraseBeats - 0.5) {
          const durB = [0.5, 0.5, 1, 1, 1.5, 2][Math.floor(rng() * 6)];
          if (rng() > spec.lead.rest) {
            const m = degreeToMidi(spec.root, scale, degWalk);
            const when = t0 + t * spb + (spec.swing ? (t % 1) * spec.swing * spb : 0);
            if (spec.lead.pluck) {
              song.pluck(when, durB * spb * 0.9, midiHz(m), spec.lead.gain * e, { bright: 0.8, pan: 0.15 });
            } else {
              song.tone(when, durB * spb * 0.85, midiHz(m), spec.lead.gain * e, {
                type: spec.lead.type, attack: 0.02, release: 0.2, vib: 0.002, pan: 0.12,
              });
            }
          }
          degWalk += [-2, -1, -1, 0, 1, 1, 2, 3][Math.floor(rng() * 8)];
          degWalk = clamp(degWalk, deg + 2, deg + scale.length * 2 + 2);
          t += durB;
        }
      }
    }

    /* Percussion */
    if (spec.drums && e >= spec.drums.from) {
      const d = spec.drums;
      for (const b of d.kick) song.kick(t0 + b * spb, 0.8 * e);
      if (d.snare) for (const b of d.snare) song.snare(t0 + b * spb, 0.3 * e, rng);
      if (d.hats) {
        for (let s = 0; s < d.hats; s++) {
          const tt = t0 + (s * 4 / d.hats) * spb + (s % 2 ? spec.swing * spb : 0);
          song.hat(tt, (s % 2 ? 0.10 : 0.15) * e, d.open && s % d.open === d.open - 1, rng);
        }
      }
    }
  }

  song.finalize(spb * (spec.echo ?? 0.75), spec.echoGain ?? 0.22);
  return song;
}

/* --------------------------------- catalog -------------------------------- */
/* One spec per seed track. Filenames must match server/seed/seed.ts. */

const four = [0, 1, 2, 3];
const TRACKS = [
  // ——— Marlow Ferris — Paper Lanterns (indie electronic, warm) ———
  { file: 'paper-lanterns', seed: 101, bpm: 104, root: 57, scale: 'dorian', bars: 34,
    prog: [0, 5, 3, 4], swing: 0.06,
    pad: { type: 'organ', gain: 0.10, from: 0 },
    bass: { pattern: [0, 1.5, 2.5, 3], dur: 0.6, gain: 0.30, from: 0.5, octaves: true },
    arp: { steps: 8, rest: 0.2, octave: 1, gain: 0.16, from: 0.55, type: 'glass' },
    lead: { type: 'tri', gain: 0.17, rest: 0.25, from: 0.95, startBar: 8 },
    drums: { kick: four, hats: 8, open: 8, snare: [1, 3], from: 0.55 } },
  { file: 'satellite-hearts', seed: 102, bpm: 118, root: 55, scale: 'minor', bars: 36,
    prog: [0, 3, 5, 4], swing: 0,
    pad: { type: 'saw', gain: 0.06, from: 0.3 },
    bass: { pattern: [0, 0.75, 1.5, 2, 2.75, 3.5], dur: 0.45, gain: 0.28, from: 0.5 },
    arp: { steps: 16, rest: 0.28, octave: 1, gain: 0.13, from: 0, type: 'glass' },
    lead: { type: 'saw', gain: 0.12, rest: 0.3, from: 0.95, startBar: 10 },
    drums: { kick: four, hats: 16, open: 8, snare: [1, 3], from: 0.55 } },
  { file: 'vending-machine-light', seed: 103, bpm: 92, root: 60, scale: 'lydian', bars: 30,
    prog: [0, 1, 4, 3], swing: 0.09,
    pad: { type: 'organ', gain: 0.11, from: 0 },
    bass: { pattern: [0, 2, 3.5], dur: 0.8, gain: 0.27, from: 0.5 },
    arp: { steps: 8, rest: 0.35, octave: 1, gain: 0.15, from: 0.3, pluck: true },
    lead: { type: 'glass', gain: 0.15, rest: 0.3, from: 0.9, startBar: 8 },
    drums: { kick: [0, 2.5], hats: 8, snare: [2], from: 0.55 } },
  { file: 'harbour-static', seed: 104, bpm: 110, root: 52, scale: 'minor', bars: 34,
    prog: [0, 0, 5, 6], swing: 0,
    pad: { type: 'saw', gain: 0.07, from: 0 },
    bass: { pattern: [0, 1, 2, 3], dur: 0.9, gain: 0.30, from: 0.5, octaves: true },
    arp: { steps: 16, rest: 0.22, octave: 2, gain: 0.10, from: 0.55, type: 'sine' },
    lead: { type: 'tri', gain: 0.16, rest: 0.35, from: 0.95, startBar: 12 },
    drums: { kick: four, hats: 16, open: 16, snare: [1, 3], from: 0.5 } },
  { file: 'last-orders', seed: 105, bpm: 84, root: 57, scale: 'major', bars: 28,
    prog: [0, 4, 5, 3], swing: 0.1,
    pad: { type: 'organ', gain: 0.10, from: 0 },
    bass: { pattern: [0, 2.5], dur: 1.1, gain: 0.26, from: 0.3 },
    arp: { steps: 8, rest: 0.4, octave: 1, gain: 0.16, from: 0, pluck: true },
    lead: { type: 'tri', gain: 0.15, rest: 0.3, from: 0.85, startBar: 6 },
    drums: { kick: [0, 2], hats: 8, snare: [2], from: 0.55 } },
  // ——— Marlow Ferris — Night Bus (single) ———
  { file: 'night-bus', seed: 110, bpm: 122, root: 53, scale: 'minor', bars: 38,
    prog: [0, 5, 2, 4], swing: 0,
    pad: { type: 'saw', gain: 0.065, from: 0.3 },
    bass: { pattern: [0, 0.5, 1.5, 2, 2.5, 3.5], dur: 0.4, gain: 0.30, from: 0.5 },
    arp: { steps: 16, rest: 0.2, octave: 1, gain: 0.14, from: 0, type: 'glass' },
    lead: { type: 'saw', gain: 0.11, rest: 0.3, from: 0.95, startBar: 12 },
    drums: { kick: four, hats: 16, open: 8, snare: [1, 3], from: 0.5 } },

  // ——— Cascadia Loom — Fern Language (ambient/organic) ———
  { file: 'fern-language', seed: 201, bpm: 66, root: 50, scale: 'lydian', bars: 22,
    prog: [0, 3, 1, 4], swing: 0,
    pad: { type: 'organ', gain: 0.13, from: 0 },
    bass: { pattern: [0], dur: 3.5, gain: 0.20, from: 0.3 },
    arp: { steps: 8, rest: 0.5, octave: 2, gain: 0.09, from: 0.5, type: 'glass' },
    lead: { type: 'sine', gain: 0.13, rest: 0.4, from: 0.9, startBar: 6 },
    echo: 1.5, echoGain: 0.3 },
  { file: 'moss-cathedral', seed: 202, bpm: 58, root: 48, scale: 'major', bars: 20,
    prog: [0, 5, 3, 4], swing: 0,
    pad: { type: 'organ', gain: 0.14, from: 0 },
    bass: { pattern: [0, 2], dur: 1.8, gain: 0.18, from: 0.3 },
    arp: { steps: 4, rest: 0.35, octave: 1, gain: 0.12, from: 0.5, pluck: true },
    lead: { type: 'glass', gain: 0.11, rest: 0.45, from: 0.9, startBar: 6 },
    echo: 1.5, echoGain: 0.32 },
  { file: 'rain-shadow', seed: 203, bpm: 72, root: 52, scale: 'dorian', bars: 24,
    prog: [0, 2, 5, 3], swing: 0.05,
    pad: { type: 'saw', gain: 0.08, from: 0 },
    bass: { pattern: [0, 2.5], dur: 1.4, gain: 0.22, from: 0.3 },
    arp: { steps: 8, rest: 0.4, octave: 1, gain: 0.11, from: 0, type: 'sine' },
    lead: { type: 'tri', gain: 0.13, rest: 0.4, from: 0.85, startBar: 8 },
    drums: { kick: [0], hats: 8, from: 0.9 }, echo: 1.2, echoGain: 0.28 },

  // ——— Ratri & The Tidewater — Muara (folktronica) ———
  { file: 'muara', seed: 301, bpm: 96, root: 55, scale: 'pentMaj', bars: 30,
    prog: [0, 3, 1, 4], swing: 0.08,
    pad: { type: 'organ', gain: 0.09, from: 0.3 },
    bass: { pattern: [0, 1.5, 3], dur: 0.7, gain: 0.26, from: 0.5 },
    arp: { steps: 8, rest: 0.25, octave: 1, gain: 0.18, from: 0, pluck: true },
    lead: { gain: 0.16, rest: 0.3, from: 0.9, startBar: 8, pluck: true },
    drums: { kick: [0, 2.5], hats: 8, snare: [2], from: 0.55 } },
  { file: 'river-market', seed: 302, bpm: 108, root: 57, scale: 'pentMin', bars: 32,
    prog: [0, 0, 3, 4], swing: 0.07,
    pad: { type: 'saw', gain: 0.05, from: 0.5 },
    bass: { pattern: [0, 1, 2.5, 3], dur: 0.5, gain: 0.28, from: 0.5 },
    arp: { steps: 16, rest: 0.3, octave: 1, gain: 0.15, from: 0, pluck: true },
    lead: { gain: 0.15, rest: 0.3, from: 0.95, startBar: 10, pluck: true },
    drums: { kick: four, hats: 16, open: 8, snare: [1, 3], from: 0.5 } },
  { file: 'tidewater-lullaby', seed: 303, bpm: 76, root: 53, scale: 'major', bars: 24,
    prog: [0, 4, 5, 3], swing: 0.1,
    pad: { type: 'organ', gain: 0.11, from: 0 },
    bass: { pattern: [0, 2], dur: 1.2, gain: 0.22, from: 0.3 },
    arp: { steps: 8, rest: 0.4, octave: 1, gain: 0.17, from: 0, pluck: true },
    lead: { type: 'sine', gain: 0.13, rest: 0.4, from: 0.85, startBar: 6 },
    echo: 1.0, echoGain: 0.26 },

  // ——— Vera Lune — singles (downtempo) ———
  { file: 'copper-veins', seed: 401, bpm: 82, root: 50, scale: 'minor', bars: 28,
    prog: [0, 5, 3, 4], swing: 0.12,
    pad: { type: 'saw', gain: 0.07, from: 0 },
    bass: { pattern: [0, 1.75, 2.5], dur: 0.9, gain: 0.32, from: 0.3, octaves: true },
    arp: { steps: 8, rest: 0.35, octave: 1, gain: 0.12, from: 0.55, type: 'glass' },
    lead: { type: 'tri', gain: 0.15, rest: 0.35, from: 0.9, startBar: 8 },
    drums: { kick: [0, 2.75], hats: 8, open: 8, snare: [1, 3], from: 0.5 } },
  { file: 'low-orbit', seed: 402, bpm: 70, root: 48, scale: 'dorian', bars: 24,
    prog: [0, 3, 0, 6], swing: 0.08,
    pad: { type: 'organ', gain: 0.12, from: 0 },
    bass: { pattern: [0, 2.5], dur: 1.4, gain: 0.30, from: 0.3 },
    arp: { steps: 8, rest: 0.4, octave: 2, gain: 0.08, from: 0.5, type: 'sine' },
    lead: { type: 'glass', gain: 0.13, rest: 0.4, from: 0.9, startBar: 8 },
    drums: { kick: [0, 2.5], hats: 8, snare: [2], from: 0.55 }, echo: 1.3, echoGain: 0.3 },

  // ——— The Halfday Union — Commuter Hymns (instrumental post-rock-ish) ———
  { file: 'platform-two', seed: 501, bpm: 128, root: 52, scale: 'mixo', bars: 36,
    prog: [0, 3, 4, 3], swing: 0,
    pad: { type: 'saw', gain: 0.06, from: 0.3 },
    bass: { pattern: [0, 1, 2, 3], dur: 0.9, gain: 0.28, from: 0.5 },
    arp: { steps: 8, rest: 0.15, octave: 1, gain: 0.17, from: 0, pluck: true },
    lead: { gain: 0.15, rest: 0.25, from: 0.95, startBar: 10, pluck: true },
    drums: { kick: [0, 2], hats: 8, snare: [1, 3], from: 0.55 } },
  { file: 'overpass-in-june', seed: 502, bpm: 100, root: 55, scale: 'major', bars: 30,
    prog: [0, 5, 1, 4], swing: 0.05,
    pad: { type: 'organ', gain: 0.09, from: 0 },
    bass: { pattern: [0, 1.5, 3], dur: 0.8, gain: 0.26, from: 0.5 },
    arp: { steps: 8, rest: 0.25, octave: 1, gain: 0.18, from: 0, pluck: true },
    lead: { type: 'tri', gain: 0.14, rest: 0.3, from: 0.9, startBar: 8 },
    drums: { kick: [0, 2.5], hats: 8, snare: [2], from: 0.55 } },
  { file: 'the-quiet-carriage', seed: 503, bpm: 88, root: 50, scale: 'lydian', bars: 26,
    prog: [0, 1, 5, 4], swing: 0.08,
    pad: { type: 'organ', gain: 0.11, from: 0 },
    bass: { pattern: [0, 2], dur: 1.2, gain: 0.24, from: 0.3 },
    arp: { steps: 8, rest: 0.35, octave: 1, gain: 0.16, from: 0, pluck: true },
    lead: { type: 'glass', gain: 0.12, rest: 0.35, from: 0.85, startBar: 6 },
    echo: 1.1, echoGain: 0.25 },

  // ═══ Community catalog (independent creators, published via moderation) ═══

  // ——— Glasshouse Tapes — Winter Garden (bedroom electronic EP) ———
  { file: 'winter-garden', seed: 601, bpm: 78, root: 52, scale: 'dorian', bars: 26,
    prog: [0, 3, 5, 4], swing: 0.11,
    pad: { type: 'organ', gain: 0.12, from: 0 },
    bass: { pattern: [0, 2.5], dur: 1.2, gain: 0.26, from: 0.3 },
    arp: { steps: 8, rest: 0.38, octave: 1, gain: 0.15, from: 0.3, pluck: true },
    lead: { type: 'glass', gain: 0.13, rest: 0.35, from: 0.85, startBar: 6 },
    drums: { kick: [0, 2.5], hats: 8, snare: [2], from: 0.55 },
    echo: 1.2, echoGain: 0.28 },
  { file: 'condensation', seed: 602, bpm: 90, root: 50, scale: 'minor', bars: 28,
    prog: [0, 5, 3, 6], swing: 0.06,
    pad: { type: 'saw', gain: 0.07, from: 0 },
    bass: { pattern: [0, 1.5, 3], dur: 0.7, gain: 0.28, from: 0.5, octaves: true },
    arp: { steps: 16, rest: 0.3, octave: 1, gain: 0.11, from: 0.5, type: 'glass' },
    lead: { type: 'tri', gain: 0.14, rest: 0.35, from: 0.9, startBar: 8 },
    drums: { kick: [0, 1.75, 2.5], hats: 16, open: 16, snare: [1, 3], from: 0.5 } },
  { file: 'orange-peel-sun', seed: 603, bpm: 96, root: 55, scale: 'major', bars: 26,
    prog: [0, 4, 5, 3], swing: 0.1,
    pad: { type: 'organ', gain: 0.1, from: 0 },
    bass: { pattern: [0, 1.5, 2.5], dur: 0.7, gain: 0.26, from: 0.5 },
    arp: { steps: 8, rest: 0.28, octave: 1, gain: 0.17, from: 0, pluck: true },
    lead: { gain: 0.15, rest: 0.3, from: 0.9, startBar: 6, pluck: true },
    drums: { kick: [0, 2], hats: 8, snare: [1, 3], from: 0.55 } },

  // ——— Kite Season — Paper Planes (playful melodic single) ———
  { file: 'paper-planes', seed: 701, bpm: 132, root: 60, scale: 'pentMaj', bars: 32,
    prog: [0, 3, 4, 1], swing: 0,
    pad: { type: 'saw', gain: 0.05, from: 0.5 },
    bass: { pattern: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], dur: 0.35, gain: 0.24, from: 0.5 },
    arp: { steps: 16, rest: 0.18, octave: 1, gain: 0.16, from: 0, type: 'glass' },
    lead: { type: 'tri', gain: 0.16, rest: 0.22, from: 0.9, startBar: 8 },
    drums: { kick: four, hats: 16, open: 8, snare: [1, 3], from: 0.5 } },
  { file: 'rooftop-arcade', seed: 702, bpm: 120, root: 57, scale: 'mixo', bars: 30,
    prog: [0, 0, 3, 4], swing: 0,
    pad: { type: 'organ', gain: 0.07, from: 0.3 },
    bass: { pattern: [0, 0.75, 1.5, 2.25, 3], dur: 0.4, gain: 0.27, from: 0.5 },
    arp: { steps: 16, rest: 0.25, octave: 2, gain: 0.12, from: 0.3, type: 'sine' },
    lead: { type: 'saw', gain: 0.11, rest: 0.28, from: 0.9, startBar: 8 },
    drums: { kick: four, hats: 16, snare: [1, 3], from: 0.5 } },
];

/* ---------------------------------- main ---------------------------------- */

async function main() {
  ({ Mp3Encoder } = await import('@breezystack/lamejs'));
  const only = process.argv[2];
  const manifestPath = path.join(OUT, 'durations.json');
  let manifest = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    : {};
  for (const spec of TRACKS) {
    if (only && spec.file !== only) continue;
    const out = path.join(OUT, `${spec.file}.mp3`);
    const t = Date.now();
    const song = compose(spec);
    song.encodeMp3(out);
    const seconds = Math.round(song.len / SR);
    manifest[spec.file] = seconds;
    console.log(`✓ ${spec.file}.mp3  ${seconds}s  (${((fs.statSync(out).size) / 1e6).toFixed(1)} MB, rendered in ${((Date.now() - t) / 1000).toFixed(1)}s)`);
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log('done.');
}
main().catch((e) => { console.error(e); process.exit(1); });
