/**
 * The account lifecycle, from the user's side.
 *
 * The interesting part of "Delete account" is not the SQL — that is covered
 * in `server/privacy.test.ts` — it is whether the person pressing the button
 * is told the truth about what happens to their ResonTune data and to their
 * Neon Auth sign-in identity, which are two different things owned by two
 * different systems.
 */
import { MemoryRouter } from 'react-router-dom';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Settings from '@/pages/Settings';
import { useAuth } from '@/stores/auth';
import { useDialogs } from '@/stores/dialogs';
import type { IdentityDeletion } from '@/lib/authClient';
import type { User } from '@/lib/types';

const apiDel = vi.fn(async () => ({ deleted: true }));
const apiGet = vi.fn(async (path: string) => (path === '/auth/me' ? { user: null } : {}));
vi.mock('@/lib/api', () => ({
  api: {
    get: (path: string) => apiGet(path),
    post: vi.fn(async () => ({})),
    patch: vi.fn(async () => ({})),
    del: (...args: unknown[]) => apiDel(...(args as [])),
  },
  ApiError: class extends Error {},
}));

let identityResult: IdentityDeletion = { status: 'unsupported', message: 'not enabled' };
const deleteIdentity = vi.fn(async () => identityResult);
const clearAccountScopedCaches = vi.fn(async () => {});
vi.mock('@/lib/authClient', () => ({
  NEON_AUTH_URL: 'https://auth.example.invalid',
  authClient: null,
  getToken: vi.fn(async () => null),
  clearToken: vi.fn(),
  deleteIdentity: () => deleteIdentity(),
  clearAccountScopedCaches: () => clearAccountScopedCaches(),
}));

vi.mock('@/player/engine', () => {
  const audio = document.createElement('audio');
  return {
    engine: {
      audio, analysisReady: false, ensureAnalysis: () => {}, onTime: () => () => {},
      readFrame: () => null, load: async () => {}, play: async () => {}, pause: () => {},
      seek: () => {}, setVolume: () => {}, setRate: () => {}, stop: () => {},
    },
  };
});

const user = {
  id: 'u-1', handle: 'rina', displayName: 'Rina', avatarUrl: null, avatarThumbUrl: null,
  bio: null, location: null, websiteUrl: null, role: 'listener', createdAt: '2026-01-01T00:00:00Z',
} as unknown as User;

const renderSettings = () => render(<MemoryRouter><Settings /></MemoryRouter>);

/** Click the labelled button and let effects flush. */
async function click(name: string) {
  const btn = screen.getByRole('button', { name });
  await act(async () => { btn.click(); });
}

beforeEach(() => {
  apiDel.mockClear();
  deleteIdentity.mockClear();
  clearAccountScopedCaches.mockClear();
  useDialogs.setState({ prompt: null, confirm: null, addToPlaylist: null });
  useAuth.setState({ user, loaded: true, available: true, favoriteIds: new Set() });
});

describe('the "Your data" section', () => {
  it('offers export, correction, history clearing and deletion — and only to a signed-in user', () => {
    renderSettings();
    expect(screen.getByRole('button', { name: 'Export' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Edit profile' }).getAttribute('href')).toBe('/profile/edit');
    expect(screen.getByRole('button', { name: 'Clear history' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete account' })).toBeTruthy();

    act(() => { useAuth.setState({ user: null }); });
    expect(screen.queryByRole('button', { name: 'Delete account' })).toBeNull();
  });

  it('never presents clearing history and deleting the account as the same thing', async () => {
    renderSettings();
    await click('Clear history');
    const req = useDialogs.getState().confirm!;
    expect(req.title).toMatch(/history/i);
    expect(req.title).not.toMatch(/account/i);
    expect(req.body).toMatch(/Playlists, favorites and public play counts are not affected/i);
    act(() => useDialogs.getState().resolveConfirm(false));
    expect(apiDel).not.toHaveBeenCalled();
  });
});

describe('deleting an account', () => {
  /** Walk the two-step confirmation, answering as the user would. */
  async function runDeletion(typed: string | null) {
    await click('Delete account');
    const confirm = useDialogs.getState().confirm!;
    await act(async () => useDialogs.getState().resolveConfirm(true));
    const prompt = useDialogs.getState().prompt!;
    await act(async () => { useDialogs.getState().resolvePrompt(typed); });
    // let the async flow settle
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    return { confirm, prompt };
  }

  it('explains both halves before anything is deleted', async () => {
    renderSettings();
    await click('Delete account');
    const { title, body, danger, confirmLabel } = useDialogs.getState().confirm!;
    expect(title).toMatch(/delete your resontune account/i);
    expect(body).toMatch(/profile, playlists, favorites, likes, listening history/i);
    expect(body).toMatch(/cannot be undone/i);
    expect(body).toMatch(/catalog pages you are credited on stay published/i);
    expect(body).toMatch(/Neon Auth/);
    expect(danger).toBe(true);
    expect(confirmLabel).toBe('Continue');
    // Nothing has happened yet.
    expect(apiDel).not.toHaveBeenCalled();
    act(() => useDialogs.getState().resolveConfirm(false));
  });

  it('asks the user to type their own username, and does nothing if they back out', async () => {
    renderSettings();
    const { prompt } = await runDeletion(null);
    expect(prompt.label).toContain('rina');
    expect(prompt.confirmLabel).toBe('Delete my account');
    expect(apiDel).not.toHaveBeenCalled();
    expect(deleteIdentity).not.toHaveBeenCalled();
  });

  it('sends what was typed to the server, which is what validates it', async () => {
    renderSettings();
    await runDeletion('rina');
    expect(apiDel).toHaveBeenCalledWith('/me', { confirm: 'rina' });
  });

  it('says the sign-in identity survived when Neon Auth cannot delete it', async () => {
    identityResult = { status: 'unsupported', message: 'not enabled' };
    renderSettings();
    await runDeletion('rina');
    expect(deleteIdentity).toHaveBeenCalled();
    const done = useDialogs.getState().confirm!;
    expect(done.acknowledge).toBe(true);
    expect(done.body).toMatch(/has NOT been deleted/);
    expect(done.body).toMatch(/still exist at Neon Auth/i);
    expect(done.body).toMatch(/new, empty ResonTune account/i);
  });

  it('says so plainly when the identity really was deleted', async () => {
    identityResult = { status: 'deleted' };
    renderSettings();
    await runDeletion('rina');
    const done = useDialogs.getState().confirm!;
    expect(done.body).toMatch(/sign-in identity was deleted as well/i);
    expect(done.body).not.toMatch(/NOT been deleted/);
  });

  it('does not call a pending email confirmation a completed deletion', async () => {
    identityResult = { status: 'verification-sent' };
    renderSettings();
    await runDeletion('rina');
    const done = useDialogs.getState().confirm!;
    expect(done.body).toMatch(/confirmation email/i);
    expect(done.body).toMatch(/still exists at Neon Auth/i);
  });

  it('signs the user out and clears account-scoped caches, not their local library', async () => {
    identityResult = { status: 'deleted' };
    renderSettings();
    await runDeletion('rina');
    expect(clearAccountScopedCaches).toHaveBeenCalled();
    expect(useAuth.getState().user).toBeNull();
    expect(useAuth.getState().favoriteIds.size).toBe(0);
    // The local library lives in IndexedDB and is never part of this flow.
    expect(apiDel).toHaveBeenCalledTimes(1);
  });
});
