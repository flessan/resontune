import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { SelectScreen, ResultScreen } from './screens';
import { PREVIEW_SONG, emptyCounts, type GameResult } from './types';

describe('Flow session screens', () => {
  it('opens on song select with Preview Beat and a local file picker', () => {
    render(
      <MemoryRouter>
        <SelectScreen
          local={[]}
          catalog={[]}
          error=""
          loading={false}
          onPreview={() => {}}
          onFile={() => {}}
          onLocal={() => {}}
          onCatalog={() => {}}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: /choose a song/i })).toBeTruthy();
    expect(screen.getByText(PREVIEW_SONG.title)).toBeTruthy();
    expect(screen.getByText(/open a file/i)).toBeTruthy();
  });

  it('offers retry, play again, return to Flow, and return to track', () => {
    const result: GameResult = {
      failed: false,
      song: { ...PREVIEW_SONG, kind: 'catalog', trackSlug: 'demo', title: 'Demo' },
      difficulty: 'normal',
      modifiers: [],
      speed: 1,
      score: 1200,
      accuracy: 98,
      maxCombo: 12,
      perfectChainMax: 8,
      feverPeak: 'fever',
      feverActivations: 1,
      counts: emptyCounts(),
      grade: { text: 'S', color: '#f4e4c1' },
      isRecord: true,
      best: 1200,
      practice: false,
    };
    render(
      <MemoryRouter>
        <ResultScreen result={result} onRetry={() => {}} onPrep={() => {}} onSelect={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play again' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Return to Flow' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Return to Track' }).getAttribute('href')).toBe('/track/demo');
    expect(screen.getByText('New personal best')).toBeTruthy();
  });
});
