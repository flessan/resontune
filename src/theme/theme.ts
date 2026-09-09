/**
 * ResonTune custom themes.
 *
 * A theme is six colors the user actually understands - background, surface,
 * primary, secondary, text, muted. Everything else (tonal surface steps,
 * outlines, containers, state layers, the visualizer's color language) is
 * derived here, so choosing a palette never turns into a graphics editor.
 *
 * The module is deliberately split into pure functions (validation,
 * derivation, contrast math - all unit-testable) and two DOM appliers
 * (applyCustomTheme / clearCustomTheme) that write the derived tokens as
 * inline CSS custom properties on <html>. Inline properties win over the
 * stylesheet's [data-theme] blocks, so the whole app recolors instantly
 * with no reload and no component churn.
 */

export interface ResonPalette {
  background: string;
  surface: string;
  primary: string;
  secondary: string;
  text: string;
  muted: string;
}

export const PALETTE_KEYS = [
  'background',
  'surface',
  'primary',
  'secondary',
  'text',
  'muted',
] as const;

export type PaletteKey = (typeof PALETTE_KEYS)[number];

export const PALETTE_LABELS: Record<PaletteKey, string> = {
  background: 'Background',
  surface: 'Surface',
  primary: 'Primary',
  secondary: 'Secondary',
  text: 'Text',
  muted: 'Muted',
};

/** The ResonTune identity as a palette - the seed for custom editing. */
export const DEFAULT_PALETTE: ResonPalette = {
  background: '#131110',
  surface: '#211d1b',
  primary: '#ffb693',
  secondary: '#e7bead',
  text: '#ece5e1',
  muted: '#9a8d86',
};

export interface ThemePreset {
  id: string;
  name: string;
  palette: ResonPalette;
}

/**
 * A small set of carefully picked palettes. Flat, mature, music-oriented -
 * they exist as starting points, not as the customization system itself.
 */
export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'paper',
    name: 'Paper',
    palette: {
      background: '#f6f1e7',
      surface: '#ede5d6',
      primary: '#8f4a2b',
      secondary: '#5b6455',
      text: '#292319',
      muted: '#77705f',
    },
  },
  {
    id: 'ember',
    name: 'Ember',
    palette: {
      background: '#181210',
      surface: '#251b17',
      primary: '#d96c4f',
      secondary: '#e8d5b0',
      text: '#f1e8e2',
      muted: '#a18d84',
    },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    palette: {
      background: '#101519',
      surface: '#1a2229',
      primary: '#6aa7c8',
      secondary: '#d3c5a2',
      text: '#e7edf0',
      muted: '#8ba0ac',
    },
  },
  {
    id: 'forest',
    name: 'Forest',
    palette: {
      background: '#12160f',
      surface: '#1c2318',
      primary: '#93b46f',
      secondary: '#d9cba4',
      text: '#e9ece0',
      muted: '#96a18b',
    },
  },
  {
    id: 'mono',
    name: 'Mono',
    palette: {
      background: '#141414',
      surface: '#1f1f1f',
      primary: '#e8e8e8',
      secondary: '#9d9d9d',
      text: '#f0f0f0',
      muted: '#8a8a8a',
    },
  },
];

export function findPreset(id: string | null | undefined): ThemePreset | undefined {
  return THEME_PRESETS.find((p) => p.id === id);
}

/* ------------------------------------------------------------------ *
 * Color math. Hex only - the palette editor produces #rrggbb, and a
 * strict format means an invalid stored value can never poison the UI.
 * ------------------------------------------------------------------ */

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isValidColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_RE.test(value.trim());
}

/** Expand #rgb, lowercase, trim - so equality checks and CSS agree. */
export function normalizeColor(value: string): string {
  const raw = value.trim().toLowerCase().replace('#', '');
  const six = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  return `#${six}`;
}

function channels(hex: string): [number, number, number] {
  const n = normalizeColor(hex).slice(1);
  return [
    parseInt(n.slice(0, 2), 16),
    parseInt(n.slice(2, 4), 16),
    parseInt(n.slice(4, 6), 16),
  ];
}

function toHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Blend a toward b by t (0..1). */
export function mixColors(a: string, b: string, t: number): string {
  const [ar, ag, ab] = channels(a);
  const [br, bg, bb] = channels(b);
  const k = Math.min(1, Math.max(0, t));
  return toHex(ar + (br - ar) * k, ag + (bg - ag) * k, ab + (bb - ab) * k);
}

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1..21. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export function isDarkColor(hex: string): boolean {
  return luminance(hex) < 0.35;
}

/** Near-black or near-white, whichever reads better on the given color. */
export function readableOn(bg: string): string {
  return contrastRatio('#f5f2ef', bg) >= contrastRatio('#171412', bg) ? '#f5f2ef' : '#171412';
}

/**
 * Nudge fg toward readable ink until it clears the requested contrast
 * against bg. Silent readability guard: the user keeps their color in the
 * editor; the applied token is simply never allowed to disappear.
 */
export function ensureContrast(fg: string, bg: string, min = 4.5): string {
  if (contrastRatio(fg, bg) >= min) return normalizeColor(fg);
  const target = readableOn(bg);
  for (let t = 0.1; t < 1; t += 0.1) {
    const c = mixColors(fg, target, t);
    if (contrastRatio(c, bg) >= min) return c;
  }
  return target;
}

/**
 * Coerce arbitrary stored data into a complete, valid palette. Invalid or
 * missing fields fall back per-field, so a corrupt localStorage entry can
 * never break the app - it just loses the broken color.
 */
export function sanitizePalette(
  input: unknown,
  fallback: ResonPalette = DEFAULT_PALETTE,
): ResonPalette {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const out = {} as Record<PaletteKey, string>;
  for (const key of PALETTE_KEYS) {
    const v = src[key];
    out[key] = isValidColor(v) ? normalizeColor(v) : fallback[key];
  }
  return out as ResonPalette;
}

/** Which pairs the theme editor should warn about, in user language. */
export function paletteWarnings(palette: ResonPalette): string[] {
  const p = sanitizePalette(palette);
  const warnings: string[] = [];
  if (contrastRatio(p.text, p.background) < 4.5) {
    warnings.push('Text and Background are close - ResonTune keeps text readable automatically.');
  }
  if (contrastRatio(p.primary, p.background) < 1.8) {
    warnings.push('Primary blends into the Background - buttons and highlights may be hard to spot.');
  }
  if (contrastRatio(p.surface, p.background) < 1.05) {
    warnings.push('Surface matches the Background - cards will not stand out.');
  }
  return warnings;
}

/* ------------------------------------------------------------------ *
 * Token derivation: six colors in, the whole design system out.
 * ------------------------------------------------------------------ */

export function deriveThemeTokens(palette: ResonPalette): Record<string, string> {
  const p = sanitizePalette(palette);
  const dark = isDarkColor(p.background);

  // Readability guards: applied text always clears WCAG AA against both the
  // background and the raised surface; muted text stays legible but soft.
  const text = ensureContrast(p.text, p.background, 4.5);
  const softText = ensureContrast(p.muted, p.surface, 3);

  const edge = dark ? '#000000' : '#ffffff';
  const tertiary = mixColors(p.primary, p.secondary, 0.5);

  const primaryContainer = mixColors(p.primary, p.background, 0.72);
  const secondaryContainer = mixColors(p.secondary, p.background, 0.7);
  const tertiaryContainer = mixColors(tertiary, p.background, 0.72);

  return {
    '--surface': p.background,
    '--surface-container-lowest': mixColors(p.background, edge, dark ? 0.35 : 0.5),
    '--surface-container-low': mixColors(p.background, p.surface, 0.5),
    '--surface-container': p.surface,
    '--surface-container-high': mixColors(p.surface, text, 0.06),
    '--surface-container-highest': mixColors(p.surface, text, 0.11),
    '--on-surface': text,
    '--on-surface-variant': softText,

    '--outline': mixColors(softText, p.background, 0.2),
    '--outline-variant': mixColors(softText, p.background, 0.65),

    '--primary': p.primary,
    '--on-primary': ensureContrast(readableOn(p.primary), p.primary, 4.5),
    '--primary-container': primaryContainer,
    '--on-primary-container': ensureContrast(mixColors(p.primary, text, 0.55), primaryContainer, 4.5),

    '--secondary': p.secondary,
    '--on-secondary': ensureContrast(readableOn(p.secondary), p.secondary, 4.5),
    '--secondary-container': secondaryContainer,
    '--on-secondary-container': ensureContrast(mixColors(p.secondary, text, 0.55), secondaryContainer, 4.5),

    '--tertiary': tertiary,
    '--on-tertiary': ensureContrast(readableOn(tertiary), tertiary, 4.5),
    '--tertiary-container': tertiaryContainer,
    '--on-tertiary-container': ensureContrast(mixColors(tertiary, text, 0.55), tertiaryContainer, 4.5),

    // With a custom identity the player follows the user's primary, not the
    // playing artwork - the theme *is* the identity.
    '--player-tint': p.primary,

    // The immersive stage: keeps the palette's hue but always stays deep
    // enough for the light chrome on top of it.
    '--viz-stage': mixColors(p.background, '#000000', dark ? 0.45 : 0.86),
  };
}

/* ------------------------------------------------------------------ *
 * Theme → visualizer color language. The visualizer never has its own
 * color settings; it borrows exactly three voices from the theme.
 * ------------------------------------------------------------------ */

export interface VizPalette {
  /** the stage the canvas sits on (informational - canvases stay transparent) */
  stage: string;
  /** primary motion - the main line, the breathing ring, the loud bars */
  accent: string;
  /** secondary elements - companion lines, sparse highlights */
  secondary: string;
  /** quiet structural ink - grids, idle bars, translucent layers */
  ink: string;
}

export function visualizerPalette(palette: ResonPalette): VizPalette {
  const p = sanitizePalette(palette);
  return {
    stage: p.background,
    accent: ensureContrast(p.primary, p.background, 1.8),
    secondary: ensureContrast(p.secondary, p.background, 1.8),
    ink: mixColors(ensureContrast(p.text, p.background, 3), p.background, 0.25),
  };
}

/**
 * The visualizer's colors, read from whatever theme is live right now.
 * Custom themes write their derived tokens inline, built-in themes get them
 * from the stylesheet - either way the computed values are plain hex, so
 * one reader covers both. --player-tint keeps the artwork-tinted player
 * identity on built-in themes; under a custom theme it *is* the primary.
 */
export function readThemeVizPalette(): VizPalette {
  if (typeof document === 'undefined') return visualizerPalette(DEFAULT_PALETTE);
  const cs = getComputedStyle(document.documentElement);
  const read = (name: string, fb: string) => {
    const v = cs.getPropertyValue(name).trim();
    return isValidColor(v) ? normalizeColor(v) : fb;
  };
  return {
    stage: read('--surface', DEFAULT_PALETTE.background),
    accent: read('--player-tint', read('--primary', DEFAULT_PALETTE.primary)),
    secondary: read('--secondary', DEFAULT_PALETTE.secondary),
    ink: read('--outline', DEFAULT_PALETTE.muted),
  };
}

/* ------------------------------------------------------------------ *
 * DOM application.
 * ------------------------------------------------------------------ */

let appliedKeys: string[] = [];

/** True when a custom palette is currently driving the design tokens. */
export function isCustomThemeActive(): boolean {
  return typeof document !== 'undefined'
    && document.documentElement.dataset.customTheme === '1';
}

export function applyCustomTheme(palette: ResonPalette): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const tokens = deriveThemeTokens(palette);
  // Clear anything the previous palette set but this one does not.
  for (const key of appliedKeys) {
    if (!(key in tokens)) root.style.removeProperty(key);
  }
  for (const [key, value] of Object.entries(tokens)) {
    root.style.setProperty(key, value);
  }
  appliedKeys = Object.keys(tokens);
  const dark = isDarkColor(sanitizePalette(palette).background);
  root.dataset.theme = dark ? 'dark' : 'light';
  root.dataset.customTheme = '1';
  root.style.colorScheme = dark ? 'dark' : 'light';
}

export function clearCustomTheme(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  for (const key of appliedKeys) root.style.removeProperty(key);
  appliedKeys = [];
  delete root.dataset.customTheme;
  root.style.removeProperty('color-scheme');
}
