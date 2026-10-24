/**
 * ResonTune visualizer styles. Each mode consumes an AnalysisFrame from
 * the shared player (or Flow) analyser — never a fake timer.
 */
import { registerMode, smoothBins, type VisualizerContext } from './engine';

const PEACH = '#ffb693';
const CREAM = '#f3e6d8';

function ink(vc: VisualizerContext, a = 1): string {
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

registerMode({
  id: 'off',
  name: 'Off',
  description: 'No visualization.',
  render() { /* nothing */ },
});

registerMode({
  id: 'wave',
  name: 'Wave',
  description: 'A single line tracing the audible waveform.',
  render({ ctx, w, h, frame, settings, paper }) {
    const wave = frame.wave;
    const n = wave.length;
    const mid = h * 0.55;
    const amp = h * 0.22 * settings.intensity * settings.scale;
    ctx.lineWidth = 2;
    ctx.strokeStyle = ink({ paper } as VisualizerContext, 0.82);
    ctx.beginPath();
    const step = Math.max(1, Math.floor(n / Math.min(720, w)));
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
registerMode({
  id: 'bars',
  name: 'Bars',
  description: 'Quiet spectrum columns along the floor of the stage.',
  render(vc) {
    const { ctx, w, h, frame, settings, accent } = vc;
    const n = 36;
    const bins = smoothBins(frame, settings, barBuf, n);
    const gap = w / (n * 1.7);
    const barW = Math.max(2, gap * 0.62);
    const maxH = h * 0.42 * settings.intensity * settings.scale;
    const base = h * 0.78;
    for (let i = 0; i < n; i++) {
      const v = bins[i];
      const bh = Math.max(2, v * maxH);
      const x = 24 + i * (barW + gap * 0.55);
      ctx.fillStyle = i % 7 === 0 ? accent : ink(vc, 0.35 + v * 0.5);
      ctx.beginPath();
      ctx.roundRect(x, base - bh, barW, bh, Math.min(barW / 2, 3));
      ctx.fill();
    }
  },
});

registerMode({
  id: 'scope',
  name: 'Scope',
  description: 'A centered oscilloscope, like a listening-room meter.',
  render({ ctx, w, h, frame, settings, paper, accent }) {
    const midX = w / 2;
    const midY = h / 2;
    const amp = Math.min(w, h) * 0.18 * settings.intensity * settings.scale;
    ctx.strokeStyle = hexAlpha(paper, 0.18);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(midX, midY, amp * 1.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = hexAlpha(accent || PEACH, 0.85);
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    const wave = frame.wave;
    const n = wave.length;
    const step = Math.max(1, Math.floor(n / 360));
    for (let i = 0; i < n; i += step) {
      const t = i / n;
      const v = ((wave[i] - 128) / 128) * settings.sensitivity;
      const x = midX + (t - 0.5) * w * 0.62;
      const y = midY + v * amp;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  },
});

const coronaBuf = new Float32Array(48);
registerMode({
  id: 'corona',
  name: 'Corona',
  description: 'A soft ring around the center, breathing with the bass.',
  render(vc) {
    const { ctx, w, h, frame, settings, accent } = vc;
    const bins = smoothBins(frame, settings, coronaBuf, 48);
    const cx = w / 2;
    const cy = h * 0.52;
    const r0 = Math.min(w, h) * 0.16 * settings.scale;
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
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.fillStyle = hexAlpha(accent || PEACH, 0.05 + frame.bass * 0.06);
    ctx.fill();
  },
});

registerMode({
  id: 'ribbon',
  name: 'Ribbon',
  description: 'Two slow ribbons following mid and treble energy.',
  render({ ctx, w, h, frame, settings, paper, accent, t }) {
    const draw = (y0: number, color: string, band: number, phase: number) => {
      ctx.beginPath();
      const amp = h * 0.08 * settings.intensity * settings.scale * (0.4 + band);
      for (let x = 0; x <= w; x += 6) {
        const y = y0 + Math.sin(x * 0.01 + t * 0.8 + phase) * amp * settings.sensitivity
          + Math.sin(x * 0.023 - t * 0.5) * amp * 0.4;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.4;
      ctx.stroke();
    };
    draw(h * 0.42, hexAlpha(paper, 0.55), frame.mid, 0);
    draw(h * 0.58, hexAlpha(accent || PEACH, 0.7), frame.treble, 1.2);
  },
});

const fallBuf = new Float32Array(48);
const fallRows: Float32Array[] = [];
registerMode({
  id: 'waterfall',
  name: 'Waterfall',
  description: 'A slow spectrogram falling like tape dust.',
  render(vc) {
    const { ctx, w, h, frame, settings, accent, paper } = vc;
    const cols = 40;
    const bins = smoothBins(frame, settings, fallBuf, cols);
    const row = new Float32Array(cols);
    row.set(bins);
    fallRows.unshift(row);
    const maxRows = Math.max(24, Math.floor(h / 10));
    if (fallRows.length > maxRows) fallRows.length = maxRows;
    const rowH = h / maxRows;
    const colW = w / cols;
    for (let r = 0; r < fallRows.length; r++) {
      const fade = 1 - r / maxRows;
      for (let c = 0; c < cols; c++) {
        const v = fallRows[r][c] * settings.intensity;
        if (v < 0.04) continue;
        ctx.fillStyle = hexAlpha(c % 8 === 0 ? accent : paper, 0.12 + v * 0.45 * fade);
        ctx.fillRect(c * colW, r * rowH, colW - 1, rowH - 0.5);
      }
    }
  },
});

const hifiBuf = new Float32Array(24);
registerMode({
  id: 'hifi',
  name: 'Hi-Fi',
  description: 'A listening-room meter: bass, mid, air.',
  render(vc) {
    const { ctx, w, h, frame, settings, accent, paper } = vc;
    const bins = smoothBins(frame, settings, hifiBuf, 18);
    const meter = (label: string, x: number, v: number) => {
      const bw = 18;
      const bh = h * 0.38 * settings.scale;
      const y = h * 0.7;
      ctx.fillStyle = hexAlpha(paper, 0.12);
      ctx.fillRect(x, y - bh, bw, bh);
      const fill = Math.max(2, v * bh * settings.intensity);
      ctx.fillStyle = hexAlpha(accent || PEACH, 0.55 + v * 0.35);
      ctx.fillRect(x, y - fill, bw, fill);
      ctx.fillStyle = hexAlpha(paper, 0.45);
      ctx.font = '500 10px Poppins, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, x + bw / 2, y + 16);
    };
    const cx = w / 2;
    meter('BASS', cx - 70, frame.bass);
    meter('MID', cx - 9, frame.mid);
    meter('AIR', cx + 52, frame.treble);
    const n = 18;
    for (let i = 0; i < n; i++) {
      const x = 40 + (i / n) * (w - 80);
      const v = bins[i];
      ctx.fillStyle = hexAlpha(paper, 0.2 + v * 0.5);
      ctx.fillRect(x, h * 0.22, 3, 4 + v * 18 * settings.intensity);
    }
  },
});

registerMode({
  id: 'vectorscope',
  name: 'Vectorscope',
  description: 'A Lissajous of the waveform against a delayed copy.',
  render({ ctx, w, h, frame, settings, accent, paper }) {
    const wave = frame.wave;
    const n = wave.length;
    const delay = Math.floor(n / 4);
    const cx = w / 2;
    const cy = h * 0.52;
    const amp = Math.min(w, h) * 0.2 * settings.intensity * settings.scale * settings.sensitivity;
    ctx.strokeStyle = hexAlpha(paper, 0.12);
    ctx.beginPath();
    ctx.arc(cx, cy, amp, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.strokeStyle = hexAlpha(accent || PEACH, 0.7);
    ctx.lineWidth = 1.3;
    const step = Math.max(2, Math.floor(n / 280));
    for (let i = 0; i < n; i += step) {
      const x = cx + ((wave[i] - 128) / 128) * amp;
      const y = cy + ((wave[(i + delay) % n] - 128) / 128) * amp;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  },
});

registerMode({
  id: 'hyperspace',
  name: 'Hyperspace',
  description: 'Soft depth lines that recede with the kick.',
  render({ ctx, w, h, frame, settings, paper, t }) {
    const cx = w / 2;
    const cy = h * 0.5;
    const lines = 10;
    const drive = 0.25 + frame.bass * 0.55 * settings.intensity;
    ctx.strokeStyle = hexAlpha(paper, 0.18 + frame.level * 0.2);
    ctx.lineWidth = 1.2;
    for (let i = 0; i < lines; i++) {
      const p = ((i / lines) + (t * 0.08 * drive) % 1) % 1;
      const r = 12 + p * Math.min(w, h) * 0.48 * settings.scale;
      ctx.globalAlpha = (1 - p) * 0.7;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },
});

registerMode({
  id: 'outrun',
  name: 'Outrun',
  description: 'A warm horizon, not neon — the floor tilts with the bass.',
  render({ ctx, w, h, frame, settings, paper, accent, t }) {
    const horizon = h * (0.46 - frame.bass * 0.03 * settings.intensity);
    ctx.strokeStyle = hexAlpha(accent || PEACH, 0.35);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    ctx.lineTo(w, horizon);
    ctx.stroke();
    const rows = 7;
    ctx.strokeStyle = hexAlpha(paper, 0.16 + frame.level * 0.12);
    for (let i = 1; i <= rows; i++) {
      const p = i / rows;
      const y = horizon + (h - horizon) * (p * p);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    const vanish = w / 2;
    const shift = Math.sin(t * 0.3) * 8 * frame.mid;
    for (let i = -6; i <= 6; i++) {
      ctx.beginPath();
      ctx.moveTo(vanish + i * 18 + shift, horizon);
      ctx.lineTo(vanish + i * (w * 0.16), h);
      ctx.stroke();
    }
  },
});

export const STYLE_IDS = [
  'off',
  'wave',
  'bars',
  'scope',
  'corona',
  'ribbon',
  'waterfall',
  'hifi',
  'vectorscope',
  'hyperspace',
  'outrun',
] as const;

export type VisualizerStyleId = (typeof STYLE_IDS)[number];
