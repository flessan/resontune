import { describe, expect, it } from 'vitest';
import { InputAggregator, keyboardInput, pointerInput } from './input';

describe('unified input aggregator', () => {
  it('keeps keyboard and pointer identities independently active', () => {
    const events: string[] = [];
    const input = new InputAggregator((e) => events.push(`${e.id}:${e.phase}`));
    input.send(keyboardInput('KeyA', 'down', 1, 0));
    input.send(pointerInput(1, 'down', 1.1, 1));
    input.send(pointerInput(1, 'up', 1.2, null));
    expect([...input.active.keys()]).toEqual(['keyboard:KeyA']);
    expect(events).toEqual(['keyboard:KeyA:down', 'pointer:1:down', 'pointer:1:up']);
  });

  it('ignores key repeat but allows independent releases and cleanup', () => {
    const received: string[] = [];
    const input = new InputAggregator((e) => received.push(e.id));
    input.send(keyboardInput('KeyA', 'down', 1, null));
    input.send(keyboardInput('KeyA', 'down', 1.01, null));
    input.send(keyboardInput('KeyD', 'down', 1.02, null));
    input.send(keyboardInput('KeyD', 'up', 1.1, null));
    expect(received).toEqual(['keyboard:KeyA', 'keyboard:KeyD', 'keyboard:KeyD']);
    input.clear(1.2);
    expect(input.active.size).toBe(0);
    expect(received.at(-1)).toBe('keyboard:KeyA');
  });
});
