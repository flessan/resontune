/**
 * Short 808/kick percussion, triggered at judgement time against the
 * game AudioContext clock — not a render-frame callback.
 *
 * Hierarchy: THUMP body first, tiny transient second. Never a beep.
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
  const perfect = kind === 'perfect' || kind === 'fever';
  const pitch = perfect ? 1 : kind === 'great' ? 0.96 : kind === 'chord' ? 0.88 : kind === 'hold' ? 0.8 : 0.9;
  const body = kind === 'fever' ? 1.06 : perfect ? 1 : kind === 'clear' ? 0.9 : kind === 'chord' ? 1.04 : kind === 'hold' ? 0.86 : 0.7;
  const thump = (fuller ? 0.22 : 0.18) * body;

  const osc = ctx.createOscillator();
  const bodyGain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(72 * pitch, when);
  osc.frequency.exponentialRampToValueAtTime(38 * pitch, when + 0.08);
  bodyGain.gain.setValueAtTime(0.0001, when);
  bodyGain.gain.exponentialRampToValueAtTime(thump, when + 0.004);
  bodyGain.gain.exponentialRampToValueAtTime(0.001, when + 0.1);
  osc.connect(bodyGain).connect(dest);
  osc.start(when);
  osc.stop(when + 0.12);

  const sub = ctx.createOscillator();
  const subGain = ctx.createGain();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(kind === 'chord' ? 48 : 52, when);
  subGain.gain.setValueAtTime(0.0001, when);
  const subAmt = perfect || kind === 'chord' || fuller ? (fuller ? 0.08 : 0.062) : 0.028;
  subGain.gain.exponentialRampToValueAtTime(subAmt, when + 0.006);
  subGain.gain.exponentialRampToValueAtTime(0.001, when + 0.1);
  sub.connect(subGain).connect(dest);
  sub.start(when);
  sub.stop(when + 0.11);

  const click = ctx.createOscillator();
  const clickGain = ctx.createGain();
  click.type = 'sine';
  click.frequency.setValueAtTime(perfect ? 240 : kind === 'chord' ? 210 : 190, when);
  click.frequency.exponentialRampToValueAtTime(90, when + 0.012);
  clickGain.gain.setValueAtTime(0.0001, when);
  const clickAmt = perfect ? 0.042 : kind === 'chord' ? 0.036 : kind === 'hold' ? 0.016 : 0.024;
  clickGain.gain.exponentialRampToValueAtTime((fuller ? 1.12 : 1) * clickAmt, when + 0.0012);
  clickGain.gain.exponentialRampToValueAtTime(0.001, when + 0.018);
  click.connect(clickGain).connect(dest);
  click.start(when);
  click.stop(when + 0.022);

  if (perfect) {
    const snap = ctx.createOscillator();
    const snapGain = ctx.createGain();
    snap.type = 'triangle';
    snap.frequency.setValueAtTime(420, when);
    snap.frequency.exponentialRampToValueAtTime(140, when + 0.008);
    snapGain.gain.setValueAtTime(0.0001, when);
    snapGain.gain.exponentialRampToValueAtTime(0.02, when + 0.001);
    snapGain.gain.exponentialRampToValueAtTime(0.001, when + 0.012);
    snap.connect(snapGain).connect(dest);
    snap.start(when);
    snap.stop(when + 0.016);
  }

  if (kind === 'clear') {
    const ring = ctx.createOscillator();
    const ringGain = ctx.createGain();
    ring.type = 'sine';
    ring.frequency.setValueAtTime(196, when);
    ring.frequency.exponentialRampToValueAtTime(260, when + 0.06);
    ringGain.gain.setValueAtTime(0.028, when);
    ringGain.gain.exponentialRampToValueAtTime(0.001, when + 0.1);
    ring.connect(ringGain).connect(dest);
    ring.start(when);
    ring.stop(when + 0.11);
  }
}

function tick(ctx: AudioContext, dest: AudioNode, when: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(160, when);
  osc.frequency.exponentialRampToValueAtTime(70, when + 0.028);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(0.012, when + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.001, when + 0.036);
  osc.connect(gain).connect(dest);
  osc.start(when);
  osc.stop(when + 0.04);
}

function thud(ctx: AudioContext, dest: AudioNode, when: number, deep: boolean): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(deep ? 64 : 78, when);
  osc.frequency.exponentialRampToValueAtTime(28, when + 0.08);
  gain.gain.setValueAtTime(deep ? 0.045 : 0.028, when);
  gain.gain.exponentialRampToValueAtTime(0.001, when + 0.1);
  osc.connect(gain).connect(dest);
  osc.start(when);
  osc.stop(when + 0.12);
}
