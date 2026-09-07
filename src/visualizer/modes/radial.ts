/** Radial - spectrum bars arranged on a circle, like a letterpress sunburst. */
import { registerMode, smoothBins } from '../engine';

const BARS = 96;
const buf = new Float32Array(BARS);

registerMode({
  id: 'radial',
  name: 'Circular Spectrum',
  description: 'Frequency bars radiating from a quiet center.',
  render({ ctx, w, h, t, frame, settings, accent, paper }) {
    const bins = smoothBins(frame, settings, buf, BARS);
    const cx = w / 2;
    const cy = h / 2;
    const base = Math.min(w, h) * 0.21 * settings.scale;
    const maxLen = Math.min(w, h) * 0.24 * settings.intensity;
    const rot = t * 0.05;

    ctx.lineCap = 'round';
    for (let i = 0; i < BARS; i++) {
      const angle = (i / BARS) * Math.PI * 2 + rot;
      const v = bins[i];
      const len = 3 + v * maxLen;
      const r0 = base + frame.bass * 14 * settings.intensity;
      const x0 = cx + Math.cos(angle) * r0;
      const y0 = cy + Math.sin(angle) * r0;
      const x1 = cx + Math.cos(angle) * (r0 + len);
      const y1 = cy + Math.sin(angle) * (r0 + len);
      ctx.strokeStyle = i % 4 === 0 ? accent : paper + 'cc';
      ctx.lineWidth = i % 4 === 0 ? 3 : 1.6;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }

    // inner ring
    ctx.strokeStyle = paper + '55';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, base * 0.82 + frame.level * 10, 0, Math.PI * 2);
    ctx.stroke();
  },
});
