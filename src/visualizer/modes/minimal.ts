/** Minimal Spectrum — a small set of typographic-weight bars. Calm by design. */
import { registerMode, smoothBins } from '../engine';

const BARS = 28;
const buf = new Float32Array(BARS);

registerMode({
  id: 'minimal',
  name: 'Minimal Spectrum',
  description: 'A few honest bars. Nothing else.',
  render({ ctx, w, h, frame, settings, accent, paper }) {
    const bins = smoothBins(frame, settings, buf, BARS);
    const gap = w / (BARS * 2);
    const barW = Math.max(3, gap * 0.72);
    const maxH = h * 0.5 * settings.intensity * settings.scale;
    const baseY = h * 0.72;

    for (let i = 0; i < BARS; i++) {
      const x = gap * (i * 2 + 1) + gap / 2;
      const v = bins[i];
      const bh = Math.max(2, v * maxH);
      ctx.fillStyle = i === Math.floor(BARS * 0.25) || i === Math.floor(BARS * 0.66) ? accent : paper;
      ctx.globalAlpha = 0.35 + v * 0.65;
      ctx.fillRect(x, baseY - bh, barW, bh);
      ctx.globalAlpha = 1;
    }
    // baseline
    ctx.fillStyle = paper + '44';
    ctx.fillRect(gap, baseY + 6, w - gap * 2, 1);
  },
});
