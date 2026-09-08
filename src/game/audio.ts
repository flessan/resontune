/**
 * Dedicated Web Audio graph for Flow.
 *
 * The ResonTune player owns one HTMLAudioElement and a MediaElementSource
 * for its lifetime; Flow cannot share that graph. A BufferSource scheduled
 * against AudioContext.currentTime is also how the original engine keeps
 * notes, hits and music on the same clock — including the 3-2-1 countdown
 * (the source starts in the future, game time is negative until then).
 */
export type HitSfx = 'perfect' | 'good' | 'ok' | 'miss';

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  readonly freqData = new Uint8Array(128);
  private source: AudioBufferSourceNode | null = null;
  private previewTimer: ReturnType<typeof setInterval> | null = null;
  private volume = 0.7;
  private onEnded: (() => void) | null = null;

  get context(): AudioContext | null {
    return this.ctx;
  }

  get ready(): boolean {
    return Boolean(this.ctx && this.master);
  }

  ensure(): AudioContext {
    if (this.ctx && this.master) return this.ctx;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.82;
    this.master.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
    return this.ctx;
  }

  async resume(): Promise<void> {
    const ac = this.ensure();
    if (ac.state === 'suspended') await ac.resume();
  }

  async suspend(): Promise<void> {
    if (this.ctx && this.ctx.state === 'running') await this.ctx.suspend();
  }

  setVolume(level: number): void {
    this.volume = Math.min(1, Math.max(0, level));
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
    }
  }

  async decode(data: ArrayBuffer): Promise<AudioBuffer> {
    const ac = this.ensure();
    const copy = data.slice(0);
    return ac.decodeAudioData(copy);
  }

  playBuffer(buffer: AudioBuffer, when: number, onEnded: () => void): void {
    this.stopNodes();
    const ac = this.ensure();
    if (!this.master) return;
    const src = ac.createBufferSource();
    src.buffer = buffer;
    src.connect(this.master);
    this.onEnded = onEnded;
    src.onended = () => {
      if (this.source === src) this.onEnded?.();
    };
    src.start(when);
    this.source = src;
  }

  startMetronome(startTime: number): void {
    this.stopNodes();
    const ac = this.ensure();
    let nextBeat = startTime + 1;
    this.previewTimer = setInterval(() => {
      if (!this.ctx) return;
      while (nextBeat < this.ctx.currentTime + 0.12) {
        this.createPreviewClick(nextBeat);
        nextBeat += 0.5;
      }
    }, 75);
    void ac;
  }

  createPreviewClick(time: number): void {
    if (!this.master || !this.ctx) return;
    const oscillator = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(760, time);
    gain.gain.setValueAtTime(0.10, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.055);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(time);
    oscillator.stop(time + 0.06);
  }

  playHit(kind: HitSfx): void {
    if (!this.master || !this.ctx) return;
    const ac = this.ctx;
    const t = ac.currentTime;

    if (kind === 'miss') {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, t);
      osc.frequency.exponentialRampToValueAtTime(55, t + 0.16);
      gain.gain.setValueAtTime(0.13, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.connect(gain).connect(this.master);
      osc.start(t);
      osc.stop(t + 0.2);
      return;
    }

    const freq = kind === 'perfect' ? 900 : kind === 'good' ? 700 : 520;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.5, t + 0.05);
    gain.gain.setValueAtTime(0.09, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.1);

    if (kind === 'perfect') {
      const sparkle = ac.createOscillator();
      const sparkleGain = ac.createGain();
      sparkle.type = 'triangle';
      sparkle.frequency.setValueAtTime(freq * 2, t);
      sparkleGain.gain.setValueAtTime(0.04, t);
      sparkleGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      sparkle.connect(sparkleGain).connect(this.master);
      sparkle.start(t);
      sparkle.stop(t + 0.13);
    }
  }

  playTail(ok: boolean): void {
    if (!this.master || !this.ctx) return;
    const t = this.ctx.currentTime;
    const seq = ok ? [660, 990] : [330, 247];
    seq.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t + i * 0.07);
      gain.gain.setValueAtTime(0.07, t + i * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.07 + 0.14);
      osc.connect(gain).connect(this.master!);
      osc.start(t + i * 0.07);
      osc.stop(t + i * 0.07 + 0.16);
    });
  }

  playFinish(failed: boolean): void {
    if (!this.master || !this.ctx) return;
    const t = this.ctx.currentTime;
    const seq = failed ? [220, 196, 165, 131] : [523, 659, 784, 1047];
    seq.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + i * 0.11);
      gain.gain.setValueAtTime(0.0001, t + i * 0.11);
      gain.gain.exponentialRampToValueAtTime(0.09, t + i * 0.11 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.11 + 0.32);
      osc.connect(gain).connect(this.master!);
      osc.start(t + i * 0.11);
      osc.stop(t + i * 0.11 + 0.34);
    });
  }

  pullFrequency(): Uint8Array | null {
    if (!this.analyser) return null;
    this.analyser.getByteFrequencyData(this.freqData);
    return this.freqData;
  }

  stopNodes(): void {
    this.onEnded = null;
    if (this.source) {
      const src = this.source;
      this.source = null;
      try { src.onended = null; } catch { /* */ }
      try { src.stop(); } catch { /* already stopped */ }
      try { src.disconnect(); } catch { /* */ }
    }
    if (this.previewTimer) {
      clearInterval(this.previewTimer);
      this.previewTimer = null;
    }
  }

  async close(): Promise<void> {
    this.stopNodes();
    const ac = this.ctx;
    this.ctx = null;
    this.master = null;
    this.analyser = null;
    if (ac && ac.state !== 'closed') {
      try { await ac.close(); } catch { /* */ }
    }
  }
}
