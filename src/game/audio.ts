/**
 * Dedicated Flow AudioContext. Music never goes through the streaming
 * ResonTune player. Pause = ctx.suspend(). Clock = ctx.currentTime.
 */
import { playKick, type KickKind } from './hitsound';

export class GameAudio {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  musicGain: GainNode | null = null;
  sfxGain: GainNode | null = null;
  analyser: AnalyserNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private previewSource: AudioBufferSourceNode | null = null;
  private freq = new Uint8Array(32);
  private onEnded: (() => void) | null = null;

  async ensure(): Promise<AudioContext> {
    if (this.ctx && this.ctx.state !== 'closed') {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return this.ctx;
    }
    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.value = 0.92;
    master.connect(ctx.destination);

    const music = ctx.createGain();
    music.gain.value = 0.85;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    analyser.smoothingTimeConstant = 0.72;
    music.connect(analyser).connect(master);

    const sfx = ctx.createGain();
    sfx.gain.value = 0.7;
    sfx.connect(master);

    this.ctx = ctx;
    this.master = master;
    this.musicGain = music;
    this.sfxGain = sfx;
    this.analyser = analyser;
    if (ctx.state === 'suspended') await ctx.resume();
    return ctx;
  }

  now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  bands(): { bass: number; level: number } {
    if (!this.analyser) return { bass: 0, level: 0 };
    this.analyser.getByteFrequencyData(this.freq);
    let bass = 0;
    let all = 0;
    for (let i = 0; i < 4; i++) bass += this.freq[i];
    for (let i = 0; i < this.freq.length; i++) all += this.freq[i];
    return { bass: bass / (4 * 255), level: all / (this.freq.length * 255) };
  }

  async decode(data: ArrayBuffer): Promise<AudioBuffer> {
    const ctx = await this.ensure();
    return ctx.decodeAudioData(data.slice(0));
  }

  playBuffer(
    buffer: AudioBuffer,
    when: number,
    opts: { offset?: number; rate?: number; onEnded?: () => void } = {},
  ): AudioBufferSourceNode {
    if (!this.ctx || !this.musicGain) throw new Error('GameAudio not ready');
    this.stopMusic();
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = opts.rate ?? 1;
    src.connect(this.musicGain);
    this.onEnded = opts.onEnded ?? null;
    src.onended = () => {
      if (this.source === src) this.source = null;
      this.onEnded?.();
    };
    src.start(when, opts.offset ?? 0);
    this.source = src;
    return src;
  }

  playPreview(buffer: AudioBuffer, from: number, duration = 8): void {
    if (!this.ctx || !this.musicGain) return;
    this.stopPreview();
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.musicGain);
    const start = this.ctx.currentTime;
    src.start(start, Math.max(0, from), duration);
    src.stop(start + duration);
    src.onended = () => {
      if (this.previewSource === src) this.previewSource = null;
    };
    this.previewSource = src;
  }

  stopPreview(): void {
    try {
      this.previewSource?.stop();
    } catch {
      /* already stopped */
    }
    this.previewSource = null;
  }

  stopMusic(): void {
    this.onEnded = null;
    try {
      this.source?.stop();
    } catch {
      /* already stopped */
    }
    this.source = null;
  }

  hit(kind: KickKind, when?: number): void {
    if (!this.ctx || !this.sfxGain) return;
    playKick(this.ctx, this.sfxGain, kind, when ?? this.ctx.currentTime);
  }

  async suspend(): Promise<void> {
    if (this.ctx && this.ctx.state === 'running') await this.ctx.suspend();
  }

  async resume(): Promise<void> {
    if (this.ctx && this.ctx.state === 'suspended') await this.ctx.resume();
  }

  setMaster(volume: number): void {
    if (this.master) this.master.gain.value = volume;
  }

  close(): void {
    this.stopPreview();
    this.stopMusic();
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.analyser = null;
  }
}

export async function loadFileBuffer(file: File, audio: GameAudio): Promise<AudioBuffer> {
  return audio.decode(await file.arrayBuffer());
}
