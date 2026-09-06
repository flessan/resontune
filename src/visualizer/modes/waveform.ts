/** Waveform — a hand-drawn-feeling oscilloscope line, like ink on dark paper. */
import { registerMode } from '../engine';

registerMode({
  id: 'waveform',
  name: 'Waveform',
  description: 'A single ink line tracing the actual signal.',
  render({ ctx, w, h, frame, settings, accent, paper }) {
    const wave = frame.wave;
    const n = wave.length;
    const mid = h / 2;
    const amp = h * 0.3 * settings.intensity * settings.scale;

    // ghost line (previous-ish, thicker, faint)
    ctx.lineWidth = 6;
    ctx.strokeStyle = accent + '33';
    ctx.beginPath();
    for (let i = 0; i < n; i += 4) {
      const x = (i / n) * w;
      const v = (wave[i] - 128) / 128;
      const y = mid + v * amp * settings.sensitivity;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // main line
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = paper;
    ctx.beginPath();
    for (let i = 0; i < n; i += 2) {
      const x = (i / n) * w;
      const v = (wave[i] - 128) / 128;
      const y = mid + v * amp * settings.sensitivity;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // baseline ticks — quiet metronome of the layout
    ctx.strokeStyle = paper + '22';
    ctx.lineWidth = 1;
    for (let i = 1; i < 8; i++) {
      const x = (i / 8) * w;
      ctx.beginPath();
      ctx.moveTo(x, mid - 6);
      ctx.lineTo(x, mid + 6);
      ctx.stroke();
    }
  },
});
