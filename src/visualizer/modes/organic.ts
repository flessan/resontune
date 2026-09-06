/** Organic — a breathing blob whose silhouette is shaped by the spectrum. */
import { registerMode, smoothBins } from '../engine';

const POINTS = 64;
const buf = new Float32Array(POINTS);

registerMode({
  id: 'organic',
  name: 'Organic',
  description: 'A soft form that breathes with the music.',
  render({ ctx, w, h, t, frame, settings, accent, paper }) {
    const bins = smoothBins(frame, settings, buf, POINTS);
    const cx = w / 2;
    const cy = h / 2;
    const base = Math.min(w, h) * 0.24 * settings.scale;

    const shape = (radiusMul: number, wobble: number, alpha: string) => {
      ctx.beginPath();
      for (let i = 0; i <= POINTS; i++) {
        const idx = i % POINTS;
        const angle = (i / POINTS) * Math.PI * 2;
        const noise =
          Math.sin(angle * 3 + t * 0.9) * wobble +
          Math.sin(angle * 5 - t * 0.6) * wobble * 0.6;
        const r =
          base * radiusMul +
          bins[idx] * base * 0.55 * settings.intensity +
          noise +
          frame.bass * 22 * settings.intensity;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = alpha;
      ctx.fill();
    };

    shape(1.16, 10, accent + '1f');
    shape(1.0, 7, accent + '3d');
    shape(0.8, 4, paper + '2a');

    // core dot
    ctx.beginPath();
    ctx.arc(cx, cy, 4 + frame.level * 26 * settings.intensity, 0, Math.PI * 2);
    ctx.fillStyle = paper;
    ctx.fill();
  },
});
