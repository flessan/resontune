import { create } from 'zustand';
import {
  DEFAULT_SETTINGS,
  LEVEL_PRESETS,
  resolveModeId,
  type VizLevel,
  type VisualizerSettings,
} from '@/visualizer/engine';

export type Theme = 'light' | 'dark' | 'system';

interface SettingsState {
  theme: Theme;
  visualizerMode: string;
  visualizerLevel: VizLevel;
  visualizer: VisualizerSettings;
  setTheme: (t: Theme) => void;
  setVisualizerMode: (id: string) => void;
  setVisualizerLevel: (level: VizLevel) => void;
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
const savedLevel = (saved.visualizerLevel as VizLevel) ?? 'ambient';
const levelPatch = LEVEL_PRESETS[savedLevel] ?? LEVEL_PRESETS.ambient;

export const useSettings = create<SettingsState>((set, get) => ({
  // Dark-first: ResonTune's primary experience is the dark theme.
  // Light and System remain first-class options in Settings.
  theme: (saved.theme as Theme) ?? 'dark',
  visualizerMode: resolveModeId(saved.visualizerMode ?? 'bars'),
  visualizerLevel: savedLevel,
  visualizer: { ...DEFAULT_SETTINGS, ...levelPatch, ...(saved.visualizer ?? {}) },

  setTheme: (theme) => {
    set({ theme });
    applyTheme(theme);
    persist(get());
  },
  setVisualizerMode: (id) => {
    set({ visualizerMode: resolveModeId(id) });
    persist(get());
  },
  setVisualizerLevel: (level) => {
    set({
      visualizerLevel: level,
      visualizer: { ...get().visualizer, ...LEVEL_PRESETS[level] },
    });
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
    JSON.stringify({
      theme: s.theme,
      visualizerMode: s.visualizerMode,
      visualizerLevel: s.visualizerLevel,
      visualizer: s.visualizer,
    }),
  );
}

applyTheme(useSettings.getState().theme);
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (useSettings.getState().theme === 'system') applyTheme('system');
});
