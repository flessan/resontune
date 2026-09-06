/**
 * The ResonTune playback engine.
 *
 * One HTMLAudioElement for the app's whole lifetime (element reuse — no
 * per-track churn), lazily wrapped in a Web Audio graph the first time the
 * visualizer needs analysis data. High-frequency state (currentTime, level)
 * is exposed through subscriptions and refs so React trees don't re-render
 * 60×/sec; only coarse state (track change, play/pause, duration) goes
 * through the zustand store.
 */

export interface AnalysisFrame {
  /** normalized frequency bins 0..1 */
  freq: Uint8Array;
  /** time-domain waveform 0..255 centered at 128 */
  wave: Uint8Array;
  /** overall level 0..1 (smoothed) */
  level: number;
  /** low band energy 0..1 */
  bass: number;
  /** mid band energy 0..1 */
  mid: number;
  /** high band energy 0..1 */
  treble: number;
  sampleRate: number;
  binCount: number;
}

type TimeListener = (currentTime: number, duration: number) => void;

class PlayerEngine {
  readonly audio: HTMLAudioElement;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private freqBuf: Uint8Array<ArrayBuffer> = new Uint8Array(0);
  private waveBuf: Uint8Array<ArrayBuffer> = new Uint8Array(0);
  private smoothedLevel = 0;
  private timeListeners = new Set<TimeListener>();
  private rafId: number | null = null;

  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'metadata';
    this.audio.crossOrigin = 'anonymous';
    (this.audio as any).playsInline = true;

    const pump = () => {
      if (this.timeListeners.size) {
        for (const l of this.timeListeners) l(this.audio.currentTime, this.audio.duration || 0);
      }
      this.rafId = requestAnimationFrame(pump);
    };
    this.rafId = requestAnimationFrame(pump);
  }

  onTime(listener: TimeListener): () => void {
    this.timeListeners.add(listener);
    return () => this.timeListeners.delete(listener);
  }

  /**
   * Build the Web Audio analysis graph on demand. Must be called from a
   * user gesture at least once so the AudioContext can start.
   */
  ensureAnalysis(): boolean {
    if (this.analyser) {
      if (this.ctx?.state === 'suspended') void this.ctx.resume();
      return true;
    }
    try {
      const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
      if (!Ctx) return false;
      this.ctx = new Ctx();
      this.sourceNode = this.ctx.createMediaElementSource(this.audio);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.78;
      this.sourceNode.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
      this.freqBuf = new Uint8Array(this.analyser.frequencyBinCount);
      this.waveBuf = new Uint8Array(this.analyser.fftSize);
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return true;
    } catch (err) {
      console.warn('[player] Web Audio unavailable:', err);
      this.analyser = null;
      return false;
    }
  }

  get analysisReady(): boolean {
    return Boolean(this.analyser);
  }

  /** Read a fresh analysis frame. Reuses buffers; do not retain the arrays. */
  readFrame(): AnalysisFrame | null {
    if (!this.analyser || !this.ctx) return null;
    this.analyser.getByteFrequencyData(this.freqBuf);
    this.analyser.getByteTimeDomainData(this.waveBuf);
    const bins = this.freqBuf.length;
    let sum = 0;
    for (let i = 0; i < bins; i++) sum += this.freqBuf[i];
    const raw = sum / (bins * 255);
    this.smoothedLevel += (raw - this.smoothedLevel) * 0.25;

    const band = (from: number, to: number) => {
      const a = Math.floor(bins * from);
      const b = Math.max(a + 1, Math.floor(bins * to));
      let s = 0;
      for (let i = a; i < b; i++) s += this.freqBuf[i];
      return s / ((b - a) * 255);
    };

    return {
      freq: this.freqBuf,
      wave: this.waveBuf,
      level: this.smoothedLevel,
      bass: band(0, 0.08),
      mid: band(0.08, 0.4),
      treble: band(0.4, 0.9),
      sampleRate: this.ctx.sampleRate,
      binCount: bins,
    };
  }

  async load(src: string): Promise<void> {
    if (this.audio.src !== src) {
      this.audio.src = src;
      this.audio.load();
    }
  }

  async play(): Promise<void> {
    // play() is always triggered by a user gesture (or media keys after
    // one), so this is the natural place to guarantee the analysis graph —
    // the visualizer must have data the moment audio starts.
    this.ensureAnalysis();
    if (this.ctx?.state === 'suspended') await this.ctx.resume();
    await this.audio.play();
  }

  pause(): void {
    this.audio.pause();
  }

  seek(seconds: number): void {
    if (Number.isFinite(seconds)) this.audio.currentTime = Math.max(0, seconds);
  }

  setVolume(v: number): void {
    this.audio.volume = Math.min(1, Math.max(0, v));
  }

  setMuted(m: boolean): void {
    this.audio.muted = m;
  }

  setRate(r: number): void {
    this.audio.playbackRate = r;
  }
}

export const engine = new PlayerEngine();
