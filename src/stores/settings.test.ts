/**
 * Theme + visualizer preference persistence. The store module applies the
 * theme at import time and reads localStorage once, so each scenario
 * seeds storage, resets modules, and imports a fresh copy.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const KEY = 'resontune-settings';

async function freshStore() {
  vi.resetModules();
  const mod = await import('./settings');
  return mod.useSettings;
}

function stored(): Record<string, unknown> {
  return JSON.parse(localStorage.getItem(KEY) ?? '{}');
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('style');
  delete document.documentElement.dataset.customTheme;
  delete document.documentElement.dataset.theme;
});

describe('theme persistence', () => {
  it('defaults to the dark ResonTune identity with the visualizer on', async () => {
    const useSettings = await freshStore();
    const s = useSettings.getState();
    expect(s.theme).toBe('dark');
    expect(s.visualizerEnabled).toBe(true);
    expect(s.visualizerMode).toBe('bars');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.dataset.customTheme).toBeUndefined();
  });

  it('persists and reloads the selected theme and custom palette', async () => {
    let useSettings = await freshStore();
    useSettings.getState().setTheme('custom');
    useSettings.getState().setCustomColor('primary', '#c0392b');
    useSettings.getState().setCustomColor('background', '#26221f');

    useSettings = await freshStore();
    const s = useSettings.getState();
    expect(s.theme).toBe('custom');
    expect(s.customPalette.primary).toBe('#c0392b');
    expect(s.customPalette.background).toBe('#26221f');
    expect(document.documentElement.dataset.customTheme).toBe('1');
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe('#c0392b');
  });

  it('applies custom tokens live and removes them when switching back', async () => {
    const useSettings = await freshStore();
    useSettings.getState().setTheme('custom');
    expect(document.documentElement.style.getPropertyValue('--primary')).toBeTruthy();
    useSettings.getState().setTheme('dark');
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe('');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('rejects an invalid color without losing the previous one', async () => {
    const useSettings = await freshStore();
    useSettings.getState().setTheme('custom');
    useSettings.getState().setCustomColor('primary', '#c0392b');
    useSettings.getState().setCustomColor('primary', 'javascript:alert(1)');
    expect(useSettings.getState().customPalette.primary).toBe('#c0392b');
  });

  it('falls back to defaults when storage is corrupt', async () => {
    localStorage.setItem(KEY, '{not json');
    const useSettings = await freshStore();
    expect(useSettings.getState().theme).toBe('dark');
    expect(useSettings.getState().customPalette.primary).toBeTruthy();
  });

  it('falls back per-field when the stored palette is partial garbage', async () => {
    localStorage.setItem(KEY, JSON.stringify({
      theme: 'custom',
      customPalette: { background: '#101010', primary: 'chartreuse', text: 7 },
    }));
    const useSettings = await freshStore();
    const p = useSettings.getState().customPalette;
    expect(p.background).toBe('#101010');
    expect(p.primary).toBe('#ffb693'); // default primary
    expect(p.text).toBe('#ece5e1');    // default text
    // and the app still themed itself without throwing
    expect(document.documentElement.dataset.customTheme).toBe('1');
  });

  it('ignores an unknown stored theme name', async () => {
    localStorage.setItem(KEY, JSON.stringify({ theme: 'neon-rainbow' }));
    const useSettings = await freshStore();
    expect(useSettings.getState().theme).toBe('dark');
  });

  it('loading a preset switches to it and persists the palette', async () => {
    const useSettings = await freshStore();
    useSettings.getState().applyPreset('ember');
    expect(useSettings.getState().theme).toBe('custom');
    expect(useSettings.getState().customPalette.primary).toBe('#d96c4f');
    expect((stored().customPalette as Record<string, string>).primary).toBe('#d96c4f');
    useSettings.getState().applyPreset('does-not-exist'); // must be a no-op
    expect(useSettings.getState().customPalette.primary).toBe('#d96c4f');
  });
});

describe('visualizer preference persistence', () => {
  it('persists style selection and the enabled switch', async () => {
    let useSettings = await freshStore();
    useSettings.getState().setVisualizerMode('corona');
    useSettings.getState().setVisualizerEnabled(false);

    useSettings = await freshStore();
    expect(useSettings.getState().visualizerMode).toBe('corona');
    expect(useSettings.getState().visualizerEnabled).toBe(false);
  });

  it('maps legacy stored style ids onto the current set', async () => {
    localStorage.setItem(KEY, JSON.stringify({ visualizerMode: 'procedural' }));
    const useSettings = await freshStore();
    expect(useSettings.getState().visualizerMode).toBe('hyperspace');
  });

  it('sanitizes a persisted "waterfall" selection to a safe fallback', async () => {
    localStorage.setItem(KEY, JSON.stringify({ visualizerMode: 'waterfall' }));
    const useSettings = await freshStore();
    expect(useSettings.getState().visualizerMode).toBe('bars');
    // and selecting it again through the API can never bring it back
    useSettings.getState().setVisualizerMode('waterfall');
    expect(useSettings.getState().visualizerMode).toBe('bars');
  });

  it('treats the legacy "off" style as the disabled switch', async () => {
    localStorage.setItem(KEY, JSON.stringify({ visualizerMode: 'off' }));
    const useSettings = await freshStore();
    expect(useSettings.getState().visualizerEnabled).toBe(false);
    expect(useSettings.getState().visualizerMode).toBe('bars');
  });

  it('an unknown style id cannot break the player', async () => {
    localStorage.setItem(KEY, JSON.stringify({ visualizerMode: '<script>' }));
    const useSettings = await freshStore();
    expect(useSettings.getState().visualizerMode).toBe('bars');
    useSettings.getState().setVisualizerMode('made-up-style');
    expect(useSettings.getState().visualizerMode).toBe('bars');
  });
});
