/**
 * Canvas stage + HUD. React does not paint score/combo/fever during play.
 *
 * Holds stay on stage until they are cleared or dropped: the head being
 * judged does not cull the body or tail.
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
}

const STAGE = '#141210';
const CREAM = '#f3e6d8';
const PEACH = '#ffb693';
const MUTED = 'rgba(236,229,225,0.42)';
const INK = 'rgba(236,229,225,0.92)';

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
  private laneH = 56;
  private noteR = 18;

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
    this.hitX = Math.round(Math.max(72, Math.min(128, w * 0.18)));
    const mid = h * 0.54;
    this.laneH = Math.max(56, Math.min(78, h * 0.12));
    this.laneY = [mid - this.laneH * 1.08, mid + this.laneH * 1.08];
    this.noteR = Math.max(16, Math.min(22, this.laneH * 0.36));
  }

  private draw(w: ViewWorld): void {
    this.layout();
    const { ctx, w: W, h: H } = this;
    const cam = 1 + w.bass * 0.008 + w.pulse * 0.01 + (w.fever.phase === 'flow' ? 0.006 : 0);
    const shakeX = w.shake ? (Math.random() - 0.5) * 3.2 * w.shake : 0;
    const shakeY = w.shake ? (Math.random() - 0.5) * 2.4 * w.shake : 0;
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

    const fever = w.fever.phase === 'flow' ? 0.22 : w.fever.phase === 'fever' ? 0.14 : 0.05;
    const wash = ctx.createRadialGradient(this.hitX, H * 0.54, 12, W * 0.42, H * 0.54, W * 0.78);
    wash.addColorStop(0, `rgba(255,182,147,${fever + w.bass * 0.16 + w.pulse * 0.08})`);
    wash.addColorStop(0.45, `rgba(255,182,147,${0.03 + w.level * 0.05})`);
    wash.addColorStop(1, 'rgba(20,18,16,0)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, W, H);

    if (w.fever.phase === 'flow') {
      const gold = ctx.createRadialGradient(W * 0.5, H * 0.5, 40, W * 0.5, H * 0.5, W * 0.7);
      gold.addColorStop(0, 'rgba(255,214,150,0.08)');
      gold.addColorStop(1, 'rgba(255,214,150,0)');
      ctx.fillStyle = gold;
      ctx.fillRect(0, 0, W, H);
    }

    if (w.playing && !w.paused) {
      const progress = Math.max(0, Math.min(1, w.now / Math.max(w.duration, 0.01)));
      ctx.fillStyle = 'rgba(236,229,225,0.08)';
      ctx.fillRect(0, H - 2, W, 2);
      ctx.fillStyle = PEACH;
      ctx.globalAlpha = 0.7;
      ctx.fillRect(0, H - 2, W * progress, 2);
      ctx.globalAlpha = 1;
    }
  }

  private lanes(w: ViewWorld): void {
    const { ctx, w: W } = this;
    const holding = [false, false];
    for (const hold of w.holds) holding[hold.note.lane] = true;

    for (let i = 0; i < 2; i++) {
      const y = this.laneY[i];
      const punch = w.lanePulse[i] ?? 0;
      ctx.fillStyle = i === 0
        ? `rgba(255,182,147,${0.055 + w.bass * 0.04 + punch * 0.05})`
        : `rgba(255,182,147,${0.045 + w.level * 0.04 + punch * 0.05})`;
      this.roundRect(ctx, 20, y - this.laneH / 2, W - 40, this.laneH, this.laneH / 2);
      ctx.fill();

      const r = this.noteR + 7 + punch * 5 + (holding[i] ? 2 : 0);
      const scale = (holding[i] ? 0.92 : 1) * (1 + punch * 0.16);
      ctx.save();
      ctx.translate(this.hitX, y);
      ctx.scale(scale, holding[i] ? scale * 0.94 : scale);

      ctx.beginPath();
      ctx.arc(0, 0, r + 6, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,182,147,${0.07 + punch * 0.12 + (w.fever.phase === 'idle' ? 0 : 0.06)})`;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,182,147,${0.55 + punch * 0.35})`;
      ctx.lineWidth = 2.4 + punch * 1.6;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, 0, this.noteR * 0.42, 0, Math.PI * 2);
      ctx.fillStyle = holding[i] ? PEACH : `rgba(243,230,216,${0.55 + punch * 0.4})`;
      ctx.fill();
      ctx.restore();
    }
  }

  private notes(w: ViewWorld): void {
    const { ctx, w: W } = this;
    const travel = W - this.hitX - 36;
    type Drawn = { note: Note; headX: number; tailX: number; y: number; alpha: number; r: number; holding: boolean };
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
      const tailX = this.hitX + Math.max(tailT, note.holding ? 0 : tailT) * travel;
      const r = this.noteR * (note.chordGroup != null ? 1.08 : 1);
      drawn.push({ note, headX, tailX, y: this.laneY[note.lane], alpha, r, holding: note.holding });
    }

    for (const d of drawn) {
      if (d.note.duration <= 0) continue;
      this.holdBody(w, d);
    }
    for (const d of drawn) this.noteHead(d);
  }

  private holdBody(w: ViewWorld, d: { note: Note; headX: number; tailX: number; y: number; alpha: number; r: number; holding: boolean }): void {
    const { ctx } = this;
    const left = Math.min(d.headX, d.tailX);
    const width = Math.max(Math.abs(d.tailX - d.headX), d.r);
    const h = d.r * 0.78;
    const remain = d.note.duration > 0
      ? Math.max(0, Math.min(1, (d.note.time + d.note.duration - w.now) / d.note.duration))
      : 1;
    ctx.globalAlpha = d.alpha;
    ctx.fillStyle = d.holding ? `rgba(255,182,147,${0.28 + remain * 0.12})` : 'rgba(255,182,147,0.2)';
    this.roundRect(ctx, left, d.y - h / 2, width + d.r * 0.4, h, h / 2);
    ctx.fill();
    ctx.fillStyle = d.holding ? 'rgba(255,230,210,0.45)' : 'rgba(255,230,210,0.22)';
    this.roundRect(ctx, left, d.y - h * 0.18, width + d.r * 0.2, h * 0.36, h * 0.18);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(d.tailX, d.y, d.r * 0.7, 0, Math.PI * 2);
    const tail = ctx.createRadialGradient(d.tailX - 2, d.y - 2, 1, d.tailX, d.y, d.r * 0.7);
    tail.addColorStop(0, 'rgba(255,244,232,0.95)');
    tail.addColorStop(1, PEACH);
    ctx.fillStyle = tail;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  private noteHead(d: { note: Note; headX: number; y: number; alpha: number; r: number; holding: boolean }): void {
    const { ctx } = this;
    ctx.globalAlpha = d.alpha;
    ctx.save();
    ctx.translate(d.headX, d.y);
    if (d.holding) ctx.scale(0.96, 0.9);
    ctx.beginPath();
    ctx.arc(0, 0, d.r + 3, 0, Math.PI * 2);
    ctx.fillStyle = d.note.chordGroup != null ? 'rgba(255,182,147,0.28)' : 'rgba(243,230,216,0.16)';
    ctx.fill();
    const g = ctx.createRadialGradient(-d.r * 0.28, -d.r * 0.32, 1, 0, 0, d.r);
    g.addColorStop(0, '#fff6ee');
    g.addColorStop(0.45, CREAM);
    g.addColorStop(1, d.note.chordGroup != null ? PEACH : '#e7b99a');
    ctx.beginPath();
    ctx.arc(0, 0, d.r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    if (d.note.chordGroup != null) {
      ctx.beginPath();
      ctx.arc(0, 0, d.r * 0.38, 0, Math.PI * 2);
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
      ctx.globalAlpha = r.life * 0.85;
      ctx.lineWidth = r.width;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const p of w.particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private hud(w: ViewWorld): void {
    const { ctx, w: W, h: H } = this;
    ctx.textBaseline = 'top';
    ctx.fillStyle = MUTED;
    ctx.font = '500 10px "Poppins", system-ui, sans-serif';
    ctx.fillText(w.difficulty, 22, 16);
    if (w.practice) {
      ctx.fillStyle = PEACH;
      ctx.fillText('PRACTICE', 22, 32);
    }

    ctx.textAlign = 'right';
    ctx.fillStyle = MUTED;
    ctx.font = '500 10px "Poppins", system-ui, sans-serif';
    ctx.fillText('SCORE', W - 22, 16);
    ctx.fillStyle = INK;
    ctx.font = '600 18px "Poppins", system-ui, sans-serif';
    ctx.fillText(String(w.score), W - 22, 28);
    ctx.font = '500 11px "Poppins", system-ui, sans-serif';
    ctx.fillStyle = MUTED;
    ctx.fillText(`${w.accuracy.toFixed(1)}%`, W - 22, 50);
    ctx.textAlign = 'left';

    this.feverEnergy(w);
    this.healthPip(w);
    this.timingMeter(w);

    if (w.combo >= 2 && !w.countdown) {
      const punch = 1 + w.comboPunch * 0.12;
      ctx.save();
      ctx.translate(W / 2, H * 0.16);
      ctx.scale(punch, punch);
      ctx.textAlign = 'center';
      ctx.fillStyle = w.fever.phase === 'idle' ? CREAM : PEACH;
      ctx.font = '650 48px "Poppins", system-ui, sans-serif';
      ctx.fillText(String(w.combo), 0, 0);
      ctx.font = '500 10px "Poppins", system-ui, sans-serif';
      ctx.fillStyle = MUTED;
      ctx.fillText(w.perfectChain >= 8 ? `CHAIN ${w.perfectChain}` : 'COMBO', 0, 50);
      ctx.restore();
    }

    if (w.judgeLife > 0 && w.judgeFlash) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, w.judgeLife * 1.5);
      ctx.textAlign = 'center';
      ctx.fillStyle = w.judgeColor;
      ctx.translate(W / 2, H * 0.74);
      ctx.scale(w.judgeScale, w.judgeScale);
      ctx.font = '600 18px "Poppins", system-ui, sans-serif';
      ctx.fillText(w.judgeFlash, 0, 0);
      ctx.restore();
    }

    if (w.countdown && w.playing) {
      const n = Math.max(0, Math.ceil(w.countdownRemain - 0.2));
      ctx.textAlign = 'center';
      ctx.fillStyle = CREAM;
      ctx.font = '650 68px "Poppins", system-ui, sans-serif';
      ctx.fillText(n > 0 ? String(n) : 'GO', W / 2, H * 0.34);
      ctx.font = '500 12px "Poppins", system-ui, sans-serif';
      ctx.fillStyle = MUTED;
      ctx.fillText(w.songTitle, W / 2, H * 0.34 + 76);
      ctx.textAlign = 'left';
    }

    if (w.paused) {
      ctx.fillStyle = 'rgba(20,18,16,0.62)';
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.fillStyle = CREAM;
      ctx.font = '600 26px "Poppins", system-ui, sans-serif';
      ctx.fillText('Paused', W / 2, H * 0.42);
      ctx.font = '500 13px "Poppins", system-ui, sans-serif';
      ctx.fillStyle = MUTED;
      ctx.fillText('Esc or tap to resume', W / 2, H * 0.42 + 34);
      ctx.textAlign = 'left';
    }

    ctx.fillStyle = 'rgba(236,229,225,0.28)';
    ctx.font = '500 10px "Poppins", system-ui, sans-serif';
    ctx.fillText(w.section.toUpperCase(), 22, H - 20);
    if (w.speed !== 1) ctx.fillText(`${w.speed.toFixed(2)}×`, 96, H - 20);
  }

  private feverEnergy(w: ViewWorld): void {
    const { ctx, w: W } = this;
    const width = Math.min(168, W * 0.3);
    const x = (W - width) / 2;
    const y = 10;
    const fill = w.fever.phase === 'idle' ? w.fever.meter : Math.max(0.12, w.fever.timeLeft / 10);
    ctx.fillStyle = 'rgba(255,182,147,0.12)';
    this.roundRect(ctx, x, y, width, 3, 1.5);
    ctx.fill();
    ctx.fillStyle = w.fever.phase === 'flow' ? '#ffd696' : PEACH;
    ctx.globalAlpha = w.fever.phase === 'idle' ? 0.5 : 0.9;
    this.roundRect(ctx, x, y, width * Math.min(1, fill), 3, 1.5);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  private healthPip(w: ViewWorld): void {
    const { ctx, w: W, h: H } = this;
    ctx.fillStyle = 'rgba(236,229,225,0.1)';
    this.roundRect(ctx, W - 8, H * 0.3, 3, H * 0.4, 2);
    ctx.fill();
    const hh = H * 0.4 * (w.health / 100);
    ctx.fillStyle = w.health < 30 ? '#ffb4ab' : PEACH;
    this.roundRect(ctx, W - 8, H * 0.3 + H * 0.4 - hh, 3, hh, 2);
    ctx.fill();
  }

  private timingMeter(w: ViewWorld): void {
    const { ctx, w: W, h: H } = this;
    const x = W / 2;
    const y = H * 0.82;
    const half = 72;
    ctx.fillStyle = MUTED;
    ctx.font = '500 9px "Poppins", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('EARLY', x - half - 22, y - 4);
    ctx.fillText('LATE', x + half + 18, y - 4);
    ctx.textAlign = 'left';
    ctx.strokeStyle = 'rgba(236,229,225,0.18)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - half, y);
    ctx.lineTo(x + half, y);
    ctx.stroke();
    ctx.fillStyle = CREAM;
    ctx.beginPath();
    ctx.arc(x, y, 3.2, 0, Math.PI * 2);
    ctx.fill();
    for (const sample of w.timings.slice(-8)) {
      const t = Math.max(-1, Math.min(1, sample.error / w.goodWindow));
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = PEACH;
      ctx.beginPath();
      ctx.arc(x + t * half, y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (w.lastHitError != null) {
      const t = Math.max(-1, Math.min(1, w.lastHitError / w.goodWindow));
      ctx.fillStyle = PEACH;
      ctx.beginPath();
      ctx.arc(x + t * half, y, 4.2, 0, Math.PI * 2);
      ctx.fill();
      const ms = Math.round(w.lastHitError * 1000);
      ctx.textAlign = 'center';
      ctx.fillStyle = MUTED;
      ctx.font = '500 10px "Poppins", system-ui, sans-serif';
      const label = ms === 0 ? '0 ms' : `${Math.abs(ms)} ms ${ms < 0 ? 'early' : 'late'}`;
      ctx.fillText(label, x, y + 10);
      ctx.textAlign = 'left';
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
