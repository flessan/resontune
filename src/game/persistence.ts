import type { DifficultyId, GameResult, Grade, HitCounts, ModifierId, SongRef } from './types';
import { CHART_VERSION, emptyCounts, modifierKey } from './types';
import { gradeFor } from './scoring';

const KEY = 'resontune-flow';

export interface SavedBest {
  score: number;
  accuracy: number;
  grade: string;
  maxCombo: number;
  perfectChain: number;
  feverPeak: string;
  at: number;
  chartVersion: number;
}

export interface FlowSave {
  best: Record<string, SavedBest>;
  offsetMs: number;
  lastDifficulty: DifficultyId;
  lastModifiers: ModifierId[];
  lastSpeed: number;
}

const empty: FlowSave = {
  best: {},
  offsetMs: 0,
  lastDifficulty: 'normal',
  lastModifiers: [],
  lastSpeed: 1,
};

export function loadSave(): FlowSave {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...empty, best: {} };
    const parsed = JSON.parse(raw) as Partial<FlowSave>;
    return {
      best: parsed.best ?? {},
      offsetMs: typeof parsed.offsetMs === 'number' ? parsed.offsetMs : 0,
      lastDifficulty: parsed.lastDifficulty ?? 'normal',
      lastModifiers: parsed.lastModifiers ?? [],
      lastSpeed: typeof parsed.lastSpeed === 'number' ? parsed.lastSpeed : 1,
    };
  } catch {
    return { ...empty, best: {} };
  }
}

export function writeSave(save: FlowSave): void {
  localStorage.setItem(KEY, JSON.stringify(save));
}

export function scoreKey(
  songKey: string,
  difficulty: DifficultyId,
  modifiers: Iterable<ModifierId>,
  chartVersion = CHART_VERSION,
): string {
  return `${songKey}|${difficulty}|${modifierKey(modifiers)}|v${chartVersion}`;
}

export function readBest(save: FlowSave, key: string): SavedBest | null {
  return save.best[key] ?? null;
}

export function loadBest(songKey: string, difficulty: DifficultyId, modifiers: Iterable<ModifierId>): number {
  return readBest(loadSave(), scoreKey(songKey, difficulty, modifiers))?.score ?? 0;
}

export function saveBest(
  songKey: string,
  difficulty: DifficultyId,
  modifiers: Iterable<ModifierId>,
  entry: { score: number; accuracy: number; grade: string; maxCombo: number; at: number; perfectChain?: number; feverPeak?: string },
): boolean {
  const save = loadSave();
  const key = scoreKey(songKey, difficulty, modifiers);
  const fake = resultFromRun({
    failed: false,
    song: { key: songKey, title: songKey, artist: '', kind: 'preview' },
    difficulty,
    modifiers: [...modifiers],
    speed: 1,
    score: entry.score,
    accuracy: entry.accuracy,
    maxCombo: entry.maxCombo,
    perfectChainMax: entry.perfectChain ?? 0,
    feverPeak: (entry.feverPeak as GameResult['feverPeak']) || 'idle',
    feverActivations: 0,
    counts: emptyCounts(),
    practice: false,
    isRecord: false,
    best: 0,
  });
  const next = recordBest(save, key, fake);
  if (next.isRecord) writeSave(next.save);
  return next.isRecord;
}

export function recordBest(save: FlowSave, key: string, result: GameResult): { save: FlowSave; isRecord: boolean } {
  const prev = save.best[key];
  const isRecord = !prev || result.score > prev.score;
  if (!isRecord) return { save, isRecord: false };
  return {
    isRecord: true,
    save: {
      ...save,
      best: {
        ...save.best,
        [key]: {
          score: result.score,
          accuracy: result.accuracy,
          grade: result.grade.text,
          maxCombo: result.maxCombo,
          perfectChain: result.perfectChainMax,
          feverPeak: result.feverPeak,
          at: Date.now(),
          chartVersion: CHART_VERSION,
        },
      },
    },
  };
}

export function bestLine(best: SavedBest | null): { score: number; grade: string } {
  if (!best) return { score: 0, grade: '—' };
  return { score: best.score, grade: best.grade };
}

export function resultFromRun(args: {
  failed: boolean;
  song: SongRef;
  difficulty: DifficultyId;
  modifiers: ModifierId[];
  speed: number;
  score: number;
  accuracy: number;
  maxCombo: number;
  perfectChainMax: number;
  feverPeak: GameResult['feverPeak'];
  feverActivations: number;
  counts: HitCounts;
  practice: boolean;
  isRecord: boolean;
  best: number;
}): GameResult {
  return {
    ...args,
    grade: gradeFor(args.accuracy, args.failed),
    counts: { ...args.counts },
  };
}

export { emptyCounts, gradeFor };
export type { Grade };
