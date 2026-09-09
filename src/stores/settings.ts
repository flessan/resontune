import { create } from 'zustand';
import {
  DEFAULT_SETTINGS,
  LEVEL_PRESETS,
  resolveModeIdSafe,
  type VizLevel,
  type VisualizerSettings,
} from '@/visualizer/engine';
import {
  DEFAULT_PALETTE,
  applyCustomTheme,
  clearCustomTheme,
  findPreset,
  sanitizePalette,
  type PaletteKey,
  type ResonPalette,
} from '@/theme/theme';

/**
 * 'custom' is a first-class theme: the user's six-color palette drives the
 * whole design system (and the visualizer's color language) through the
 * tokens derived in @/theme/theme.
 */
export type Theme = 'light' | 'dark' | 'system' | 'custom';

const THEMES: Theme[] = ['light', 'dark', 'system', 'custom'];

interface SettingsState {
  theme: Theme;
  /** The user's palette. Kept even while a built-in theme is active. */
  customPalette: ResonPalette;
  visualizerMode: string;
  /** One honest switch instead of a panel of engine knobs. */
  visualizerEnabled: boolean;
  visualizerLevel: VizLevel;
  visualizer: VisualizerSettings;
  setTheme: (t: Theme) => void;
  setCustomColor: (key: PaletteKey, value: string) => void;
  setCustomPalette: (p: ResonPalette) => void;
  /** Load a preset into the custom palette and switch to it. */
  applyPreset: (id: string) => void;
  setVisualizerMode: (id: string) => void;
  setVisualizerEnabled: (on: boolean) => void;
  setVisualizerLevel: (level: VizLevel) => void;
  updateVisualizer: (patch: Partial<VisualizerSettings>) => void;
}

const KEY = 'resontune-settings';

function load(): Partial<SettingsState> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Partial<SettingsState>) : {};
  } catch {
    return {};
  }
}

function applyTheme(theme: Theme, palette: ResonPalette) {
  if (theme === 'custom') {
    applyCustomTheme(palette);
    return;
  }
  clearCustomTheme();
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

const saved = load();
const savedLevel = (saved.visualizerLevel as VizLevel) ?? 'ambient';
const levelPatch = LEVEL_PRESETS[savedLevel] ?? LEVEL_PRESETS.ambient;
// Dark-first: ResonTune's primary experience is the dark theme. Anything
// unexpected in storage falls back to it rather than breaking the shell.
const savedTheme: Theme = THEMES.includes(saved.theme as Theme) ? (saved.theme as Theme) : 'dark';
// An older build stored "off" as a style; that is the enabled switch now.
const savedModeRaw = typeof saved.visualizerMode === 'string' ? saved.visualizerMode : 'bars';
const savedEnabled =
  typeof saved.visualizerEnabled === 'boolean' ? saved.visualizerEnabled : savedModeRaw !== 'off';
const savedMode = resolveModeIdSafe(savedModeRaw);

export const useSettings = create<SettingsState>((set, get) => ({
  theme: savedTheme,
  customPalette: sanitizePalette(saved.customPalette),
  visualizerMode: savedMode,
  visualizerEnabled: savedEnabled,
  visualizerLevel: savedLevel,
  visualizer: { ...DEFAULT_SETTINGS, ...levelPatch, ...(saved.visualizer ?? {}) },

  setTheme: (theme) => {
    set({ theme });
    applyTheme(theme, get().customPalette);
    persist(get());
  },
  setCustomColor: (key, value) => {
    const customPalette = sanitizePalette({ ...get().customPalette, [key]: value }, get().customPalette);
    set({ customPalette });
    if (get().theme === 'custom') applyTheme('custom', customPalette);
    persist(get());
  },
  setCustomPalette: (p) => {
    const customPalette = sanitizePalette(p, get().customPalette);
    set({ customPalette });
    if (get().theme === 'custom') applyTheme('custom', customPalette);
    persist(get());
  },
  applyPreset: (id) => {
    const preset = findPreset(id);
    if (!preset) return;
    const customPalette = sanitizePalette(preset.palette);
    set({ customPalette, theme: 'custom' });
    applyTheme('custom', customPalette);
    persist(get());
  },
  setVisualizerMode: (id) => {
    set({ visualizerMode: resolveModeIdSafe(id) });
    persist(get());
  },
  setVisualizerEnabled: (on) => {
    set({ visualizerEnabled: on });
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
      customPalette: s.customPalette,
      visualizerMode: s.visualizerMode,
      visualizerEnabled: s.visualizerEnabled,
      visualizerLevel: s.visualizerLevel,
      visualizer: s.visualizer,
    }),
  );
}

applyTheme(useSettings.getState().theme, useSettings.getState().customPalette);
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  const s = useSettings.getState();
  if (s.theme === 'system') applyTheme('system', s.customPalette);
});
