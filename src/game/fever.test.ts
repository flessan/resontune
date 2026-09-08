import { describe, expect, it } from 'vitest';
import { feverOnHit, feverOnMiss, feverTick } from './fever';
import { emptyFever } from './types';

describe('Fever / FLOW STATE', () => {
  it('enters Fever after a chain of Perfects, then FLOW STATE if the meter fills again', () => {
    let state = emptyFever();
    for (let i = 0; i < 14; i++) state = feverOnHit(state, 'perfect');
    expect(state.phase).toBe('fever');
    expect(state.multiplier).toBe(1.5);
    expect(state.activations).toBe(1);

    for (let i = 0; i < 14; i++) state = feverOnHit(state, 'perfect');
    expect(state.phase).toBe('flow');
    expect(state.multiplier).toBe(2);
    expect(state.peak).toBe('flow');
  });

  it('drops back to idle on a miss', () => {
    let state = emptyFever();
    for (let i = 0; i < 14; i++) state = feverOnHit(state, 'perfect');
    state = feverOnMiss(state);
    expect(state.phase).toBe('idle');
    expect(state.multiplier).toBe(1);
  });

  it('ticks Fever out on the audio clock', () => {
    const state = feverTick(
      { meter: 0.4, phase: 'fever', timeLeft: 0.01, multiplier: 1.5, activations: 1, peak: 'fever' },
      0.05,
    );
    expect(state.phase).toBe('idle');
    expect(state.activations).toBe(1);
  });
});
