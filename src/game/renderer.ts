/**
 * Canvas view for Flow. The playfield is a dark stage (same idea as the
 * immersive player) so notes stay readable in both app themes; chrome around
 * it is ResonTune.
 */
import type { ActiveHold, Difficulty, HitRing, ModifierId, Note, Particle, TimingSample } from './types';
import { comboColor } from './scoring';

export interface ViewWorld {
  notes: Note[];
  holds: ActiveHold[];
  playing: boolean;
  paused: boolean;
  now: number;
  approach: number;
  missWindow: number;
  difficulty: Difficulty;
  modifiers: ReadonlySet<ModifierId>;
  health: number;
  chartEnd: number;
  songDuration: number;
  counts: { perfect: number; good: number; ok: number; miss: number; drop: number };
  judgedNotes: number;
  combo: number;
  freq: Uint8Array | null;
  reducedMotion: boolean;
}

const LANE0 = '#ff75c5';
const LANE1 = '#719cff';
const PERFECT = '#68f5d1';

export class GameView {
  particles: Particle[] = [];
  rings: HitRing[] = [];
  samples: TimingSample[] = [];
  shakeTime = 0;
  shakeMag = 0;
  flashAlpha = 0;
  flashColor = '255,255,255';
  lanePulse: [number, number] = [0, 0];
  private w = 0;
  private h = 0;

  get width(): number { return this.w; }
  get height(): number { return this.h; }

  resize(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = rect.width;
    this.h = rect.height;
  }

  hitX(): number { return this.w * 0.20; }
  laneY(lane: 0 | 1): number { return lane === 0 ? this.h * 0.36 : this.h * 0.72; }
  laneColor(lane: 0 | 1): string { return lane === 0 ? LANE0 : LANE1; }

  spawnParticles(x: number, y: number, color: string, amount: number, power: number): void {
    for (let i = 0; i < amount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (60 + Math.random() * 170) * power;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 45,
        life: 1,
        size: 2 + Math.random() * 3.5,
        color,
      });
    }
  }

  spawnRing(x: number, y: number, color: string): void {
    this.rings.push({ x, y, r: 26, life: 1, color });
  }

  addShake(mag: number, time: number): void {
    this.shakeMag = Math.max(this.shakeMag, mag);
    this.shakeTime = Math.max(this.shakeTime, time);
  }

  flash(color: string, alpha: number): void {
    this.flashColor = color;
    this.flashAlpha = Math.max(this.flashAlpha, alpha);
  }

  pulseLane(lane: 0 | 1): void {
    this.lanePulse[lane] = 1;
  }

  pushSample(error: number, kind: TimingSample['kind']): void {
    this.samples.push({ error, kind });
    if (this.samples.length > 28) this.samples.shift();
  }

  resetFx(): void {
    this.particles = [];
    this.rings = [];
    this.samples = [];
    this.flashAlpha = 0;
    this.shakeTime = 0;
    this.shakeMag = 0;
    this.lanePulse = [0, 0];
  }

  draw(ctx: CanvasRenderingContext2D, world: ViewWorld, dt: number, pulseNow: number): void {
    const { w, h } = this;
    if (w <= 0 || h <= 0) return;

    ctx.clearRect(0, 0, w, h);
    this.drawBackdrop(ctx);
    this.drawVisualizer(ctx, world);

    ctx.save();
    if (this.shakeTime > 0 && !world.reducedMotion) {
      this.shakeTime -= dt;
      const k = Math.min(1, Math.max(0, this.shakeTime) * 4);
      ctx.translate((Math.random() - 0.5) * 2 * this.shakeMag * k, (Math.random() - 0.5) * 2 * this.shakeMag * k);
      if (this.shakeTime <= 0) this.shakeMag = 0;
    }

    this.drawLanes(ctx, pulseNow, world);
    if (world.playing) this.drawNotes(ctx, world);
    this.updateParticles(ctx, dt, world.paused);
    this.updateRings(ctx, dt, world.paused);
    ctx.restore();

    this.drawCountdown(ctx, world);
    this.drawHealth(ctx, world);
    this.drawProgress(ctx, world);
    this.drawTally(ctx, world);
    this.drawErrorMeter(ctx, world);
    this.drawFlash(ctx, dt);
  }

  private drawBackdrop(ctx: CanvasRenderingContext2D): void {
    const { w, h } = this;
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#120e0c');
    g.addColorStop(0.55, '#0c0b09');
    g.addColorStop(1, '#14110f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    const a = ctx.createRadialGradient(w * 0.12, h * 0.1, 0, w * 0.12, h * 0.1, w * 0.5);
    a.addColorStop(0, 'rgba(255, 182, 147, 0.10)');
    a.addColorStop(1, 'transparent');
    ctx.fillStyle = a;
    ctx.fillRect(0, 0, w, h);

    const b = ctx.createRadialGradient(w * 0.9, h * 0.85, 0, w * 0.9, h * 0.85, w * 0.45);
    b.addColorStop(0, 'rgba(255, 117, 197, 0.08)');
    b.addColorStop(1, 'transparent');
    ctx.fillStyle = b;
    ctx.fillRect(0, 0, w, h);
  }

  private drawVisualizer(ctx: CanvasRenderingContext2D, world: ViewWorld): void {
    if (!world.freq || !world.playing) return;
    const bars = 42;
    const gap = 3;
    const barWidth = (this.w - 28 - gap * (bars - 1)) / bars;
    for (let i = 0; i < bars; i++) {
      const index = Math.floor((i * world.freq.length) / bars * 0.8);
      const v = world.freq[index] / 255;
      const height = 4 + v * v * this.h * 0.28;
      const x = 14 + i * (barWidth + gap);
      ctx.globalAlpha = 0.45 + v * 0.5;
      ctx.fillStyle = i % 2 ? 'rgba(255,117,197,0.5)' : 'rgba(104,245,209,0.5)';
      ctx.beginPath();
      ctx.roundRect(x, this.h - 12 - height, barWidth, height, 3);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawLanes(ctx: CanvasRenderingContext2D, pulseNow: number, world: ViewWorld): void {
    const top = this.h * 0.36;
    const bot = this.h * 0.72;
    this.roundRect(ctx, 14, top - 52, this.w - 28, 104, 18, 'rgba(255,255,255,0.025)');
    this.roundRect(ctx, 14, bot - 52, this.w - 28, 104, 18, 'rgba(255,255,255,0.025)');

    const lanes: { y: number; label: string; color: string; pulse: number }[] = [
      { y: top, label: world.modifiers.has('split') ? 'UPPER · A S D F' : 'UPPER FLOW', color: LANE0, pulse: this.lanePulse[0] },
      { y: bot, label: world.modifiers.has('split') ? 'LOWER · J K L' : 'LOWER FLOW', color: LANE1, pulse: this.lanePulse[1] },
    ];

    for (let i = 0; i < 2; i++) this.lanePulse[i] = Math.max(0, this.lanePulse[i] - 0.04);

    for (const lane of lanes) {
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, lane.y);
      ctx.lineTo(this.w, lane.y);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,255,255,0.42)';
      ctx.font = '600 11px Poppins, system-ui';
      ctx.textAlign = 'left';
      ctx.fillText(lane.label, 23, lane.y - 66);

      this.drawTarget(ctx, this.hitX(), lane.y, lane.color, pulseNow, lane.pulse);
    }

    ctx.save();
    ctx.strokeStyle = 'rgba(104,245,209,0.54)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 8]);
    ctx.beginPath();
    ctx.moveTo(this.hitX(), 0);
    ctx.lineTo(this.hitX(), this.h);
    ctx.stroke();
    ctx.restore();
  }

  private drawTarget(ctx: CanvasRenderingContext2D, x: number, y: number, accent: string, pulseNow: number, hitPulse: number): void {
    const pulse = 1 + Math.sin(pulseNow * 7) * 0.035 + hitPulse * 0.12;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pulse, pulse);

    ctx.globalAlpha = 0.12 + hitPulse * 0.2;
    ctx.beginPath();
    ctx.arc(0, 0, 43, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();

    ctx.globalAlpha = 0.95;
    ctx.lineWidth = 4;
    ctx.strokeStyle = accent;
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();
  }

  private xAtTime(time: number, now: number, spawnX: number, approach: number): number {
    const progress = 1 - (time - now) / approach;
    return spawnX + (this.hitX() - spawnX) * progress;
  }

  private noteAlpha(timeUntil: number, approach: number, modifiers: ReadonlySet<ModifierId>): number {
    let alpha = Math.min(1, Math.max(0, 1 - timeUntil / approach + 0.12));
    if (modifiers.has('hidden') && timeUntil < approach * 0.45) {
      alpha *= Math.max(0, timeUntil / (approach * 0.45));
    }
    if (modifiers.has('sudden') && timeUntil > approach * 0.42) alpha = 0;
    return alpha;
  }

  private drawNotes(ctx: CanvasRenderingContext2D, world: ViewWorld): void {
    const spawnX = this.w + 65;
    const holdByNote = new Map(world.holds.map((h) => [h.note.id, h]));

    for (const note of world.notes) {
      if (note.judged) continue;
      if (note.holding) {
        const h = holdByNote.get(note.id);
        if (h) this.drawHoldActive(ctx, note, world.now, h, world.approach);
        continue;
      }

      const timeUntil = note.time - world.now;
      if (timeUntil > world.approach + 0.3) continue;

      if (note.duration > 0) {
        this.drawHoldNote(ctx, note, world.now, spawnX, world.approach, world.modifiers);
        continue;
      }

      const x = this.xAtTime(note.time, world.now, spawnX, world.approach);
      const y = this.laneY(note.lane);
      const color = this.laneColor(note.lane);
      const nearTarget = Math.max(0, 1 - Math.abs(timeUntil) * 2);
      const radius = 20 + nearTarget * 5;
      const alpha = this.noteAlpha(timeUntil, world.approach, world.modifiers);
      if (alpha <= 0.01) continue;

      ctx.save();
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha * 0.14;
      ctx.beginPath();
      ctx.arc(x + 20, y, radius * 0.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = alpha * 0.07;
      ctx.beginPath();
      ctx.arc(x + 40, y, radius * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      this.drawNote(ctx, x, y, radius, color, alpha);
      if (note.chord) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = '800 9px Poppins, system-ui';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText('×2', x, y + 3);
        ctx.restore();
      }
    }
  }

  private drawNote(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, alpha: number): void {
    ctx.save();
    ctx.globalAlpha = alpha * 0.19;
    ctx.beginPath();
    ctx.arc(x, y, radius + 15, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    ctx.globalAlpha = alpha * 0.42;
    ctx.beginPath();
    ctx.arc(x - radius * 0.22, y - radius * 0.22, radius * 0.36, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.globalAlpha = alpha * 0.9;
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawHoldNote(ctx: CanvasRenderingContext2D, note: Note, now: number, spawnX: number, approach: number, modifiers: ReadonlySet<ModifierId>): void {
    const y = this.laneY(note.lane);
    const color = this.laneColor(note.lane);
    const timeUntilHead = note.time - now;
    const alpha = this.noteAlpha(timeUntilHead, approach, modifiers);
    if (alpha <= 0.01) return;

    const xh = this.xAtTime(note.time, now, spawnX, approach);
    const xt = Math.max(xh + 4, this.xAtTime(note.time + note.duration, now, spawnX, approach));

    ctx.save();
    ctx.globalAlpha = alpha * 0.55;
    const grad = ctx.createLinearGradient(xh, 0, xt, 0);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(255,255,255,0.25)');
    ctx.beginPath();
    ctx.roundRect(xh, y - 10, xt - xh, 20, 10);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.globalAlpha = alpha * 0.5;
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.stroke();

    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(xt, y, 12, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.restore();

    const nearTarget = Math.max(0, 1 - Math.abs(timeUntilHead) * 2);
    this.drawNote(ctx, xh, y, 20 + nearTarget * 5, color, alpha);
  }

  private drawHoldActive(ctx: CanvasRenderingContext2D, note: Note, now: number, hold: ActiveHold, approach: number): void {
    const y = this.laneY(note.lane);
    const color = this.laneColor(note.lane);
    const spawnX = this.w + 65;
    const xt = Math.max(this.hitX() + 2, this.xAtTime(note.time + note.duration, now, spawnX, approach));
    const remaining = Math.max(0, (hold.until - now) / note.duration);

    ctx.save();
    const grad = ctx.createLinearGradient(this.hitX(), 0, xt, 0);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.25, color);
    grad.addColorStop(1, color);
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.roundRect(this.hitX() - 6, y - 11, xt - this.hitX() + 6, 22, 11);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(this.hitX(), y, 40, -Math.PI / 2, -Math.PI / 2 + remaining * Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(this.hitX(), y, 22 + Math.sin(now * 20) * 2, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    ctx.font = '700 12px Poppins, system-ui';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.fillText('HOLD', this.hitX() + 34, y - 18);
    ctx.restore();
  }

  private updateParticles(ctx: CanvasRenderingContext2D, dt: number, paused: boolean): void {
    if (paused) {
      for (const p of this.particles) {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.4 + p.life * 0.6), 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      return;
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt * 1.6;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 520 * dt;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.4 + p.life * 0.6), 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private updateRings(ctx: CanvasRenderingContext2D, dt: number, paused: boolean): void {
    if (paused) {
      for (const ring of this.rings) {
        ctx.globalAlpha = Math.max(0, ring.life);
        ctx.lineWidth = 3.5 * ring.life;
        ctx.strokeStyle = ring.color;
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      return;
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i];
      ring.life -= dt * 2.2;
      if (ring.life <= 0) {
        this.rings.splice(i, 1);
        continue;
      }
      ring.r += dt * 260;
      ctx.globalAlpha = Math.max(0, ring.life);
      ctx.lineWidth = 3.5 * ring.life;
      ctx.strokeStyle = ring.color;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private drawCountdown(ctx: CanvasRenderingContext2D, world: ViewWorld): void {
    if (!world.playing) return;
    const now = world.now;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 92px Poppins, system-ui';
    ctx.fillStyle = PERFECT;
    if (now < 0) {
      const remaining = -now;
      const num = String(Math.min(3, Math.ceil(remaining)));
      const frac = 1 - (remaining % 1);
      const scale = 0.7 + frac * 0.5;
      ctx.globalAlpha = 0.25 + frac * 0.75;
      ctx.translate(this.w / 2, this.h / 2);
      ctx.scale(scale, scale);
      ctx.fillText(num, 0, 0);
    } else if (now < 0.6) {
      ctx.globalAlpha = 1 - now / 0.6;
      const scale = 1 + now * 0.5;
      ctx.translate(this.w / 2, this.h / 2);
      ctx.scale(scale, scale);
      ctx.fillText('GO!', 0, 0);
    }
    ctx.restore();
  }

  private drawHealth(ctx: CanvasRenderingContext2D, world: ViewWorld): void {
    if (!world.playing) return;
    const barWidth = Math.min(340, this.w * 0.5);
    const x = (this.w - barWidth) / 2;
    const y = this.h - 28;
    const h = 9;
    let color = PERFECT;
    if (world.health <= 28) color = '#ff667d';
    else if (world.health <= 55) color = '#ffd46b';
    let alpha = 0.95;
    if (world.health <= 28) alpha = 0.55 + Math.abs(Math.sin(performance.now() / 180)) * 0.45;
    ctx.save();
    this.roundRect(ctx, x, y, barWidth, h, 5, 'rgba(255,255,255,0.07)');
    ctx.globalAlpha = alpha;
    this.roundRect(ctx, x, y, Math.max(h, barWidth * world.health / 100), h, 5, color);
    ctx.globalAlpha = 1;
    ctx.font = '600 10px Poppins, system-ui';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.textAlign = 'center';
    ctx.fillText(world.modifiers.has('nofail') ? 'NO FAIL' : 'HEALTH', this.w / 2, y - 5);
    ctx.restore();
  }

  private drawProgress(ctx: CanvasRenderingContext2D, world: ViewWorld): void {
    if (!world.playing) return;
    const total = Math.max(world.chartEnd, world.songDuration || 60);
    const p = Math.max(0, Math.min(1, world.now / total));
    const margin = 14;
    const y = this.h - 9;
    const h = 5;
    const barWidth = this.w - margin * 2;
    const fillWidth = barWidth * p;
    this.roundRect(ctx, margin, y, barWidth, h, 3, 'rgba(255,255,255,0.08)');
    if (fillWidth > 2) {
      const gradient = ctx.createLinearGradient(margin, 0, margin + barWidth, 0);
      gradient.addColorStop(0, PERFECT);
      gradient.addColorStop(1, LANE0);
      this.roundRect(ctx, margin, y, Math.max(h, fillWidth), h, 3, gradient);
    }
    ctx.beginPath();
    ctx.arc(margin + fillWidth, y + h / 2, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.font = '600 11px Poppins, system-ui';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.textAlign = 'right';
    ctx.fillText(`${fmt(world.now)} / ${fmt(total)}`, this.w - 16, y - 7);
  }

  private drawTally(ctx: CanvasRenderingContext2D, world: ViewWorld): void {
    if (!world.playing || world.judgedNotes <= 0) return;
    const parts: [string, number, string][] = [
      ['PERFECT', world.counts.perfect, PERFECT],
      ['GOOD', world.counts.good, LANE1],
      ['OK', world.counts.ok, '#ffd46b'],
      ['MISS', world.counts.miss, '#ff667d'],
      ['DROP', world.counts.drop, '#ff9f6b'],
    ];
    ctx.save();
    ctx.font = '600 10px Poppins, system-ui';
    let x = 16;
    const y = this.h - 40;
    for (const [label, value, color] of parts) {
      const text = `${label} ${value}`;
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
      x += ctx.measureText(text).width + 12;
    }
    ctx.fillStyle = comboColor(world.combo);
    ctx.restore();
  }

  private drawErrorMeter(ctx: CanvasRenderingContext2D, world: ViewWorld): void {
    if (!world.playing || this.samples.length === 0) return;
    const mw = Math.min(220, this.w * 0.32);
    const x = this.w - mw - 18;
    const y = 16;
    const h = 8;
    ctx.save();
    this.roundRect(ctx, x, y, mw, h, 4, 'rgba(255,255,255,0.08)');
    ctx.fillStyle = 'rgba(104,245,209,0.85)';
    ctx.fillRect(x + mw / 2 - 1, y - 2, 2, h + 4);
    const window = world.difficulty.ok;
    for (const s of this.samples) {
      const t = 0.5 + (s.error / window) * 0.5;
      const px = x + Math.min(1, Math.max(0, t)) * mw;
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = s.kind === 'perfect' ? PERFECT : s.kind === 'good' ? LANE1 : s.kind === 'ok' ? '#ffd46b' : '#ff667d';
      ctx.beginPath();
      ctx.arc(px, y + h / 2, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 0.45;
    ctx.font = '600 9px Poppins, system-ui';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.fillText('EARLY', x, y + h + 12);
    ctx.textAlign = 'right';
    ctx.fillText('LATE', x + mw, y + h + 12);
    ctx.restore();
  }

  private drawFlash(ctx: CanvasRenderingContext2D, dt: number): void {
    if (this.flashAlpha <= 0.005) return;
    ctx.fillStyle = `rgba(${this.flashColor},${this.flashAlpha.toFixed(3)})`;
    ctx.fillRect(0, 0, this.w, this.h);
    this.flashAlpha = Math.max(0, this.flashAlpha - dt * 0.6);
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number, fillStyle: string | CanvasGradient): void {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }
}

function fmt(t: number): string {
  const s = Math.max(0, Math.floor(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
