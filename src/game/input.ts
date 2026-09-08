/** Lane mapping for Split mode. Classic / any-input ignores these hints. */

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
