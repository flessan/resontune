import { describe, expect, it } from 'vitest';
import type { AnalysisFrame } from '@/player/engine';
import {
  LEVEL_PRESETS,
  findMode,
  listModes,
  paintVisualizer,
  resolveModeId,
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
  it('registers Off plus the named listening-room styles', () => {
    expect(listModes().map((m) => m.id)).toEqual([...STYLE_IDS]);
    expect(findMode('off')?.name).toBe('Off');
    expect(resolveModeId('minimal')).toBe('bars');
    expect(resolveModeId('waveform')).toBe('wave');
  });

  it('Off is a real no-op style', () => {
    const calls: string[] = [];
    const ctx = {
      save() { calls.push('save'); },
      restore() { calls.push('restore'); },
      beginPath() { calls.push('draw'); },
      fill() { calls.push('draw'); },
      stroke() { calls.push('draw'); },
    } as unknown as CanvasRenderingContext2D;
    paintVisualizer(ctx, 200, 100, frame(), findMode('off')!, DEFAULT_SETTINGS);
    expect(calls.filter((c) => c === 'draw')).toHaveLength(0);
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
});
