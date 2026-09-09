import { describe, expect, it } from 'vitest';
import type { AnalysisFrame } from '@/player/engine';
import {
  LEVEL_PRESETS,
  findMode,
  listModes,
  paintVisualizer,
  resolveModeId,
  resolveModeIdSafe,
  smoothBins,
  DEFAULT_SETTINGS,
} from './engine';
import './modes';
import { STYLE_IDS } from './styles';

function frame(level = 0.6): AnalysisFrame {
  const freq = new Uint8Array(1024);
  const wave = new Uint8Array(2048).fill(128);
  freq.fill(180, 0, 80);
  freq.fill(90, 80, 400);
  for (let i = 0; i < wave.length; i++) wave[i] = 128 + Math.round(Math.sin(i / 24) * 40);
  return {
    freq,
    wave,
    level,
    bass: 0.7,
    mid: 0.4,
    treble: 0.2,
    sampleRate: 44100,
    binCount: 1024,
  };
}

describe('visualizer styles', () => {
  it('registers exactly the named listening-room styles', () => {
    expect(listModes().map((m) => m.id)).toEqual([...STYLE_IDS]);
    expect(resolveModeId('minimal')).toBe('bars');
    expect(resolveModeId('waveform')).toBe('wave');
  });

  it('every style is a distinct renderer, not a shared function', () => {
    const renders = listModes().map((m) => m.render);
    expect(new Set(renders).size).toBe(renders.length);
  });

  it('legacy and unknown style ids land on a real style', () => {
    expect(resolveModeIdSafe('off')).toBe('bars');       // "Off" is a switch now
    expect(resolveModeIdSafe('album')).toBe('hifi');
    expect(resolveModeIdSafe('procedural')).toBe('hyperspace');
    expect(resolveModeIdSafe('definitely-not-a-style')).toBe('bars');
    expect(resolveModeIdSafe(null)).toBe('bars');
    for (const id of STYLE_IDS) expect(resolveModeIdSafe(id)).toBe(id);
  });

  it('Waterfall is fully removed: not listed, not findable, sanitized when persisted', () => {
    expect([...STYLE_IDS]).not.toContain('waterfall');
    expect(listModes().some((m) => m.id === 'waterfall')).toBe(false);
    expect(listModes().some((m) => /waterfall/i.test(m.name) || /waterfall/i.test(m.description))).toBe(false);
    // an old persisted selection lands on a safe fallback, not a dead mode
    expect(resolveModeIdSafe('waterfall')).toBe('bars');
    expect(findMode('waterfall')?.id).toBe('bars');
  });

  it('intensity presets change how strongly bins are drawn', () => {
    const low = new Float32Array(8);
    const high = new Float32Array(8);
    const f = frame();
    smoothBins(f, { ...DEFAULT_SETTINGS, ...LEVEL_PRESETS.minimal, smoothing: 0 }, low, 8);
    smoothBins(f, { ...DEFAULT_SETTINGS, ...LEVEL_PRESETS.full, smoothing: 0 }, high, 8);
    expect(high[0]).toBeGreaterThan(low[0]);
  });

  it('Wave paints from the analyser waveform, not a fake clock', () => {
    const ops: string[] = [];
    const ctx = {
      save() {},
      restore() {},
      beginPath() { ops.push('path'); },
      moveTo() { ops.push('move'); },
      lineTo() { ops.push('line'); },
      stroke() { ops.push('stroke'); },
      fill() {},
      arc() {},
      closePath() {},
      fillRect() {},
      roundRect() {},
      fillText() {},
    } as unknown as CanvasRenderingContext2D;
    Object.defineProperty(ctx, 'strokeStyle', { set() {}, get() { return ''; } });
    Object.defineProperty(ctx, 'fillStyle', { set() {}, get() { return ''; } });
    Object.defineProperty(ctx, 'lineWidth', { set() {}, get() { return 1; } });
    Object.defineProperty(ctx, 'globalAlpha', { set() {}, get() { return 1; } });
    Object.defineProperty(ctx, 'font', { set() {}, get() { return ''; } });
    Object.defineProperty(ctx, 'textAlign', { set() {}, get() { return 'left'; } });
    paintVisualizer(ctx, 400, 200, frame(), findMode('wave')!, DEFAULT_SETTINGS);
    expect(ops).toContain('stroke');
    expect(ops.filter((o) => o === 'line').length).toBeGreaterThan(10);
  });

  it('draws in the theme colors it is given, for every style', () => {
    for (const id of STYLE_IDS) {
      const colors: string[] = [];
      const ctx = {
        save() {}, restore() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
        stroke() {}, fill() {}, arc() {}, fillRect() {}, roundRect() {}, fillText() {},
      } as unknown as CanvasRenderingContext2D;
      for (const prop of ['strokeStyle', 'fillStyle'] as const) {
        Object.defineProperty(ctx, prop, {
          set(v: string) { colors.push(String(v)); },
          get() { return ''; },
        });
      }
      for (const prop of ['lineWidth', 'globalAlpha'] as const) {
        Object.defineProperty(ctx, prop, { set() {}, get() { return 1; } });
      }
      for (const prop of ['font', 'textAlign'] as const) {
        Object.defineProperty(ctx, prop, { set() {}, get() { return ''; } });
      }
      paintVisualizer(ctx, 400, 200, frame(), findMode(id)!, { ...DEFAULT_SETTINGS, smoothing: 0 }, {
        accent: '#c0392b',      // theme primary: red
        secondary: '#f5eeda',   // theme secondary: cream
        paper: '#8a8a8a',
      });
      const joined = colors.join(' ');
      // red primary motion: rgba(192,57,43,…)
      expect(joined, `style "${id}" should draw with the theme primary`).toContain('192,57,43');
      // cream secondary voice: rgba(245,238,218,…)
      expect(joined, `style "${id}" should draw with the theme secondary`).toContain('245,238,218');
    }
  });
});
