/** Unified physical-input boundary for FLOW. DOM adapters emit these events;
 * the engine only receives stable identities and the audio-clock timestamp. */
import type { FlowEngine } from './engine';

export type InputSource = 'keyboard' | 'pointer';
export type InputPhase = 'down' | 'up';

export interface FlowInputEvent {
  id: string;
  source: InputSource;
  phase: InputPhase;
  timestamp: number;
  lane: 0 | 1 | null;
}

export class InputAggregator {
  readonly active = new Map<string, FlowInputEvent>();
  constructor(private readonly dispatch: (event: FlowInputEvent) => void) {}

  send(event: FlowInputEvent): void {
    if (event.phase === 'down') {
      if (this.active.has(event.id)) return; // browser key repeat / duplicate pointerdown
      this.active.set(event.id, event);
    } else {
      this.active.delete(event.id);
    }
    this.dispatch(event);
  }

  clear(timestamp: number): void {
    for (const input of [...this.active.values()]) {
      this.send({ ...input, phase: 'up', timestamp });
    }
  }

  reset(): void { this.active.clear(); }
}

export function keyboardInput(code: string, phase: InputPhase, timestamp: number, lane: 0 | 1 | null): FlowInputEvent {
  return { id: `keyboard:${code}`, source: 'keyboard', phase, timestamp, lane };
}

export function pointerInput(pointerId: number, phase: InputPhase, timestamp: number, lane: 0 | 1 | null): FlowInputEvent {
  return { id: `pointer:${pointerId}`, source: 'pointer', phase, timestamp, lane };
}

export function bindEngineInput(engine: FlowEngine): InputAggregator {
  return new InputAggregator((event) => engine.input(event));
}

/** Lane adapters stay pure; keyboard and pointer still share the same event path. */
const UPPER = /^(KeyA|KeyS|KeyD|KeyF|KeyQ|KeyW|KeyE|KeyR|Digit1|Digit2|Digit3|Digit4)$/;
const LOWER = /^(KeyJ|KeyK|KeyL|KeyU|KeyI|KeyO|KeyP|Digit7|Digit8|Digit9|Digit0|Semicolon)$/;
export function laneFromCode(code: string): 0 | 1 | null {
  if (UPPER.test(code)) return 0;
  if (LOWER.test(code)) return 1;
  return null;
}
export function laneFromPointer(y: number, height: number): 0 | 1 {
  return y < height * 0.54 ? 0 : 1;
}
