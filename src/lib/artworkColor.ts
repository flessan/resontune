/**
 * Extract a tasteful accent color from artwork. Downsamples the image and
 * picks the most saturated mid-lightness cluster, then clamps it into the
 * ResonTune palette range (warm, ink-friendly). Applied as --player-tint so
 * the player surfaces quietly follow the playing record.
 */

const cache = new Map<string, string>();

export async function extractAccent(src: string): Promise<string | null> {
  if (cache.has(src)) return cache.get(src)!;
  try {
    const img = await loadImage(src);
    const canvas = document.createElement('canvas');
    const S = 24;
    canvas.width = S;
    canvas.height = S;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, S, S);
    const data = ctx.getImageData(0, 0, S, S).data;

    let best: { h: number; s: number; l: number; score: number } | null = null;
    for (let i = 0; i < data.length; i += 4) {
      const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
      const score = s * (1 - Math.abs(l - 0.5) * 1.6);
      if (score > (best?.score ?? 0.08)) best = { h, s, l, score };
    }
    if (!best) return null;
    // Clamp into a livable range.
    const s = Math.min(0.62, Math.max(0.35, best.s));
    const l = Math.min(0.52, Math.max(0.38, best.l));
    const hex = hslToHex(best.h, s, l);
    cache.set(src, hex);
    return hex;
  } catch {
    return null;
  }
}

/**
 * Material-You dynamic color: the playing artwork influences tonal PLAYER
 * surfaces (via --player-tint) — it never recolors the application. The
 * app's own primary/navigation/typography identity stays stable.
 */
export function applyAccent(hex: string | null): void {
  const root = document.documentElement;
  if (!hex) {
    root.style.removeProperty('--player-tint');
    return;
  }
  root.style.setProperty('--player-tint', hex);
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const to = (t: number) => Math.round(hue2rgb(p, q, t) * 255).toString(16).padStart(2, '0');
  return `#${to(h + 1 / 3)}${to(h)}${to(h - 1 / 3)}`;
}
