import { create } from 'zustand';
import { DEFAULT_SETTINGS, type VisualizerSettings } from '@/visualizer/engine';

export type Theme = 'light' | 'dark' | 'system';

interface SettingsState {
  theme: Theme;
  visualizerMode: string;
  visualizer: VisualizerSettings;
  setTheme: (t: Theme) => void;
  setVisualizerMode: (id: string) => void;
  updateVisualizer: (patch: Partial<VisualizerSettings>) => void;
}

const KEY = 'resontune-settings';

function load(): Partial<SettingsState> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

function applyTheme(theme: Theme) {
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

const saved = load();

export const useSettings = create<SettingsState>((set, get) => ({
  theme: (saved.theme as Theme) ?? 'system',
  // Minimal Spectrum is the first-run default — calm, not flashy.
  visualizerMode: saved.visualizerMode ?? 'minimal',
  visualizer: { ...DEFAULT_SETTINGS, ...(saved.visualizer ?? {}) },

  setTheme: (theme) => {
    set({ theme });
    applyTheme(theme);
    persist(get());
  },
  setVisualizerMode: (id) => {
    set({ visualizerMode: id });
    persist(get());
  },
  updateVisualizer: (patch) => {
    set({ visualizer: { ...get().visualizer, ...patch } });
    persist(get());
  },
}));

function persist(s: SettingsState) {
  localStorage.setItem(
    KEY,
    JSON.stringify({ theme: s.theme, visualizerMode: s.visualizerMode, visualizer: s.visualizer }),
  );
}

applyTheme(useSettings.getState().theme);
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (useSettings.getState().theme === 'system') applyTheme('system');
});
