import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PALETTE,
  PALETTE_KEYS,
  THEME_PRESETS,
  applyCustomTheme,
  clearCustomTheme,
  contrastRatio,
  deriveThemeTokens,
  ensureContrast,
  findPreset,
  isCustomThemeActive,
  isValidColor,
  mixColors,
  normalizeColor,
  paletteWarnings,
  readThemeVizPalette,
  sanitizePalette,
  visualizerPalette,
} from './theme';

describe('palette validation', () => {
  it('accepts #rgb and #rrggbb, rejects everything else', () => {
    expect(isValidColor('#fff')).toBe(true);
    expect(isValidColor('#A1B2C3')).toBe(true);
    expect(isValidColor(' #a1b2c3 ')).toBe(true);
    expect(isValidColor('red')).toBe(false);
    expect(isValidColor('#ffff')).toBe(false);
    expect(isValidColor('rgb(1,2,3)')).toBe(false);
    expect(isValidColor('url(javascript:alert(1))')).toBe(false);
    expect(isValidColor(12)).toBe(false);
    expect(isValidColor(null)).toBe(false);
  });

  it('normalizes short hex and case', () => {
    expect(normalizeColor('#ABC')).toBe('#aabbcc');
    expect(normalizeColor(' #FF0000 ')).toBe('#ff0000');
  });

  it('sanitizes garbage into a complete palette, field by field', () => {
    const p = sanitizePalette({ background: '#000', primary: 'not-a-color', text: 42 });
    expect(p.background).toBe('#000000');
    expect(p.primary).toBe(DEFAULT_PALETTE.primary);
    expect(p.text).toBe(DEFAULT_PALETTE.text);
    for (const key of PALETTE_KEYS) expect(isValidColor(p[key])).toBe(true);
  });

  it('survives non-object input entirely', () => {
    expect(sanitizePalette(null)).toEqual(DEFAULT_PALETTE);
    expect(sanitizePalette('hello')).toEqual(DEFAULT_PALETTE);
    expect(sanitizePalette([])).toEqual(DEFAULT_PALETTE);
  });
});

describe('contrast handling', () => {
  it('computes WCAG contrast', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrastRatio('#777777', '#777777')).toBe(1);
  });

  it('pushes unreadable text toward readability', () => {
    const fixed = ensureContrast('#141414', '#131110', 4.5);
    expect(contrastRatio(fixed, '#131110')).toBeGreaterThanOrEqual(4.5);
  });

  it('leaves already-readable colors untouched', () => {
    expect(ensureContrast('#ffffff', '#000000', 4.5)).toBe('#ffffff');
  });

  it('warns in user language when text and background collide', () => {
    const warnings = paletteWarnings({
      ...DEFAULT_PALETTE,
      text: '#131110',
      background: '#131110',
    });
    expect(warnings.some((w) => w.includes('Text and Background'))).toBe(true);
    expect(paletteWarnings(DEFAULT_PALETTE)).toEqual([]);
  });
});

describe('token derivation', () => {
  it('derives the full design-token set from six colors', () => {
    const tokens = deriveThemeTokens(DEFAULT_PALETTE);
    for (const key of [
      '--surface', '--surface-container', '--on-surface', '--primary', '--on-primary',
      '--secondary', '--outline', '--outline-variant', '--player-tint',
    ]) {
      expect(tokens[key], key).toBeTruthy();
    }
  });

  it('keeps applied text readable even when the user picks a bad pair', () => {
    const tokens = deriveThemeTokens({
      ...DEFAULT_PALETTE,
      background: '#202020',
      text: '#252525',
    });
    expect(contrastRatio(tokens['--on-surface'], tokens['--surface'])).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps on-primary readable on any primary', () => {
    for (const primary of ['#ffffff', '#000000', '#c0392b', '#f7f1a1']) {
      const tokens = deriveThemeTokens({ ...DEFAULT_PALETTE, primary });
      expect(contrastRatio(tokens['--on-primary'], tokens['--primary'])).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('mixColors interpolates channels', () => {
    expect(mixColors('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixColors('#ff0000', '#00ff00', 0)).toBe('#ff0000');
    expect(mixColors('#ff0000', '#00ff00', 1)).toBe('#00ff00');
  });
});

describe('theme → visualizer color mapping', () => {
  it('maps the charcoal/red/cream example to a matching stage', () => {
    const viz = visualizerPalette({
      background: '#26221f',   // dark charcoal
      surface: '#332e2a',
      primary: '#c0392b',      // red
      secondary: '#f5eeda',    // cream
      text: '#f0ebe4',
      muted: '#9c948a',
    });
    expect(viz.stage).toBe('#26221f');
    expect(viz.accent).toBe('#c0392b');       // readable on the stage → kept as-is
    expect(viz.secondary).toBe('#f5eeda');
    expect(viz.ink).not.toBe(viz.accent);     // the muted layer stays its own voice
  });

  it('rescues a primary that would vanish into the background', () => {
    const viz = visualizerPalette({ ...DEFAULT_PALETTE, background: '#131110', primary: '#131110' });
    expect(contrastRatio(viz.accent, '#131110')).toBeGreaterThanOrEqual(1.8);
  });

  it('never throws on an invalid palette', () => {
    const viz = visualizerPalette({ background: 'zzz', primary: '' } as never);
    expect(isValidColor(viz.accent)).toBe(true);
    expect(isValidColor(viz.stage)).toBe(true);
  });
});

describe('DOM application', () => {
  it('applies and clears inline tokens without residue', () => {
    applyCustomTheme(DEFAULT_PALETTE);
    const root = document.documentElement;
    expect(isCustomThemeActive()).toBe(true);
    expect(root.style.getPropertyValue('--primary')).toBe(DEFAULT_PALETTE.primary);
    expect(root.dataset.theme).toBe('dark');

    clearCustomTheme();
    expect(isCustomThemeActive()).toBe(false);
    expect(root.style.getPropertyValue('--primary')).toBe('');
  });

  it('a light background flips the derived scheme to light', () => {
    applyCustomTheme({ ...THEME_PRESETS.find((p) => p.id === 'paper')!.palette });
    expect(document.documentElement.dataset.theme).toBe('light');
    clearCustomTheme();
  });

  it('readThemeVizPalette reads the applied custom tokens', () => {
    applyCustomTheme({
      background: '#26221f',
      surface: '#332e2a',
      primary: '#c0392b',
      secondary: '#f5eeda',
      text: '#f0ebe4',
      muted: '#9c948a',
    });
    const viz = readThemeVizPalette();
    expect(viz.accent).toBe('#c0392b');      // --player-tint IS the user primary
    expect(viz.secondary).toBe('#f5eeda');
    expect(viz.stage).toBe('#26221f');
    clearCustomTheme();
  });

  it('falls back to the ResonTune identity when no tokens resolve (jsdom default)', () => {
    clearCustomTheme();
    const viz = readThemeVizPalette();
    expect(isValidColor(viz.accent)).toBe(true);
    expect(isValidColor(viz.ink)).toBe(true);
  });
});

describe('presets', () => {
  it('provides a small, valid, findable set', () => {
    expect(THEME_PRESETS.length).toBeLessThanOrEqual(6);
    for (const preset of THEME_PRESETS) {
      expect(findPreset(preset.id)).toBe(preset);
      expect(sanitizePalette(preset.palette)).toEqual(preset.palette);
      // every preset must survive the same readability rules as user palettes
      expect(paletteWarnings(preset.palette)).toEqual([]);
    }
    expect(findPreset('nope')).toBeUndefined();
  });
});
