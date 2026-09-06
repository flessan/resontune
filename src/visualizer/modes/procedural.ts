/** Procedural — a field of drifting particles nudged by the spectrum.
 *  Deliberately restrained: dust motes in lamplight, not a fireworks show. */
import { registerMode } from '../engine';

interface Mote {
  x: number; y: number;
  vx: number; vy: number;
  band: number;      // which frequency band drives it
  size: number;
}

let motes: Mote[] = [];
let seededFor = '';

function seed(w: number, h: number) {
  const key = `${w}x${h}`;
  if (seededFor === key && motes.length) return;
  seededFor = key;
  motes = [];
  const count = Math.min(140, Math.floor((w * h) / 16000));
  for (let i = 0; i < count; i++) {
    motes.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      band: Math.random(),
      size: 0.8 + Math.random() * 2.2,
    });
  }
}

registerMode({
  id: 'procedural',
  name: 'Procedural',
  description: 'A quiet field of motes stirred by frequency bands.',
  render({ ctx, w, h, frame, settings, accent, paper, reducedMotion }) {
    seed(w, h);
    const speedMul = (reducedMotion ? 0.2 : 1) * settings.speed;

    for (const m of motes) {
      const bin = Math.floor(m.band * frame.binCount * 0.5);
      const v = ((frame.freq[bin] ?? 0) / 255) * settings.sensitivity;

      m.x += m.vx * (1 + v * 8 * settings.intensity) * speedMul * 2;
      m.y += m.vy * (1 + v * 8 * settings.intensity) * speedMul * 2 - v * 0.8 * settings.intensity;

      if (m.x < -10) m.x = w + 10;
      if (m.x > w + 10) m.x = -10;
      if (m.y < -10) m.y = h + 10;
      if (m.y > h + 10) m.y = -10;

      const r = m.size * (1 + v * 2.4 * settings.intensity) * settings.scale;
      ctx.beginPath();
      ctx.arc(m.x, m.y, r, 0, Math.PI * 2);
      ctx.fillStyle = m.band > 0.86 ? accent : paper;
      ctx.globalAlpha = 0.12 + v * 0.6;
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // horizon line held down by the bass
    const y = h * 0.78 + frame.bass * 30 * settings.intensity;
    ctx.strokeStyle = paper + '30';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w * 0.08, y);
    ctx.lineTo(w * 0.92, y);
    ctx.stroke();
  },
});
