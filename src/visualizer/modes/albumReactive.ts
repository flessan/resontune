/** Album Reactive - the artwork itself becomes the instrument. */
import { registerMode } from '../engine';

registerMode({
  id: 'album-reactive',
  name: 'Album Reactive',
  description: 'The cover art pulses, tilts and echoes with the track.',
  render({ ctx, w, h, t, frame, settings, accent, paper, artwork }) {
    const cx = w / 2;
    const cy = h / 2;
    const size = Math.min(w, h) * 0.42 * settings.scale;
    const pulse = 1 + frame.bass * 0.09 * settings.intensity;
    const tilt = Math.sin(t * 0.4) * 0.02 + frame.mid * 0.03 * settings.intensity;

    // echo rings driven by level
    ctx.strokeStyle = accent + '2e';
    for (let ring = 0; ring < 3; ring++) {
      const rr = size * (0.75 + ring * 0.22) * (1 + frame.level * 0.35 * settings.intensity);
      ctx.lineWidth = 2 - ring * 0.5;
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(tilt);
    ctx.scale(pulse, pulse);
    if (artwork) {
      ctx.save();
      ctx.beginPath();
      const r = size / 2;
      ctx.roundRect(-r, -r, size, size, size * 0.04);
      ctx.clip();
      ctx.drawImage(artwork, -r, -r, size, size);
      ctx.restore();
      ctx.strokeStyle = paper + '66';
      ctx.lineWidth = 1;
      ctx.strokeRect(-size / 2, -size / 2, size, size);
    } else {
      ctx.fillStyle = accent + '33';
      ctx.fillRect(-size / 2, -size / 2, size, size);
      ctx.fillStyle = paper;
      ctx.font = `${size * 0.4}px Poppins, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('♪', 0, 0);
    }
    ctx.restore();

    // frequency ticks under the artwork
    const tickY = cy + size * 0.62 + 20;
    const count = 48;
    const span = size * 1.4;
    for (let i = 0; i < count; i++) {
      const v = (frame.freq[Math.floor((i / count) * frame.binCount * 0.6)] ?? 0) / 255;
      const x = cx - span / 2 + (i / count) * span;
      const bh = 2 + v * 26 * settings.intensity;
      ctx.fillStyle = i % 8 === 0 ? accent : paper + '99';
      ctx.fillRect(x, tickY - bh / 2, 2, bh);
    }
  },
});
