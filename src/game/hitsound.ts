/**
 * Short 808/kick percussion, triggered at judgement time against the
 * game AudioContext clock — not a render-frame callback.
 */
export type KickKind = 'perfect' | 'great' | 'good' | 'miss' | 'clear' | 'drop' | 'chord' | 'fever';

export function playKick(
  ctx: AudioContext,
  dest: AudioNode,
  kind: KickKind,
  when = ctx.currentTime,
): void {
  if (kind === 'miss' || kind === 'drop') {
    thud(ctx, dest, when, kind === 'drop');
    return;
  }

  const pitch = kind === 'perfect' || kind === 'fever' ? 1.08 : kind === 'great' ? 1 : kind === 'chord' ? 0.92 : 0.86;
  const body = kind === 'fever' ? 1.15 : kind === 'perfect' ? 1 : kind === 'clear' ? 0.9 : 0.75;
  const click = kind === 'perfect' || kind === 'fever' || kind === 'chord' ? 1 : 0.55;

  // Body: decaying sine, 90Hz → 38Hz.
  const osc = ctx.createOscillator();
  const bodyGain = ctx.createGain();
  osc.type = 'sine';
  const f0 = 92 * pitch;
  osc.frequency.setValueAtTime(f0, when);
  osc.frequency.exponentialRampToValueAtTime(36 * pitch, when + 0.11);
  bodyGain.gain.setValueAtTime(0.0001, when);
  bodyGain.gain.exponentialRampToValueAtTime(0.22 * body, when + 0.006);
  bodyGain.gain.exponentialRampToValueAtTime(0.001, when + 0.14);
  osc.connect(bodyGain).connect(dest);
  osc.start(when);
  osc.stop(when + 0.16);

  // Transient click — the "strike".
  const clickOsc = ctx.createOscillator();
  const clickGain = ctx.createGain();
  clickOsc.type = 'triangle';
  clickOsc.frequency.setValueAtTime(kind === 'chord' ? 420 : 1800, when);
  clickOsc.frequency.exponentialRampToValueAtTime(220, when + 0.018);
  clickGain.gain.setValueAtTime(0.0001, when);
  clickGain.gain.exponentialRampToValueAtTime(0.07 * click, when + 0.002);
  clickGain.gain.exponentialRampToValueAtTime(0.001, when + 0.028);
  clickOsc.connect(clickGain).connect(dest);
  clickOsc.start(when);
  clickOsc.stop(when + 0.04);

  if (kind === 'perfect' || kind === 'fever') {
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(58, when);
    subGain.gain.setValueAtTime(0.0001, when);
    subGain.gain.exponentialRampToValueAtTime(0.09, when + 0.008);
    subGain.gain.exponentialRampToValueAtTime(0.001, when + 0.12);
    sub.connect(subGain).connect(dest);
    sub.start(when);
    sub.stop(when + 0.14);
  }

  if (kind === 'clear') {
    const ring = ctx.createOscillator();
    const ringGain = ctx.createGain();
    ring.type = 'sine';
    ring.frequency.setValueAtTime(220, when);
    ring.frequency.exponentialRampToValueAtTime(330, when + 0.08);
    ringGain.gain.setValueAtTime(0.05, when);
    ringGain.gain.exponentialRampToValueAtTime(0.001, when + 0.12);
    ring.connect(ringGain).connect(dest);
    ring.start(when);
    ring.stop(when + 0.14);
  }
}

function thud(ctx: AudioContext, dest: AudioNode, when: number, deep: boolean): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(deep ? 70 : 90, when);
  osc.frequency.exponentialRampToValueAtTime(32, when + 0.12);
  gain.gain.setValueAtTime(0.12, when);
  gain.gain.exponentialRampToValueAtTime(0.001, when + 0.14);
  osc.connect(gain).connect(dest);
  osc.start(when);
  osc.stop(when + 0.16);
}
