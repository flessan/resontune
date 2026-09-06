/** jsdom gaps a real browser provides, plus per-test DOM cleanup. */
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// React 19 wants to know it is running inside a test renderer.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => cleanup());

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}
Element.prototype.scrollTo ??= () => {};
Element.prototype.scrollIntoView ??= () => {};
window.scrollTo = () => {};
if (!('IntersectionObserver' in window)) {
  (window as any).IntersectionObserver = class {
    observe() {} unobserve() {} disconnect() {}
  };
}
if (!navigator.clipboard) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn(async () => {}) },
    configurable: true,
  });
}
