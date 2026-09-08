/**
 * Local high scores and Flow preferences. Stored in this browser only —
 * same privacy posture as the local library.
 */
import type { DifficultyId, ModifierId } from './types';
import { modifierKey } from './types';

const KEY = 'resontune-flow';

export interface FlowPrefs {
  volume: number;
  offset: number;
  difficulty: DifficultyId;
  modifiers: ModifierId[];
}

export interface FlowScore {
  score: number;
  accuracy: number;
  grade: string;
  maxCombo: number;
  at: number;
}

interface Store {
  prefs: FlowPrefs;
  scores: Record<string, FlowScore>;
}

const DEFAULT_PREFS: FlowPrefs = {
  volume: 0.7,
  offset: 0,
  difficulty: 'normal',
  modifiers: [],
};

function load(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { prefs: { ...DEFAULT_PREFS }, scores: {} };
    const parsed = JSON.parse(raw) as Partial<Store>;
    return {
      prefs: { ...DEFAULT_PREFS, ...(parsed.prefs ?? {}) },
      scores: parsed.scores ?? {},
    };
  } catch {
    return { prefs: { ...DEFAULT_PREFS }, scores: {} };
  }
}

function save(store: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* quota / private mode */
  }
}

export function loadPrefs(): FlowPrefs {
  return load().prefs;
}

export function savePrefs(prefs: FlowPrefs): void {
  const store = load();
  store.prefs = prefs;
  save(store);
}

export function scoreKey(songKey: string, difficulty: DifficultyId, modifiers: Iterable<ModifierId>): string {
  return `${songKey}|${difficulty}|${modifierKey(modifiers)}`;
}

export function loadBest(songKey: string, difficulty: DifficultyId, modifiers: Iterable<ModifierId>): number {
  const row = load().scores[scoreKey(songKey, difficulty, modifiers)];
  return row?.score ?? 0;
}

export function saveBest(
  songKey: string,
  difficulty: DifficultyId,
  modifiers: Iterable<ModifierId>,
  entry: FlowScore,
): boolean {
  const store = load();
  const key = scoreKey(songKey, difficulty, modifiers);
  const prev = store.scores[key]?.score ?? 0;
  if (entry.score <= prev) return false;
  store.scores[key] = entry;
  save(store);
  return true;
}
