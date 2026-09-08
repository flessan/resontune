/**
 * Canvas stage + HUD. React does not paint score/combo/fever during play.
 */
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
}

const INK = '#1c1914';
const PAPER = '#f4efe6';
const RULE = 'rgba(28,25,20,0.12)';
const MUTED = 'rgba(28,25,20,0.45)';
const WARM = '#c45c26';

export class GameView {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  private world: () => ViewWorld;
  private raf = 0;
  private running = false;
  w = 1;
  h = 1;
  dpr = 1;
  private hitX = 108;
  private laneY = [0, 0];
  private laneH = 52;

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
    this.hitX = Math.round(w * 0.16);
    const mid = h * 0.52;
    this.laneH = Math.max(44, Math.min(64, h * 0.09));
    this.laneY = [mid - this.laneH * 1.15, mid + this.laneH * 1.15];
  }

  private draw(w: ViewWorld): void {
    this.layout();
    const { ctx } = this;
    const shakeX = w.shake ? (Math.random() - 0.5) * 5 * w.shake : 0;
    const shakeY = w.shake ? (Math.random() - 0.5) * 4 * w.shake : 0;
    ctx.save();
    ctx.translate(shakeX, shakeY);
    this.stage(w);
    this.lanes(w);
    this.notes(w);
    this.fx(w);
    this.hud(w);
    ctx.restore();
  }

  private stage(w: ViewWorld): void {
    const { ctx, w: W, h: H } = this;
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);

    const glow = w.fever.phase === 'flow' ? 0.16 : w.fever.phase === 'fever' ? 0.1 : 0.04;
    const bass = w.bass * 0.12;
    const g = ctx.createRadialGradient(this.hitX, H * 0.52, 20, this.hitX + W * 0.2, H * 0.52, W * 0.7);
    g.addColorStop(0, `rgba(196,92,38,${glow + bass})`);
    g.addColorStop(1, 'rgba(196,92,38,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = RULE;
    ctx.fillRect(0, 0, W, 1);
    ctx.fillRect(0, H - 1, W, 1);

    if (w.playing && !w.paused) {
      const progress = Math.max(0, Math.min(1, w.now / Math.max(w.duration, 0.01)));
      ctx.fillStyle = 'rgba(28,25,20,0.08)';
      ctx.fillRect(0, H - 3, W, 3);
      ctx.fillStyle = WARM;
      ctx.fillRect(0, H - 3, W * progress, 3);
    }
  }

  private lanes(w: ViewWorld): void {
    const { ctx, w: W } = this;
    for (let i = 0; i < 2; i++) {
      const y = this.laneY[i];
      ctx.fillStyle = 'rgba(28,25,20,0.035)';
      this.roundRect(ctx, 24, y - this.laneH / 2, W - 48, this.laneH, 18);
      ctx.fill();
      ctx.strokeStyle = RULE;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(this.hitX, y - this.laneH / 2 + 8);
      ctx.lineTo(this.hitX, y + this.laneH / 2 - 8);
      ctx.strokeStyle = 'rgba(28,25,20,0.22)';
      ctx.lineWidth = 2;
      ctx.stroke();

      const pulse = 10 + w.pulse * 4 + (i === 0 ? w.bass : w.level) * 6;
      ctx.beginPath();
      ctx.arc(this.hitX, y, pulse, 0, Math.PI * 2);
      ctx.fillStyle = w.fever.phase === 'idle' ? 'rgba(28,25,20,0.08)' : 'rgba(196,92,38,0.18)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(this.hitX, y, 7, 0, Math.PI * 2);
      ctx.fillStyle = INK;
      ctx.fill();
    }
  }

  private notes(w: ViewWorld): void {
    const { ctx, w: W } = this;
    const travel = W - this.hitX - 48;
    for (const note of w.notes) {
      if (note.judged && !note.holding) continue;
      const t = (note.time - w.now) / w.approach;
      if (t > 1.15 || t < -0.2) continue;

      let alpha = 1;
      if (w.hidden && t < 0.38) alpha = Math.max(0, (t - 0.08) / 0.3);
      if (w.sudden && t > 0.55) alpha = Math.max(0, 1 - (t - 0.55) / 0.25);
      if (alpha <= 0) continue;

      const x = this.hitX + t * travel;
      const y = this.laneY[note.lane];
      ctx.globalAlpha = alpha;

      if (note.duration > 0) {
        const endT = (note.time + note.duration - w.now) / w.approach;
        const x2 = this.hitX + Math.max(endT, 0) * travel;
        const x1 = note.holding ? this.hitX : x;
        ctx.fillStyle = note.holding ? 'rgba(196,92,38,0.35)' : 'rgba(28,25,20,0.16)';
        this.roundRect(ctx, Math.min(x1, x2), y - 7, Math.abs(x2 - x1) + 10, 14, 7);
        ctx.fill();
      }

      const r = note.chordGroup != null ? 11 : 9;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = note.chordGroup != null ? WARM : INK;
      ctx.fill();
      if (note.chordGroup != null) {
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = PAPER;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  private fx(w: ViewWorld): void {
    const { ctx } = this;
    for (const r of w.rings) {
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = r.life;
      ctx.lineWidth = r.width;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const p of w.particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  private hud(w: ViewWorld): void {
    const { ctx, w: W, h: H } = this;
    ctx.textBaseline = 'top';
    ctx.fillStyle = MUTED;
    ctx.font = '500 11px "Poppins", system-ui, sans-serif';
    ctx.fillText(w.songTitle.toUpperCase(), 28, 18);
    ctx.fillStyle = INK;
    ctx.font = '500 12px "Poppins", system-ui, sans-serif';
    ctx.fillText(w.difficulty, 28, 34);
    if (w.practice) {
      ctx.fillStyle = WARM;
      ctx.fillText('PRACTICE', 28, 52);
    }

    ctx.textAlign = 'right';
    ctx.fillStyle = MUTED;
    ctx.font = '500 11px "Poppins", system-ui, sans-serif';
    ctx.fillText('SCORE', W - 28, 18);
    ctx.fillStyle = INK;
    ctx.font = '600 22px "Poppins", system-ui, sans-serif';
    ctx.fillText(String(w.score), W - 28, 32);
    ctx.font = '500 11px "Poppins", system-ui, sans-serif';
    ctx.fillStyle = MUTED;
    ctx.fillText(`${w.accuracy.toFixed(1)}%`, W - 28, 58);
    ctx.textAlign = 'left';

    this.feverMeter(w);
    this.healthBar(w);
    this.timingMeter(w);

    if (w.combo >= 2 && !w.countdown) {
      ctx.textAlign = 'center';
      ctx.fillStyle = w.fever.phase === 'idle' ? INK : WARM;
      ctx.font = '600 44px "Poppins", system-ui, sans-serif';
      ctx.fillText(String(w.combo), W / 2, H * 0.18);
      ctx.font = '500 11px "Poppins", system-ui, sans-serif';
      ctx.fillStyle = MUTED;
      ctx.fillText(w.perfectChain >= 5 ? `PERFECT CHAIN ${w.perfectChain}` : 'COMBO', W / 2, H * 0.18 + 46);
      ctx.textAlign = 'left';
    }

    if (w.judgeLife > 0 && w.judgeFlash) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, w.judgeLife * 1.4);
      ctx.textAlign = 'center';
      ctx.fillStyle = w.judgeColor;
      ctx.font = '600 20px "Poppins", system-ui, sans-serif';
      ctx.fillText(w.judgeFlash, W / 2, H * 0.72);
      ctx.restore();
    }

    if (w.countdown && w.playing) {
      const n = Math.max(0, Math.ceil(w.countdownRemain - 0.2));
      ctx.textAlign = 'center';
      ctx.fillStyle = INK;
      ctx.font = '600 72px "Poppins", system-ui, sans-serif';
      ctx.fillText(n > 0 ? String(n) : 'GO', W / 2, H * 0.36);
      ctx.font = '500 13px "Poppins", system-ui, sans-serif';
      ctx.fillStyle = MUTED;
      ctx.fillText(`${w.songTitle}  ·  ${w.difficulty}`, W / 2, H * 0.36 + 80);
      ctx.textAlign = 'left';
    }

    if (w.paused) {
      ctx.fillStyle = 'rgba(244,239,230,0.72)';
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.fillStyle = INK;
      ctx.font = '600 28px "Poppins", system-ui, sans-serif';
      ctx.fillText('Paused', W / 2, H * 0.42);
      ctx.font = '500 13px "Poppins", system-ui, sans-serif';
      ctx.fillStyle = MUTED;
      ctx.fillText('Esc or tap to resume', W / 2, H * 0.42 + 36);
      ctx.textAlign = 'left';
    }

    ctx.fillStyle = MUTED;
    ctx.font = '500 11px "Poppins", system-ui, sans-serif';
    ctx.fillText(w.section.toUpperCase(), 28, H - 22);
    if (w.speed !== 1) ctx.fillText(`${w.speed.toFixed(2)}×`, 110, H - 22);
  }

  private feverMeter(w: ViewWorld): void {
    const { ctx, w: W } = this;
    const x = W / 2 - 70;
    const y = 22;
    ctx.fillStyle = 'rgba(28,25,20,0.08)';
    this.roundRect(ctx, x, y, 140, 8, 4);
    ctx.fill();
    const fill = w.fever.phase === 'idle' ? w.fever.meter : Math.max(0.15, w.fever.timeLeft / 10);
    ctx.fillStyle = w.fever.phase === 'flow' ? '#e8c36a' : w.fever.phase === 'fever' ? WARM : INK;
    this.roundRect(ctx, x, y, 140 * Math.min(1, fill), 8, 4);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.font = '600 10px "Poppins", system-ui, sans-serif';
    ctx.fillStyle = w.fever.phase === 'idle' ? MUTED : WARM;
    ctx.fillText(w.fever.phase === 'flow' ? 'FLOW STATE' : w.fever.phase === 'fever' ? 'FEVER' : 'FEVER', W / 2, y + 12);
    ctx.textAlign = 'left';
  }

  private healthBar(w: ViewWorld): void {
    const { ctx, w: W, h: H } = this;
    ctx.fillStyle = 'rgba(28,25,20,0.08)';
    this.roundRect(ctx, W - 148, H - 24, 120, 6, 3);
    ctx.fill();
    ctx.fillStyle = w.health < 30 ? '#d98980' : INK;
    this.roundRect(ctx, W - 148, H - 24, 120 * (w.health / 100), 6, 3);
    ctx.fill();
  }

  private timingMeter(w: ViewWorld): void {
    const { ctx, w: W, h: H } = this;
    const x = W / 2;
    const y = H * 0.8;
    const half = 64;
    ctx.strokeStyle = RULE;
    ctx.beginPath();
    ctx.moveTo(x - half, y);
    ctx.lineTo(x + half, y);
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.fillRect(x - 1, y - 6, 2, 12);
    if (w.lastHitError != null) {
      const t = Math.max(-1, Math.min(1, w.lastHitError / w.goodWindow));
      ctx.fillStyle = WARM;
      ctx.beginPath();
      ctx.arc(x + t * half, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
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


