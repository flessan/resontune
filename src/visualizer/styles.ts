/**
 * ResonTune visualizer styles.
 *
 * Each mode is pure geometry + motion; its color language comes entirely
 * from the theme (accent = primary, secondary = secondary, paper = quiet
 * ink). Every mode consumes an AnalysisFrame from the shared player (or
 * Flow) analyser — never a fake timer.
 *
 * Musicality: modes share a tiny `Dyn` dynamics tracker that turns raw
 * analysis into musical gestures - eased level (fast attack, slow release,
 * like a VU needle), a kick envelope (bass onset with a decaying tail) and
 * momentum. Motion follows the music: transients punch, sustains breathe,
 * silence settles. No randomness, no rainbow cycling, no bloom.
 */
import { registerMode, smoothBins, type VisualizerContext } from './engine';

const PEACH = '#ffb693';
const CREAM = '#f3e6d8';

function ink(vc: Pick<VisualizerContext, 'paper'>, a = 1): string {
  return hexAlpha(vc.paper || CREAM, a);
}

function hexAlpha(hex: string, a: number): string {
  const h = hex.trim();
  if (h.startsWith('rgba') || h.startsWith('rgb')) return h;
  const raw = h.replace('#', '');
  const n = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw.padEnd(6, '0').slice(0, 6);
  const r = parseInt(n.slice(0, 2), 16) || 243;
  const g = parseInt(n.slice(2, 4), 16) || 230;
  const b = parseInt(n.slice(4, 6), 16) || 216;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`;
}

/**
 * Per-style dynamics: derives musical gestures from the raw frame.
 *
 * - `level`  eased amplitude - VU ballistics (fast attack, slow release)
 * - `kick`   bass-onset envelope: jumps on a transient, decays like a drum
 * - `drive`  motion momentum 0.15..1 - quiet music drifts, loud music flows
 *
 * dt comes from the mode clock, so pause freezes and reduced-motion slows
 * everything together with the rest of the engine.
 */
class Dyn {
  private bassAvg = 0;
  private levelSm = 0;
  private kickEnv = 0;
  private driveSm = 0.3;
  private lastT = -1;

  read(frame: { bass: number; level: number }, t: number) {
    let dt = this.lastT < 0 ? 1 / 60 : t - this.lastT;
    if (dt < 0 || dt > 0.25) dt = 1 / 60; // mode restart / tab return
    this.lastT = t;

    // VU-style level: attack ~40ms, release ~400ms.
    const la = frame.level > this.levelSm ? 1 - Math.exp(-dt / 0.04) : 1 - Math.exp(-dt / 0.4);
    this.levelSm += (frame.level - this.levelSm) * la;

    // Kick: bass rising clearly above its own recent average is an onset.
    const onset = Math.max(0, frame.bass - this.bassAvg - 0.03);
    this.bassAvg += (frame.bass - this.bassAvg) * Math.min(1, dt * 3.2);
    this.kickEnv = Math.max(this.kickEnv * Math.exp(-dt / 0.18), Math.min(1, onset * 5));

    // Drive: how much the piece is "moving" right now.
    const target = Math.min(1, 0.15 + this.levelSm * 1.6 + this.kickEnv * 0.4);
    this.driveSm += (target - this.driveSm) * Math.min(1, dt * 2);

    return { level: this.levelSm, kick: this.kickEnv, drive: this.driveSm, dt };
  }
}

/* ------------------------------------------------------------------ */

const waveDyn = new Dyn();
registerMode({
  id: 'wave',
  name: 'Wave',
  description: 'A single line tracing the audible waveform.',
  render(vc) {
    const { ctx, w, h, frame, settings, accent, secondary, t } = vc;
    const { level, kick } = waveDyn.read(frame, t);
    const wave = frame.wave;
    const n = wave.length;
    const mid = h * 0.55;
    // Amplitude breathes with the eased level, not the raw jittery frame.
    const amp = h * (0.1 + level * 0.24) * settings.intensity * settings.scale;
    const step = Math.max(1, Math.floor(n / Math.min(720, w)));

    // Quiet secondary baseline under the primary line - two voices, one wave.
    ctx.lineWidth = 1;
    ctx.strokeStyle = hexAlpha(secondary, 0.28);
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(w, mid);
    ctx.stroke();

    // Echo pass: the same waveform a beat behind, faint, in the secondary.
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = hexAlpha(secondary, 0.16 + level * 0.12);
    ctx.beginPath();
    const lag = Math.floor(n / 5);
    for (let i = 0; i < n; i += step) {
      const x = (i / n) * w;
      const y = mid + ((wave[(i + lag) % n] - 128) / 128) * amp * 0.6 * settings.sensitivity;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Primary line: width firms up on the kick - a felt pulse, not a flash.
    ctx.lineWidth = 1.7 + kick * 1.3;
    ctx.strokeStyle = hexAlpha(accent || PEACH, 0.75 + kick * 0.2);
    ctx.beginPath();
    for (let i = 0; i < n; i += step) {
      const x = (i / n) * w;
      const y = mid + ((wave[i] - 128) / 128) * amp * settings.sensitivity;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  },
});

const barBuf = new Float32Array(40);
const barPeaks = new Float32Array(40);
const barDyn = new Dyn();
registerMode({
  id: 'bars',
  name: 'Bars',
  description: 'Quiet spectrum columns along the floor of the stage.',
  render(vc) {
    const { ctx, w, h, frame, settings, accent, secondary, t } = vc;
    const { kick, dt } = barDyn.read(frame, t);
    const n = 36;
    const bins = smoothBins(frame, settings, barBuf, n);
    const gap = w / (n * 1.7);
    const barW = Math.max(2, gap * 0.62);
    const maxH = h * 0.42 * settings.intensity * settings.scale;
    const base = h * 0.78;
    const fall = dt * 0.35; // peak caps fall slowly - classic hi-fi momentum
    for (let i = 0; i < n; i++) {
      const v = bins[i];
      const bh = Math.max(2, v * maxH);
      const x = 24 + i * (barW + gap * 0.55);
      // Loud bars speak in the primary (brighter on the kick); every
      // seventh in the secondary; quiet ones stay structural ink.
      ctx.fillStyle = i % 7 === 0
        ? hexAlpha(secondary, 0.5 + v * 0.4)
        : v > 0.55 ? hexAlpha(accent || PEACH, 0.7 + kick * 0.25) : ink(vc, 0.35 + v * 0.5);
      ctx.beginPath();
      ctx.roundRect(x, base - bh, barW, bh, Math.min(barW / 2, 3));
      ctx.fill();
      // Peak-hold cap: rides transients up, decays down on its own.
      barPeaks[i] = Math.max(v, barPeaks[i] - fall);
      const py = base - Math.max(2, barPeaks[i] * maxH) - 4;
      ctx.fillStyle = i % 7 === 0 ? hexAlpha(secondary, 0.55) : ink(vc, 0.4);
      ctx.fillRect(x, py, barW, 1.5);
    }
  },
});

const scopeDyn = new Dyn();
registerMode({
  id: 'scope',
  name: 'Scope',
  description: 'A centered oscilloscope, like a listening-room meter.',
  render({ ctx, w, h, frame, settings, paper, accent, secondary, t }) {
    const { level, kick } = scopeDyn.read(frame, t);
    const midX = w / 2;
    const midY = h / 2;
    // The dial eases with the program level - it breathes, never jumps.
    const amp = Math.min(w, h) * (0.12 + level * 0.12) * settings.intensity * settings.scale;
    ctx.strokeStyle = hexAlpha(paper, 0.18);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(midX, midY, amp * 1.4, 0, Math.PI * 2);
    ctx.stroke();
    // Secondary tick marks: transients light them briefly, then they settle.
    ctx.strokeStyle = hexAlpha(secondary, 0.3 + kick * 0.4);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const r0 = amp * 1.4;
      ctx.beginPath();
      ctx.moveTo(midX + Math.cos(a) * r0, midY + Math.sin(a) * r0);
      ctx.lineTo(midX + Math.cos(a) * (r0 + 5 + kick * 3), midY + Math.sin(a) * (r0 + 5 + kick * 3));
      ctx.stroke();
    }
    ctx.strokeStyle = hexAlpha(accent || PEACH, 0.8 + kick * 0.15);
    ctx.lineWidth = 1.6 + kick;
    ctx.beginPath();
    const wave = frame.wave;
    const n = wave.length;
    const step = Math.max(1, Math.floor(n / 360));
    for (let i = 0; i < n; i += step) {
      const p = i / n;
      const v = ((wave[i] - 128) / 128) * settings.sensitivity;
      const x = midX + (p - 0.5) * w * 0.62;
      const y = midY + v * amp;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  },
});

const coronaBuf = new Float32Array(48);
const coronaDyn = new Dyn();
let coronaRipple = 0; // radius progress 0..1 of the last kick ripple
registerMode({
  id: 'corona',
  name: 'Corona',
  description: 'A soft ring around the center, breathing with the bass.',
  render(vc) {
    const { ctx, w, h, frame, settings, accent, secondary, t } = vc;
    const { level, kick, dt } = coronaDyn.read(frame, t);
    const bins = smoothBins(frame, settings, coronaBuf, 48);
    const cx = w / 2;
    const cy = h * 0.52;
    const r0 = Math.min(w, h) * (0.14 + level * 0.05) * settings.scale;

    // Steady secondary inner circle: the calm center the corona breathes around.
    ctx.beginPath();
    ctx.arc(cx, cy, r0 * 0.72, 0, Math.PI * 2);
    ctx.strokeStyle = hexAlpha(secondary, 0.35);
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // One restrained ripple per kick: a ring that expands and fades.
    if (kick > 0.55 && coronaRipple <= 0) coronaRipple = 0.001;
    if (coronaRipple > 0) {
      coronaRipple = Math.min(1, coronaRipple + dt * 1.4);
      const rr = r0 * (1.15 + coronaRipple * 1.1);
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx.strokeStyle = hexAlpha(secondary, 0.32 * (1 - coronaRipple));
      ctx.lineWidth = 1.4;
      ctx.stroke();
      if (coronaRipple >= 1) coronaRipple = 0;
    }

    ctx.beginPath();
    for (let i = 0; i <= 48; i++) {
      const v = bins[i % 48];
      const a = (i / 48) * Math.PI * 2 - Math.PI / 2;
      const r = r0 + v * r0 * 1.1 * settings.intensity;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = hexAlpha(accent || PEACH, 0.55 + frame.bass * 0.3);
    ctx.lineWidth = 2 + kick * 1.2;
    ctx.stroke();
    ctx.fillStyle = hexAlpha(accent || PEACH, 0.05 + frame.bass * 0.06);
    ctx.fill();
  },
});

const ribbonDyn = new Dyn();
let ribbonPhase = 0;
registerMode({
  id: 'ribbon',
  name: 'Ribbon',
  description: 'Two slow ribbons following mid and treble energy.',
  render({ ctx, w, h, frame, settings, accent, secondary, t }) {
    const { drive, dt } = ribbonDyn.read(frame, t);
    // The ribbons flow at the music's pace: quiet passages drift, loud
    // passages stream. Phase advances with drive, not a constant timer.
    ribbonPhase += dt * (0.3 + drive * 1.1);
    const draw = (y0: number, color: string, band: number, phase: number) => {
      ctx.beginPath();
      const amp = h * 0.08 * settings.intensity * settings.scale * (0.4 + band);
      for (let x = 0; x <= w; x += 6) {
        const y = y0 + Math.sin(x * 0.01 + ribbonPhase * 0.8 + phase) * amp * settings.sensitivity
          + Math.sin(x * 0.023 - ribbonPhase * 0.5) * amp * 0.4;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.4;
      ctx.stroke();
    };
    // One ribbon per theme voice: secondary carries the mids, primary the air.
    draw(h * 0.42, hexAlpha(secondary, 0.55 + frame.mid * 0.25), frame.mid, 0);
    draw(h * 0.58, hexAlpha(accent || PEACH, 0.65 + frame.treble * 0.3), frame.treble, 1.2);
  },
});

const hifiBuf = new Float32Array(24);
const hifiDyn = new Dyn();
const hifiNeedles = new Float32Array(3);   // VU ballistics per meter
const hifiPeaks = new Float32Array(3);     // peak-hold markers
registerMode({
  id: 'hifi',
  name: 'Hi-Fi',
  description: 'A listening-room meter: bass, mid, air.',
  render(vc) {
    const { ctx, w, h, frame, settings, accent, secondary, paper, t } = vc;
    const { kick, dt } = hifiDyn.read(frame, t);
    const bins = smoothBins(frame, settings, hifiBuf, 18);
    const values = [frame.bass, frame.mid, frame.treble];
    const meter = (label: string, x: number, idx: number) => {
      const raw = values[idx];
      // Real VU ballistics: ~65ms attack, ~500ms release.
      const a = raw > hifiNeedles[idx] ? 1 - Math.exp(-dt / 0.065) : 1 - Math.exp(-dt / 0.5);
      hifiNeedles[idx] += (raw - hifiNeedles[idx]) * a;
      hifiPeaks[idx] = Math.max(hifiNeedles[idx], hifiPeaks[idx] - dt * 0.25);
      const v = hifiNeedles[idx];
      const bw = 18;
      const bh = h * 0.38 * settings.scale;
      const y = h * 0.7;
      ctx.fillStyle = hexAlpha(paper, 0.12);
      ctx.fillRect(x, y - bh, bw, bh);
      const fill = Math.max(2, v * bh * settings.intensity);
      ctx.fillStyle = hexAlpha(accent || PEACH, 0.55 + v * 0.3 + kick * 0.1);
      ctx.fillRect(x, y - fill, bw, fill);
      // Peak-hold marker in the secondary voice - falls on its own time.
      const py = y - Math.max(2, hifiPeaks[idx] * bh * settings.intensity);
      ctx.fillStyle = hexAlpha(secondary, 0.8);
      ctx.fillRect(x, py - 1.5, bw, 2);
      ctx.fillStyle = hexAlpha(paper, 0.45);
      ctx.font = '500 10px Poppins, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, x + bw / 2, y + 16);
    };
    const cx = w / 2;
    meter('BASS', cx - 70, 0);
    meter('MID', cx - 9, 1);
    meter('AIR', cx + 52, 2);
    const n = 18;
    for (let i = 0; i < n; i++) {
      const x = 40 + (i / n) * (w - 80);
      const v = bins[i];
      ctx.fillStyle = hexAlpha(paper, 0.2 + v * 0.5);
      ctx.fillRect(x, h * 0.22, 3, 4 + v * 18 * settings.intensity);
    }
  },
});

const vectorDyn = new Dyn();
registerMode({
  id: 'vectorscope',
  name: 'Vectorscope',
  description: 'A Lissajous of the waveform against a delayed copy.',
  render({ ctx, w, h, frame, settings, accent, secondary, paper, t }) {
    const { level, kick } = vectorDyn.read(frame, t);
    const wave = frame.wave;
    const n = wave.length;
    const delay = Math.floor(n / 4);
    const cx = w / 2;
    const cy = h * 0.52;
    // The instrument's throw eases with the program level.
    const amp = Math.min(w, h) * (0.14 + level * 0.1) * settings.intensity * settings.scale * settings.sensitivity;
    ctx.strokeStyle = hexAlpha(paper, 0.12);
    ctx.beginPath();
    ctx.arc(cx, cy, amp, 0, Math.PI * 2);
    ctx.stroke();
    // Secondary crosshair - the instrument's frame.
    ctx.strokeStyle = hexAlpha(secondary, 0.22);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - amp, cy);
    ctx.lineTo(cx + amp, cy);
    ctx.moveTo(cx, cy - amp);
    ctx.lineTo(cx, cy + amp);
    ctx.stroke();
    // Ghost pass first (secondary, slightly larger) - phosphor persistence
    // without any glow: just a second quiet trace.
    const trace = (scale: number, style: string, width: number) => {
      ctx.beginPath();
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      const step = Math.max(2, Math.floor(n / 280));
      for (let i = 0; i < n; i += step) {
        const x = cx + ((wave[i] - 128) / 128) * amp * scale;
        const y = cy + ((wave[(i + delay) % n] - 128) / 128) * amp * scale;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    trace(1.06, hexAlpha(secondary, 0.14 + level * 0.1), 1);
    trace(1, hexAlpha(accent || PEACH, 0.62 + level * 0.2 + kick * 0.12), 1.3);
  },
});

const hyperDyn = new Dyn();
let hyperTravel = 0;
registerMode({
  id: 'hyperspace',
  name: 'Hyperspace',
  description: 'Soft depth lines that recede with the kick.',
  render({ ctx, w, h, frame, settings, paper, accent, secondary, t }) {
    const { level, kick, drive, dt } = hyperDyn.read(frame, t);
    const cx = w / 2;
    const cy = h * 0.5;
    const lines = 10;
    // Travel accumulates with musical drive; the kick gives a push that
    // momentum then carries - the tunnel accelerates and coasts.
    hyperTravel += dt * (0.05 + drive * 0.12 + kick * 0.25);
    ctx.lineWidth = 1.2;
    for (let i = 0; i < lines; i++) {
      const p = ((i / lines) + hyperTravel % 1) % 1;
      const r = 12 + p * Math.min(w, h) * 0.48 * settings.scale;
      // Newest ring (smallest) speaks in the primary right after a kick.
      const isFresh = p < 1 / lines;
      ctx.strokeStyle = isFresh && kick > 0.25
        ? hexAlpha(accent || PEACH, 0.3 + kick * 0.45)
        : hexAlpha(paper, 0.18 + level * 0.2);
      ctx.globalAlpha = (1 - p) * 0.7;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // A still secondary point at the vanishing center - somewhere to travel to.
    ctx.fillStyle = hexAlpha(secondary, 0.5 + level * 0.3);
    ctx.beginPath();
    ctx.arc(cx, cy, 2 + level * 2, 0, Math.PI * 2);
    ctx.fill();
  },
});

const outrunDyn = new Dyn();
let outrunScroll = 0;
registerMode({
  id: 'outrun',
  name: 'Outrun',
  description: 'A warm horizon; the floor rolls at the music\u2019s pace.',
  render({ ctx, w, h, frame, settings, paper, accent, secondary, t }) {
    const { level, kick, drive, dt } = outrunDyn.read(frame, t);
    // The horizon settles with the eased level (not the raw bass jitter).
    const horizon = h * (0.46 - level * 0.04 * settings.intensity);
    ctx.strokeStyle = hexAlpha(accent || PEACH, 0.35 + kick * 0.25);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    ctx.lineTo(w, horizon);
    ctx.stroke();
    // Rows roll toward the viewer at the music's drive - momentum, not a timer.
    outrunScroll = (outrunScroll + dt * (0.12 + drive * 0.55)) % 1;
    const rows = 7;
    for (let i = 0; i < rows; i++) {
      const p = ((i + outrunScroll) / rows) % 1;
      const y = horizon + (h - horizon) * (p * p);
      ctx.strokeStyle = hexAlpha(paper, (0.1 + frame.level * 0.12) * (0.35 + p * 0.65));
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    const vanish = w / 2;
    for (let i = -6; i <= 6; i++) {
      // Sparse secondary voice on the outermost verticals - a quiet frame.
      ctx.strokeStyle = Math.abs(i) === 6
        ? hexAlpha(secondary, 0.3)
        : hexAlpha(paper, 0.16 + frame.level * 0.12);
      ctx.beginPath();
      ctx.moveTo(vanish + i * 18, horizon);
      ctx.lineTo(vanish + i * (w * 0.16), h);
      ctx.stroke();
    }
  },
});

export const STYLE_IDS = [
  'wave',
  'bars',
  'scope',
  'corona',
  'ribbon',
  'hifi',
  'vectorscope',
  'hyperspace',
  'outrun',
] as const;

export type VisualizerStyleId = (typeof STYLE_IDS)[number];
