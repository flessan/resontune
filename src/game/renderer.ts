/**
 * Canvas stage + HUD. React does not paint score/combo/fever during play.
 *
 * Holds stay on stage until they are cleared or dropped: the head being
 * judged does not cull the body or tail.
 */
import type { AnalysisFrame } from '@/player/engine';
import { findMode, paintVisualizer, type VisualizerSettings } from '@/visualizer/engine';
import '@/visualizer/modes';
import type {
  ActiveHold,
  FeverState,
  HitRing,
  Note,
  Particle,
  SectionKind,
  TimingSample,
} from './types';

export interface ViewWorld {
  now: number;
  notes: Note[];
  holds: ActiveHold[];
  particles: Particle[];
  rings: HitRing[];
  timings: TimingSample[];
  approach: number;
  hidden: boolean;
  sudden: boolean;
  score: number;
  combo: number;
  maxCombo: number;
  perfectChain: number;
  health: number;
  accuracy: number;
  fever: FeverState;
  best: number;
  playing: boolean;
  paused: boolean;
  finished: boolean;
  countdown: boolean;
  countdownRemain: number;
  judgeFlash: string;
  judgeColor: string;
  judgeLife: number;
  pulse: number;
  shake: number;
  lanePulse: [number, number];
  comboPunch: number;
  judgeScale: number;
  lastHitError: number | null;
  goodWindow: number;
  songTitle: string;
  songArtist: string;
  difficulty: string;
  status: string;
  duration: number;
  playOffset: number;
  speed: number;
  bass: number;
  level: number;
  section: SectionKind;
  practice: boolean;
  vizFrame: AnalysisFrame | null;
  vizMode: string;
  vizSettings: VisualizerSettings;
  vizClock: number;
}

const STAGE = '#100e0d';
const CREAM = '#f3e6d8';
const PEACH = '#ffb693';
const GOLD = '#ffd696';
const MUTED = 'rgba(236,229,225,0.46)';
const INK = 'rgba(236,229,225,0.94)';

type Drawn = {
  note: Note;
  headX: number;
  tailX: number;
  y: number;
  alpha: number;
  r: number;
  holding: boolean;
  headT: number;
};

export function noteVisible(note: Note, now: number, approach: number): boolean {
  if (note.judged && !note.holding) return false;
  const headT = (note.time - now) / approach;
  if (note.duration > 0) {
    const tailT = (note.time + note.duration - now) / approach;
    if (headT > 1.2) return false;
    if (tailT < -0.15 && !note.holding) return false;
    return true;
  }
  return headT <= 1.15 && headT >= -0.2;
}

function clock(seconds: number): string {
  const t = Math.max(0, seconds);
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export class GameView {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  private world: () => ViewWorld;
  private raf = 0;
  private running = false;
  w = 1;
  h = 1;
  dpr = 1;
  private hitX = 120;
  private laneY = [0, 0];
  private laneH = 72;
  private noteR = 24;
  private compact = false;

  constructor(canvas: HTMLCanvasElement, world: () => ViewWorld) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unsupported');
    this.ctx = ctx;
    this.world = world;
  }

  start(): void {
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this.draw(this.world());
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  receptor(lane: 0 | 1): { x: number; y: number } {
    return { x: this.hitX, y: this.laneY[lane] };
  }

  private layout(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    if (this.w !== w || this.h !== h || this.dpr !== dpr) {
      this.w = w;
      this.h = h;
      this.dpr = dpr;
      this.canvas.width = Math.floor(w * dpr);
      this.canvas.height = Math.floor(h * dpr);
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.compact = h < 540 || w < 640;
    this.hitX = Math.round(Math.max(this.compact ? 86 : 108, Math.min(168, w * 0.19)));
    this.laneH = this.compact
      ? Math.max(70, Math.min(96, h * 0.175))
      : Math.max(84, Math.min(124, h * 0.16));
    const mid = h * 0.54;
    this.laneY = [mid - this.laneH * 1.02, mid + this.laneH * 1.02];
    this.noteR = this.compact
      ? Math.max(22, Math.min(30, this.laneH * 0.4))
      : Math.max(24, Math.min(34, this.laneH * 0.38));
  }

  private draw(w: ViewWorld): void {
    this.layout();
    const { ctx, w: W, h: H } = this;
    const energy = w.fever.phase === 'flow' ? 0.012 : w.fever.phase === 'fever' ? 0.008 : 0;
    const cam = 1 + w.bass * 0.007 + w.pulse * 0.01 + energy;
    const shakeX = w.shake ? (Math.random() - 0.5) * 2.6 * w.shake : 0;
    const shakeY = w.shake ? (Math.random() - 0.5) * 2 * w.shake : 0;
    ctx.save();
    ctx.translate(W / 2 + shakeX, H / 2 + shakeY);
    ctx.scale(cam, cam);
    ctx.translate(-W / 2, -H / 2);
    this.stage(w);
    this.lanes(w);
    this.notes(w);
    this.fx(w);
    ctx.restore();
    this.hud(w);
  }

  private stage(w: ViewWorld): void {
    const { ctx, w: W, h: H } = this;
    ctx.fillStyle = STAGE;
    ctx.fillRect(0, 0, W, H);
    this.visualizer(w);

    const fever = w.fever.phase === 'flow' ? 0.26 : w.fever.phase === 'fever' ? 0.16 : 0.05;
    const drift = Math.sin(w.now * 0.55) * 18;
    const wash = ctx.createRadialGradient(
      this.hitX + 24,
      H * 0.54 + drift * 0.15,
      8,
      W * 0.46,
      H * 0.54,
      W * 0.82,
    );
    wash.addColorStop(0, `rgba(255,182,147,${fever + w.bass * 0.18 + w.pulse * 0.08})`);
    wash.addColorStop(0.42, `rgba(255,182,147,${0.035 + w.level * 0.06})`);
    wash.addColorStop(1, 'rgba(16,14,13,0)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, W, H);

    if (w.fever.phase !== 'idle') {
      const gold = ctx.createRadialGradient(W * 0.5, H * 0.5, 30, W * 0.5, H * 0.5, W * 0.72);
      gold.addColorStop(0, w.fever.phase === 'flow' ? 'rgba(255,214,150,0.12)' : 'rgba(255,182,147,0.07)');
      gold.addColorStop(1, 'rgba(255,214,150,0)');
      ctx.fillStyle = gold;
      ctx.fillRect(0, 0, W, H);
    }

    const vignette = ctx.createRadialGradient(W * 0.5, H * 0.55, H * 0.2, W * 0.5, H * 0.55, H * 0.85);
    vignette.addColorStop(0, 'rgba(16,14,13,0)');
    vignette.addColorStop(1, 'rgba(8,7,6,0.45)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);
  }

  private visualizer(w: ViewWorld): void {
    if (w.vizMode === 'off' || !w.vizFrame) return;
    const mode = findMode(w.vizMode);
    if (!mode || mode.id === 'off') return;
    const { ctx, w: W, h: H } = this;
    const fever = w.fever.phase === 'idle' ? 1 : w.fever.phase === 'fever' ? 1.08 : 1.12;
    const settings = {
      ...w.vizSettings,
      intensity: w.vizSettings.intensity * 0.72 * fever,
      opacity: Math.min(0.42, w.vizSettings.opacity * 0.55),
      scale: w.vizSettings.scale * 0.92,
    };
    ctx.save();
    paintVisualizer(ctx, W, H, w.vizFrame, mode, settings, {
      accent: PEACH,
      paper: CREAM,
      t: w.paused ? 0 : w.vizClock,
    });
    ctx.restore();
  }

  private lanes(w: ViewWorld): void {
    const { ctx, w: W } = this;
    const holding = [false, false];
    for (const hold of w.holds) holding[hold.note.lane] = true;

    ctx.beginPath();
    ctx.moveTo(this.hitX, this.laneY[0]);
    ctx.lineTo(this.hitX, this.laneY[1]);
    ctx.strokeStyle = `rgba(255,182,147,${0.16 + w.pulse * 0.12})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    for (let i = 0; i < 2; i++) {
      const y = this.laneY[i];
      const punch = w.lanePulse[i] ?? 0;
      const channel = ctx.createLinearGradient(this.hitX, y, W - 28, y);
      channel.addColorStop(0, `rgba(255,182,147,${0.1 + punch * 0.08 + w.bass * 0.04})`);
      channel.addColorStop(0.55, `rgba(255,182,147,${0.045 + w.level * 0.03})`);
      channel.addColorStop(1, 'rgba(255,182,147,0)');
      ctx.fillStyle = channel;
      this.roundRect(ctx, this.hitX - 8, y - this.laneH * 0.38, W - this.hitX - 20, this.laneH * 0.76, this.laneH * 0.38);
      ctx.fill();

      this.receptorPad(w, y, punch, holding[i]);
    }
  }

  private receptorPad(w: ViewWorld, y: number, punch: number, holding: boolean): void {
    const { ctx } = this;
    const fever = w.fever.phase !== 'idle';
    const r = this.noteR + 10 + punch * 6 + (holding ? 3 : 0);
    const scale = (holding ? 0.9 : 1) * (1 + punch * 0.18);
    ctx.save();
    ctx.translate(this.hitX, y);
    ctx.scale(scale, holding ? scale * 0.92 : scale);

    ctx.beginPath();
    ctx.arc(0, 0, r + 14, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,182,147,${0.05 + punch * 0.1 + (fever ? 0.05 : 0)})`;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(0, 0, r + 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(20,16,14,0.72)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,182,147,${0.5 + punch * 0.4 + (fever ? 0.12 : 0)})`;
    ctx.lineWidth = 3 + punch * 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, r - 7, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(243,230,216,${0.18 + punch * 0.2})`;
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, this.noteR * 0.36, 0, Math.PI * 2);
    ctx.fillStyle = holding ? PEACH : `rgba(243,230,216,${0.62 + punch * 0.38})`;
    ctx.fill();
    ctx.restore();
  }

  private notes(w: ViewWorld): void {
    const { w: W } = this;
    const travel = W - this.hitX - 40;
    const drawn: Drawn[] = [];

    for (const note of w.notes) {
      if (!noteVisible(note, w.now, w.approach)) continue;
      const headT = (note.time - w.now) / w.approach;
      const tailT = note.duration > 0 ? (note.time + note.duration - w.now) / w.approach : headT;
      let alpha = 1;
      if (!note.holding) {
        if (w.hidden && headT < 0.38) alpha = Math.max(0, (headT - 0.08) / 0.3);
        if (w.sudden && headT > 0.55) alpha = Math.max(0, 1 - (headT - 0.55) / 0.25);
      }
      if (alpha <= 0) continue;
      const headX = note.holding ? this.hitX : this.hitX + headT * travel;
      const tailX = this.hitX + Math.max(tailT, 0) * travel;
      const r = this.noteR * (note.chordGroup != null ? 1.06 : 1);
      drawn.push({
        note,
        headX,
        tailX,
        y: this.laneY[note.lane],
        alpha,
        r,
        holding: note.holding,
        headT,
      });
    }

    this.chordLinks(drawn);
    for (const d of drawn) {
      if (d.note.duration <= 0) continue;
      this.holdBody(w, d);
    }
    for (const d of drawn) this.noteHead(d);
  }

  private chordLinks(drawn: Drawn[]): void {
    const { ctx } = this;
    const seen = new Set<number>();
    for (const d of drawn) {
      const group = d.note.chordGroup;
      if (group == null || seen.has(group)) continue;
      const pair = drawn.filter((n) => n.note.chordGroup === group);
      if (pair.length < 2) continue;
      seen.add(group);
      const a = pair[0];
      const b = pair[1];
      const x = (a.headX + b.headX) / 2;
      const top = Math.min(a.y, b.y);
      const bot = Math.max(a.y, b.y);
      ctx.globalAlpha = Math.min(a.alpha, b.alpha) * 0.7;
      const dualHold = pair.every((p) => p.note.duration > 0);
      ctx.strokeStyle = PEACH;
      ctx.lineWidth = dualHold ? 6 : 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bot);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  private holdBody(w: ViewWorld, d: Drawn): void {
    const { ctx } = this;
    const left = Math.min(d.headX, d.tailX);
    const width = Math.max(Math.abs(d.tailX - d.headX), d.r);
    const h = d.r * 0.92;
    const remain = d.note.duration > 0
      ? Math.max(0, Math.min(1, (d.note.time + d.note.duration - w.now) / d.note.duration))
      : 1;
    ctx.globalAlpha = d.alpha;
    const body = ctx.createLinearGradient(left, d.y, left + width, d.y);
    body.addColorStop(0, d.holding ? `rgba(255,182,147,${0.42 + remain * 0.16})` : 'rgba(255,182,147,0.26)');
    body.addColorStop(1, d.holding ? 'rgba(255,214,150,0.22)' : 'rgba(255,182,147,0.1)');
    ctx.fillStyle = body;
    this.roundRect(ctx, left, d.y - h / 2, width + d.r * 0.45, h, h / 2);
    ctx.fill();
    ctx.fillStyle = d.holding ? 'rgba(255,244,232,0.5)' : 'rgba(255,244,232,0.22)';
    this.roundRect(ctx, left, d.y - h * 0.16, width + d.r * 0.2, h * 0.32, h * 0.16);
    ctx.fill();

    // The tail is deliberately a release marker, not a second tap: an
    // outlined cap plus a small center dot keeps the sustain readable after
    // its head has reached the receptor.
    ctx.beginPath();
    ctx.arc(d.tailX, d.y, d.r * 0.8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,214,150,0.22)';
    ctx.fill();
    ctx.strokeStyle = '#ffd69b';
    ctx.lineWidth = Math.max(2, d.r * 0.1);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(d.tailX, d.y, d.r * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = '#fff6ee';
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  private noteHead(d: Drawn): void {
    const { ctx } = this;
    ctx.globalAlpha = d.alpha;
    ctx.save();
    ctx.translate(d.headX, d.y);
    const approachScale = d.holding ? 1 : 0.92 + Math.max(0, 1 - Math.abs(d.headT)) * 0.08;
    ctx.scale(approachScale, d.holding ? 0.88 : approachScale);

    ctx.beginPath();
    ctx.arc(0, 0, d.r + 6, 0, Math.PI * 2);
    ctx.fillStyle = d.note.chordGroup != null ? 'rgba(255,182,147,0.22)' : 'rgba(243,230,216,0.12)';
    ctx.fill();

    const g = ctx.createRadialGradient(-d.r * 0.3, -d.r * 0.34, 1, 0, 0, d.r);
    g.addColorStop(0, '#fff8f1');
    g.addColorStop(0.42, CREAM);
    g.addColorStop(1, d.note.chordGroup != null ? PEACH : '#e4b496');
    ctx.beginPath();
    ctx.arc(0, 0, d.r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(-d.r * 0.22, -d.r * 0.26, d.r * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fill();

    if (d.note.chordGroup != null) {
      ctx.beginPath();
      ctx.arc(0, 0, d.r * 0.34, 0, Math.PI * 2);
      ctx.fillStyle = PEACH;
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  private fx(w: ViewWorld): void {
    const { ctx } = this;
    for (const r of w.rings) {
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = r.life * 0.8;
      ctx.lineWidth = r.width;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const p of w.particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 0.75, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private hud(w: ViewWorld): void {
    const { ctx, w: W, h: H } = this;
    const pad = this.compact ? 16 : 28;
    ctx.textBaseline = 'top';

    ctx.save();
    ctx.beginPath();
    ctx.rect(pad, pad - 2, W * 0.28, 44);
    ctx.clip();
    ctx.fillStyle = INK;
    ctx.font = this.compact ? '600 13px "Poppins", system-ui, sans-serif' : '600 15px "Poppins", system-ui, sans-serif';
    ctx.fillText(w.songTitle, pad, pad);
    ctx.fillStyle = MUTED;
    ctx.font = '500 11px "Poppins", system-ui, sans-serif';
    const sub = w.practice ? `${w.songArtist}  ·  Practice` : `${w.songArtist}  ·  ${w.difficulty}`;
    ctx.fillText(sub, pad, pad + 20);
    ctx.restore();

    ctx.textAlign = 'right';
    ctx.fillStyle = MUTED;
    ctx.font = '600 10px "Poppins", system-ui, sans-serif';
    ctx.fillText('SCORE', W - pad, pad);
    ctx.fillStyle = INK;
    ctx.font = this.compact ? '600 22px "Poppins", system-ui, sans-serif' : '650 28px "Poppins", system-ui, sans-serif';
    ctx.fillText(w.score.toLocaleString(), W - pad, pad + 14);
    ctx.font = '500 12px "Poppins", system-ui, sans-serif';
    ctx.fillStyle = MUTED;
    ctx.fillText(`${w.accuracy.toFixed(1)}%`, W - pad, pad + (this.compact ? 40 : 46));
    ctx.textAlign = 'left';

    this.feverMeter(w, pad);
    this.combo(w);
    this.timingMeter(w);
    this.progress(w, pad);
    this.judgement(w);

    if (w.countdown && w.playing) {
      const n = Math.max(0, Math.ceil(w.countdownRemain - 0.2));
      ctx.textAlign = 'center';
      ctx.fillStyle = CREAM;
      ctx.font = '650 72px "Poppins", system-ui, sans-serif';
      ctx.fillText(n > 0 ? String(n) : 'GO', W / 2, H * 0.3);
      ctx.textAlign = 'left';
    }

    if (w.paused) {
      ctx.fillStyle = 'rgba(12,10,9,0.58)';
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.fillStyle = CREAM;
      ctx.font = '600 28px "Poppins", system-ui, sans-serif';
      ctx.fillText('Paused', W / 2, H * 0.42);
      ctx.font = '500 13px "Poppins", system-ui, sans-serif';
      ctx.fillStyle = MUTED;
      ctx.fillText('Esc or tap to resume', W / 2, H * 0.42 + 36);
      ctx.textAlign = 'left';
    }
  }

  private combo(w: ViewWorld): void {
    if (w.combo < 2 || w.countdown) return;
    const { ctx, w: W } = this;
    const punch = 1 + w.comboPunch * 0.14;
    ctx.save();
    ctx.translate(W / 2, this.compact ? 18 : 16);
    ctx.scale(punch, punch);
    ctx.textAlign = 'center';
    ctx.fillStyle = MUTED;
    ctx.font = '600 10px "Poppins", system-ui, sans-serif';
    ctx.fillText('COMBO', 0, 0);
    ctx.fillStyle = w.fever.phase === 'idle' ? CREAM : w.fever.phase === 'flow' ? GOLD : PEACH;
    ctx.font = this.compact ? '650 40px "Poppins", system-ui, sans-serif' : '650 52px "Poppins", system-ui, sans-serif';
    ctx.fillText(String(w.combo), 0, 14);
    if (w.perfectChain >= 8) {
      ctx.fillStyle = MUTED;
      ctx.font = '500 10px "Poppins", system-ui, sans-serif';
      ctx.fillText(`PERFECT CHAIN  ${w.perfectChain}`, 0, this.compact ? 58 : 70);
    }
    ctx.restore();
  }

  private feverMeter(w: ViewWorld, pad: number): void {
    const { ctx, w: W } = this;
    const width = this.compact ? 88 : 118;
    const x = W - pad - width;
    const y = this.compact ? 80 : 88;
    const cap = w.fever.phase === 'flow' ? 10 : 8;
    const fill = w.fever.phase === 'idle' ? w.fever.meter : Math.max(0.14, w.fever.timeLeft / cap);
    ctx.fillStyle = 'rgba(255,182,147,0.12)';
    this.roundRect(ctx, x, y, width, 6, 3);
    ctx.fill();
    ctx.fillStyle = w.fever.phase === 'flow' ? GOLD : PEACH;
    ctx.globalAlpha = w.fever.phase === 'idle' ? 0.55 : 0.95;
    this.roundRect(ctx, x, y, width * Math.min(1, fill), 6, 3);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.textAlign = 'right';
    ctx.font = '600 10px "Poppins", system-ui, sans-serif';
    ctx.fillStyle = w.fever.phase === 'idle' ? MUTED : PEACH;
    const label = w.fever.phase === 'flow' ? `FLOW  ×${w.fever.multiplier.toFixed(1)}` : w.fever.phase === 'fever' ? `FEVER  ×${w.fever.multiplier.toFixed(1)}` : '';
    if (label) ctx.fillText(label, W - pad, y + 10);
    ctx.textAlign = 'left';
  }

  private judgement(w: ViewWorld): void {
    if (w.judgeLife <= 0 || !w.judgeFlash) return;
    const { ctx, w: W, h: H } = this;
    ctx.save();
    ctx.globalAlpha = Math.min(1, w.judgeLife * 1.45);
    ctx.textAlign = 'center';
    ctx.fillStyle = w.judgeColor;
    ctx.translate(W / 2, this.laneY[0] - this.laneH * 0.55);
    ctx.scale(w.judgeScale, w.judgeScale);
    ctx.font = H < 540 ? '650 18px "Poppins", system-ui, sans-serif' : '650 22px "Poppins", system-ui, sans-serif';
    ctx.fillText(w.judgeFlash, 0, 0);
    ctx.restore();
  }

  private timingMeter(w: ViewWorld): void {
    const { ctx, w: W, h: H } = this;
    const x = this.compact ? 86 : 110;
    const y = this.compact ? H * 0.36 : H * 0.34;
    const half = this.compact ? 46 : 56;
    ctx.fillStyle = MUTED;
    ctx.font = '600 9px "Poppins", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('EARLY', x - half - 22, y - 4);
    ctx.fillText('LATE', x + half + 18, y - 4);
    ctx.strokeStyle = 'rgba(236,229,225,0.2)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - half, y);
    ctx.lineTo(x + half, y);
    ctx.stroke();
    ctx.fillStyle = CREAM;
    ctx.beginPath();
    ctx.arc(x, y, 3.4, 0, Math.PI * 2);
    ctx.fill();
    for (const sample of w.timings.slice(-7)) {
      const t = Math.max(-1, Math.min(1, sample.error / w.goodWindow));
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = PEACH;
      ctx.beginPath();
      ctx.arc(x + t * half, y, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (w.lastHitError != null) {
      const t = Math.max(-1, Math.min(1, w.lastHitError / w.goodWindow));
      ctx.fillStyle = PEACH;
      ctx.beginPath();
      ctx.arc(x + t * half, y, 4.4, 0, Math.PI * 2);
      ctx.fill();
      const ms = Math.round(w.lastHitError * 1000);
      ctx.fillStyle = MUTED;
      ctx.font = '500 11px "Poppins", system-ui, sans-serif';
      const label = ms === 0 ? '0 ms' : `${ms > 0 ? '+' : ''}${ms} ms`;
      ctx.fillText(label, x, y + 12);
    }
    ctx.textAlign = 'left';
  }

  private progress(w: ViewWorld, pad: number): void {
    if (!w.playing) return;
    const { ctx, w: W, h: H } = this;
    const y = H - (this.compact ? 22 : 26);
    const left = pad;
    const width = W - pad * 2;
    const p = Math.max(0, Math.min(1, w.now / Math.max(w.duration, 0.01)));
    ctx.fillStyle = MUTED;
    ctx.font = '500 10px "Poppins", system-ui, sans-serif';
    ctx.fillText(clock(w.now), left, y - 16);
    ctx.textAlign = 'right';
    ctx.fillText(clock(w.duration), left + width, y - 16);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(236,229,225,0.12)';
    this.roundRect(ctx, left, y, width, 4, 2);
    ctx.fill();
    ctx.fillStyle = PEACH;
    this.roundRect(ctx, left, y, Math.max(4, width * p), 4, 2);
    ctx.fill();
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }
}
