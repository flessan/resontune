/** Geometric - concentric polygons that count the beat. */
import { registerMode, smoothBins } from '../engine';

const N = 6;
const buf = new Float32Array(N);

registerMode({
  id: 'geometric',
  name: 'Geometric',
  description: 'Nested polygons rotating against each other.',
  render({ ctx, w, h, t, frame, settings, accent, paper }) {
    const bins = smoothBins(frame, settings, buf, N);
    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.min(w, h) * 0.36 * settings.scale;

    for (let ring = 0; ring < N; ring++) {
      const sides = 3 + ring;
      const v = bins[ring];
      const r = maxR * ((ring + 1) / N) * (1 + v * 0.16 * settings.intensity);
      const rot = t * 0.12 * (ring % 2 === 0 ? 1 : -1) + ring * 0.35;
      ctx.beginPath();
      for (let i = 0; i <= sides; i++) {
        const a = (i / sides) * Math.PI * 2 + rot;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = ring === 2 ? accent : paper + (ring % 2 ? '88' : '44');
      ctx.lineWidth = ring === 2 ? 2.4 : 1.3;
      ctx.stroke();
    }

    // bass diamond at center
    const d = 6 + frame.bass * 40 * settings.intensity;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 4 + t * 0.3);
    ctx.fillStyle = accent;
    ctx.fillRect(-d / 2, -d / 2, d, d);
    ctx.restore();
  },
});
