import { describe, expect, it } from 'vitest';
import { laneFromCode, laneFromPointer } from './input';

describe('split-lane input', () => {
  it('maps the left cluster to the upper lane and the right cluster to the lower', () => {
    expect(laneFromCode('KeyD')).toBe(0);
    expect(laneFromCode('KeyF')).toBe(0);
    expect(laneFromCode('KeyJ')).toBe(1);
    expect(laneFromCode('KeyK')).toBe(1);
    expect(laneFromCode('Space')).toBeNull();
    expect(laneFromCode('KeyG')).toBeNull();
  });

  it('splits the stage horizontally at the mid-lane', () => {
    expect(laneFromPointer(100, 400)).toBe(0);
    expect(laneFromPointer(300, 400)).toBe(1);
  });
});
