import { afterEach, describe, expect, it } from 'vitest';
import { CHART_VERSION } from './types';
import { loadBest, loadSave, saveBest, scoreKey } from './persistence';

afterEach(() => {
  localStorage.removeItem('resontune-flow');
});

describe('Flow high scores', () => {
  it('keys scores by song, difficulty, modifiers and chart version', () => {
    expect(scoreKey('preview', 'normal', [])).toBe(`preview|normal|none|v${CHART_VERSION}`);
    expect(scoreKey('preview', 'hard', ['dual', 'split'])).toBe(`preview|hard|dual+split|v${CHART_VERSION}`);
  });

  it('only replaces a best when the new score is higher', () => {
    const mods: [] = [];
    expect(loadBest('preview', 'normal', mods)).toBe(0);
    expect(saveBest('preview', 'normal', mods, { score: 1200, accuracy: 98, grade: 'S', maxCombo: 12, at: 1 })).toBe(true);
    expect(saveBest('preview', 'normal', mods, { score: 800, accuracy: 90, grade: 'A', maxCombo: 8, at: 2 })).toBe(false);
    expect(loadBest('preview', 'normal', mods)).toBe(1200);
    expect(saveBest('preview', 'normal', mods, { score: 1500, accuracy: 99, grade: 'SS', maxCombo: 20, at: 3 })).toBe(true);
    expect(loadBest('preview', 'normal', mods)).toBe(1500);
  });

  it('defaults independent music and sfx volumes', () => {
    const save = loadSave();
    expect(save.musicVolume).toBe(0.9);
    expect(save.sfxVolume).toBe(0.55);
  });
});
