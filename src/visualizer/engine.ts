/**
 * Visualizer engine.
 *
 * Modes are self-contained modules that consume a normalized AnalysisFrame
 * plus user settings - they never touch the player directly. The engine
 * owns the render loop, canvas sizing, and settings, so new modes can be
 * added by pushing a VisualizerMode into the registry.
 */
import type { AnalysisFrame } from '@/player/engine';

export interface VisualizerSettings {
  sensitivity: number;   // 0.4..2  - input gain applied to analysis data
  intensity: number;     // 0.4..2  - how strongly visuals respond
  speed: number;         // 0.3..2  - animation rate multiplier
  opacity: number;       // 0.2..1
  smoothing: number;     // 0..0.95 - extra temporal smoothing
  scale: number;         // 0.5..1.6
  background: 'ink' | 'artwork' | 'transparent';
}

export const DEFAULT_SETTINGS: VisualizerSettings = {
  sensitivity: 1,
  intensity: 1,
  speed: 1,
  opacity: 0.72,
  smoothing: 0.55,
  scale: 1,
  background: 'ink',
};

export type VizLevel = 'minimal' | 'ambient' | 'full';

export const LEVEL_PRESETS: Record<VizLevel, Pick<VisualizerSettings, 'sensitivity' | 'intensity' | 'speed' | 'opacity' | 'scale'>> = {
  minimal: { sensitivity: 0.85, intensity: 0.55, speed: 0.7, opacity: 0.42, scale: 0.82 },
  ambient: { sensitivity: 1, intensity: 1, speed: 1, opacity: 0.72, scale: 1 },
  full: { sensitivity: 1.15, intensity: 1.35, speed: 1.15, opacity: 0.95, scale: 1.12 },
};

export const SILENT_FRAME: AnalysisFrame = {
  freq: new Uint8Array(1024),
  wave: new Uint8Array(2048).fill(128),
  level: 0,
  bass: 0,
  mid: 0,
  treble: 0,
  sampleRate: 44100,
  binCount: 1024,
};

const MODE_ALIAS: Record<string, string> = {
  minimal: 'bars',
  waveform: 'wave',
  radial: 'corona',
  organic: 'ribbon',
  geometric: 'scope',
  album: 'hifi',
  albumReactive: 'hifi',
  typography: 'wave',
  procedural: 'hyperspace',
};

export function resolveModeId(id: string | null | undefined): string {
  if (!id) return 'bars';
  return MODE_ALIAS[id] ?? id;
}

export interface VisualizerContext {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  dpr: number;
  t: number;                 // seconds since mode start (speed-scaled)
  frame: AnalysisFrame;
  settings: VisualizerSettings;
  accent: string;            // current accent color (from artwork)
  paper: string;             // light neutral
  artwork: HTMLImageElement | null;
  reducedMotion: boolean;
}

export interface VisualizerMode {
  id: string;
  name: string;
  description: string;
  init?(vc: Omit<VisualizerContext, 'frame' | 't'>): void;
  render(vc: VisualizerContext): void;
}

const registry: VisualizerMode[] = [];

export function registerMode(mode: VisualizerMode): void {
  registry.push(mode);
}

export function listModes(): VisualizerMode[] {
  return registry;
}

export function findMode(id: string): VisualizerMode | undefined {
  const resolved = resolveModeId(id);
  return registry.find((m) => m.id === resolved) ?? registry.find((m) => m.id === id);
}

/** Paint one mode into an existing 2d context (Flow stage, tests). */
export function paintVisualizer(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  frame: AnalysisFrame,
  mode: VisualizerMode,
  settings: VisualizerSettings,
  opts: { accent?: string; paper?: string; t?: number; artwork?: HTMLImageElement | null; reducedMotion?: boolean } = {},
): void {
  ctx.save();
  ctx.globalAlpha = settings.opacity;
  mode.render({
    ctx,
    w,
    h,
    dpr: 1,
    t: opts.t ?? 0,
    frame,
    settings,
    accent: opts.accent ?? '#ffb693',
    paper: opts.paper ?? '#f3e6d8',
    artwork: opts.artwork ?? null,
    reducedMotion: opts.reducedMotion ?? false,
  });
  ctx.restore();
}

/** Apply sensitivity + smoothing to a bin array into a persistent buffer. */
export function smoothBins(
  frame: AnalysisFrame,
  settings: VisualizerSettings,
  buf: Float32Array,
  count: number,
): Float32Array {
  const step = Math.floor((frame.binCount * 0.75) / count);
  const alpha = 1 - settings.smoothing * 0.9;
  for (let i = 0; i < count; i++) {
    let sum = 0;
    const start = i * step;
    for (let j = 0; j < step; j++) sum += frame.freq[start + j] ?? 0;
    let v = (sum / (step * 255)) * settings.sensitivity;
    v = Math.min(1, v);
    buf[i] += (v - buf[i]) * alpha;
  }
  return buf;
}

export class VisualizerRunner {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private mode: VisualizerMode;
  private settings: VisualizerSettings;
  private readFrame: () => AnalysisFrame | null;
  private rafId: number | null = null;
  private startTime = performance.now();
  private accent = '#d97f4e';
  private paper = '#efeae0';
  private artwork: HTMLImageElement | null = null;
  private reducedMotion: boolean;
  private resizeObs: ResizeObserver;
  private lastFrame: AnalysisFrame | null = null;
  private clock = 0;
  private lastTick = performance.now();
  private paused = false;

  constructor(
    canvas: HTMLCanvasElement,
    mode: VisualizerMode,
    settings: VisualizerSettings,
    readFrame: () => AnalysisFrame | null,
  ) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true })!;
    this.mode = mode;
    this.settings = settings;
    this.readFrame = readFrame;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(canvas);
    this.resize();
  }

  private resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  setMode(mode: VisualizerMode) {
    this.mode = mode;
    this.startTime = performance.now();
  }

  setSettings(s: VisualizerSettings) {
    this.settings = s;
  }

  setAccent(color: string) {
    this.accent = color;
  }

  /** Base drawing color ("paper"). Defaults to warm off-white for dark
      surfaces; light surfaces should pass their ink color instead. */
  setPaper(color: string) {
    this.paper = color;
  }

  setArtwork(img: HTMLImageElement | null) {
    this.artwork = img;
  }

  /** Freeze the clock and keep the last frame. Seek/resume pick the analyser back up. */
  setPaused(paused: boolean) {
    if (this.paused === paused) return;
    this.paused = paused;
    if (!paused) this.lastTick = performance.now();
  }

  start() {
    if (this.rafId != null) return;
    this.lastTick = performance.now();
    const loop = () => {
      this.tick();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop() {
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  destroy() {
    this.stop();
    this.resizeObs.disconnect();
  }

  private tick() {
    if (this.paused) {
      if (this.lastFrame) this.render(this.lastFrame);
      return;
    }
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastTick) / 1000);
    this.lastTick = now;
    // Reduced motion: slow the clock right down instead of freezing entirely.
    const speedMul = this.reducedMotion ? 0.15 : 1;
    this.clock += dt * this.settings.speed * speedMul;

    const frame = this.readFrame() ?? this.lastFrame;
    if (!frame) {
      this.render(SILENT_FRAME);
      return;
    }
    this.lastFrame = frame;
    this.render(frame);
  }

  /** Reduced motion: heavier temporal smoothing so amplitude changes stay gentle. */
  private effectiveSettings(): VisualizerSettings {
    if (!this.reducedMotion) return this.settings;
    return {
      ...this.settings,
      smoothing: Math.max(this.settings.smoothing, 0.88),
      intensity: Math.min(this.settings.intensity, 0.8),
    };
  }

  private render(frame: AnalysisFrame) {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.globalAlpha = this.settings.opacity;
    this.mode.render({
      ctx, w, h,
      dpr: Math.min(window.devicePixelRatio || 1, 2),
      t: this.clock,
      frame,
      settings: this.effectiveSettings(),
      accent: this.accent,
      paper: this.paper,
      artwork: this.artwork,
      reducedMotion: this.reducedMotion,
    });
    ctx.restore();
  }
}
