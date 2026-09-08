/**
 * Short 808/kick percussion, triggered at judgement time against the
 * game AudioContext clock — not a render-frame callback.
 */
export type KickKind =
  | 'perfect'
  | 'great'
  | 'good'
  | 'miss'
  | 'clear'
  | 'drop'
  | 'chord'
  | 'fever'
  | 'hold'
  | 'tick';

export function playKick(
  ctx: AudioContext,
  dest: AudioNode,
  kind: KickKind,
  when = ctx.currentTime,
  opts: { fuller?: boolean } = {},
): void {
  if (kind === 'tick') {
    tick(ctx, dest, when);
    return;
  }
  if (kind === 'miss' || kind === 'drop') {
    thud(ctx, dest, when, kind === 'drop');
    return;
  }

  const fuller = opts.fuller || kind === 'fever';
  const pitch = kind === 'perfect' || kind === 'fever' ? 1.06 : kind === 'great' ? 1 : kind === 'chord' ? 0.9 : kind === 'hold' ? 0.82 : 0.88;
  const body = kind === 'fever' ? 1.08 : kind === 'perfect' ? 1 : kind === 'clear' ? 0.92 : kind === 'chord' ? 1.05 : kind === 'hold' ? 0.88 : 0.72;
  const click = kind === 'perfect' || kind === 'fever' || kind === 'chord' ? 1 : kind === 'hold' ? 0.42 : kind === 'great' ? 0.72 : 0.5;

  const osc = ctx.createOscillator();
  const bodyGain = ctx.createGain();
  osc.type = 'sine';
  const f0 = 88 * pitch;
  osc.frequency.setValueAtTime(f0, when);
  osc.frequency.exponentialRampToValueAtTime(34 * pitch, when + 0.09);
  bodyGain.gain.setValueAtTime(0.0001, when);
  bodyGain.gain.exponentialRampToValueAtTime((fuller ? 0.2 : 0.16) * body, when + 0.004);
  bodyGain.gain.exponentialRampToValueAtTime(0.001, when + 0.11);
  osc.connect(bodyGain).connect(dest);
  osc.start(when);
  osc.stop(when + 0.13);

  const clickOsc = ctx.createOscillator();
  const clickGain = ctx.createGain();
  clickOsc.type = 'triangle';
  clickOsc.frequency.setValueAtTime(kind === 'chord' ? 380 : 1600, when);
  clickOsc.frequency.exponentialRampToValueAtTime(180, when + 0.016);
  clickGain.gain.setValueAtTime(0.0001, when);
  clickGain.gain.exponentialRampToValueAtTime((fuller ? 0.055 : 0.046) * click, when + 0.0015);
  clickGain.gain.exponentialRampToValueAtTime(0.001, when + 0.024);
  clickOsc.connect(clickGain).connect(dest);
  clickOsc.start(when);
  clickOsc.stop(when + 0.032);

  if (kind === 'perfect' || kind === 'fever' || kind === 'chord' || fuller) {
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(kind === 'chord' ? 52 : 56, when);
    subGain.gain.setValueAtTime(0.0001, when);
    subGain.gain.exponentialRampToValueAtTime(fuller ? 0.07 : 0.055, when + 0.006);
    subGain.gain.exponentialRampToValueAtTime(0.001, when + 0.11);
    sub.connect(subGain).connect(dest);
    sub.start(when);
    sub.stop(when + 0.12);
  }

  if (kind === 'clear') {
    const ring = ctx.createOscillator();
    const ringGain = ctx.createGain();
    ring.type = 'sine';
    ring.frequency.setValueAtTime(196, when);
    ring.frequency.exponentialRampToValueAtTime(280, when + 0.07);
    ringGain.gain.setValueAtTime(0.032, when);
    ringGain.gain.exponentialRampToValueAtTime(0.001, when + 0.11);
    ring.connect(ringGain).connect(dest);
    ring.start(when);
    ring.stop(when + 0.12);
  }
}

function tick(ctx: AudioContext, dest: AudioNode, when: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(240, when);
  osc.frequency.exponentialRampToValueAtTime(90, when + 0.03);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(0.018, when + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.001, when + 0.04);
  osc.connect(gain).connect(dest);
  osc.start(when);
  osc.stop(when + 0.05);
}

function thud(ctx: AudioContext, dest: AudioNode, when: number, deep: boolean): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(deep ? 68 : 86, when);
  osc.frequency.exponentialRampToValueAtTime(30, when + 0.1);
  gain.gain.setValueAtTime(0.08, when);
  gain.gain.exponentialRampToValueAtTime(0.001, when + 0.12);
  osc.connect(gain).connect(dest);
  osc.start(when);
  osc.stop(when + 0.14);
}
