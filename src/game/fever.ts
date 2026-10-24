/**
 * Fever / FLOW STATE — performance meter driven by the audio-clocked
 * judgement stream, not by the renderer.
 */
import type { FeverState, HitKind } from './types';
import { emptyFever } from './types';

const FILL: Record<HitKind, number> = {
  perfect: 0.085,
  great: 0.05,
  good: 0.02,
  miss: 0,
  drop: 0,
};

const FEVER_DURATION = 8;
const FLOW_DURATION = 10;
const IDLE_DECAY = 0.035;

export function feverOnHit(state: FeverState, kind: HitKind): FeverState {
  const next = { ...state };
  next.meter = Math.min(1, next.meter + FILL[kind]);

  if (next.phase === 'idle' && next.meter >= 1) {
    next.phase = 'fever';
    next.timeLeft = FEVER_DURATION;
    next.multiplier = 1.5;
    next.activations += 1;
    next.meter = 0.35;
    next.peak = 'fever';
  } else if (next.phase === 'fever' && next.meter >= 1) {
    next.phase = 'flow';
    next.timeLeft = FLOW_DURATION;
    next.multiplier = 2;
    next.meter = 1;
    next.peak = 'flow';
  } else if (next.phase === 'fever' || next.phase === 'flow') {
    next.timeLeft = Math.min(next.timeLeft + (kind === 'perfect' ? 0.35 : 0.15), next.phase === 'flow' ? FLOW_DURATION : FEVER_DURATION);
  }

  return next;
}

export function feverOnMiss(state: FeverState): FeverState {
  return {
    ...state,
    meter: Math.max(0, state.meter * 0.25 - 0.15),
    phase: 'idle',
    timeLeft: 0,
    multiplier: 1,
  };
}

export function feverTick(state: FeverState, dt: number): FeverState {
  if (state.phase === 'idle') {
    if (state.meter <= 0) return state;
    return { ...state, meter: Math.max(0, state.meter - IDLE_DECAY * dt) };
  }
  const timeLeft = state.timeLeft - dt;
  if (timeLeft > 0) return { ...state, timeLeft };
  if (state.phase === 'flow') {
    return { ...state, phase: 'fever', timeLeft: FEVER_DURATION * 0.4, multiplier: 1.5, meter: 0.4 };
  }
  return { ...emptyFever(), activations: state.activations, peak: state.peak };
}
