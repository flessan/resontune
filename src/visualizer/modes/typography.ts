/** Typography — the track title set huge, weight and width driven by sound. */
import { registerMode } from '../engine';

let cachedTitle = '';
let cachedArtist = '';

export function setTypographyText(title: string, artist: string): void {
  cachedTitle = title;
  cachedArtist = artist;
}

registerMode({
  id: 'typography',
  name: 'Typography',
  description: 'The title itself becomes the visual, breathing with the mix.',
  render({ ctx, w, h, t, frame, settings, accent, paper }) {
    const title = cachedTitle || 'ResonTune';
    const artist = cachedArtist || 'Open music. For everyone.';
    const cx = w / 2;
    const cy = h / 2;

    const level = frame.level * settings.sensitivity;
    const baseSize = Math.min(w / Math.max(6, title.length * 0.62), h * 0.22) * settings.scale;
    const size = baseSize * (1 + level * 0.25 * settings.intensity);

    // stacked repeated title — like a letterpress proof sheet
    const rows = 5;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < rows; i++) {
      const off = i - (rows - 1) / 2;
      const y = cy + off * size * 1.02;
      const isCenter = off === 0;
      const wobble = Math.sin(t * 0.8 + i * 1.3) * 4 * settings.intensity;
      const bandV = (frame.freq[Math.floor(((i + 1) / (rows + 2)) * frame.binCount * 0.5)] ?? 0) / 255;
      ctx.font = `${isCenter ? 700 : 400} ${size}px Poppins, sans-serif`;
      if (isCenter) {
        ctx.fillStyle = paper;
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = Math.abs(off) === 1 ? accent : paper;
        ctx.globalAlpha = Math.max(0.06, 0.3 - Math.abs(off) * 0.1 + bandV * 0.3);
      }
      ctx.fillText(title, cx + wobble * (isCenter ? 0 : 1), y);
    }
    ctx.globalAlpha = 1;

    // artist line
    ctx.font = `500 ${Math.max(12, size * 0.16)}px Poppins, sans-serif`;
    ctx.fillStyle = accent;
    const spacing = 4 + frame.treble * 20 * settings.intensity;
    const text = artist.toUpperCase().split('').join('\u200a'.repeat(Math.round(spacing / 4)));
    ctx.fillText(text, cx, cy + size * 2.9);
  },
});
