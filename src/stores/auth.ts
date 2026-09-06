/**
 * Auth state. Neon Auth owns authentication (who you are); the ResonTune
 * API owns authorization (what you may do). `refresh()` asks the API who
 * the current verified token belongs to — the API's answer (including the
 * server-side role) is the only identity the app trusts.
 */
import { create } from 'zustand';
import { api } from '@/lib/api';
import { authClient, clearToken, NEON_AUTH_URL } from '@/lib/authClient';
import type { User } from '@/lib/types';

interface AuthState {
  user: User | null;
  loaded: boolean;
  /** Whether Neon Auth is configured for this deployment. */
  available: boolean;
  favoriteIds: Set<string>;
  refresh: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  toggleFavorite: (trackId: string) => Promise<boolean>;
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  loaded: false,
  available: Boolean(NEON_AUTH_URL),
  favoriteIds: new Set(),

  refresh: async () => {
    try {
      const res = await api.get<{ user: User | null }>('/auth/me');
      set({ user: res.user, loaded: true });
      if (res.user) {
        const favs = await api.get<{ ids: string[] }>('/me/favorites/ids');
        set({ favoriteIds: new Set(favs.ids) });
      } else {
        set({ favoriteIds: new Set() });
      }
    } catch {
      set({ loaded: true });
    }
  },

  signIn: async (email, password) => {
    if (!authClient) throw new Error('Sign-in is not configured on this deployment.');
    const res = await authClient.signIn.email({ email, password });
    if (res.error) throw new Error(res.error.message ?? 'Sign in failed.');
    clearToken();
    await get().refresh();
  },

  signUp: async (name, email, password) => {
    if (!authClient) throw new Error('Sign-in is not configured on this deployment.');
    const res = await authClient.signUp.email({ name, email, password });
    if (res.error) throw new Error(res.error.message ?? 'Sign up failed.');
    clearToken();
    await get().refresh();
  },

  logout: async () => {
    try {
      await authClient?.signOut();
    } finally {
      clearToken();
      set({ user: null, favoriteIds: new Set() });
    }
  },

  toggleFavorite: async (trackId) => {
    const res = await api.post<{ favorited: boolean }>(`/me/favorites/${trackId}`);
    const next = new Set(get().favoriteIds);
    if (res.favorited) next.add(trackId);
    else next.delete(trackId);
    set({ favoriteIds: next });
    return res.favorited;
  },
}));
