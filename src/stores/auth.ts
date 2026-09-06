import { create } from 'zustand';
import { api } from '@/lib/api';
import type { User } from '@/lib/types';

interface AuthState {
  user: User | null;
  loaded: boolean;
  providers: { github: boolean; dev: boolean };
  favoriteIds: Set<string>;
  refresh: () => Promise<void>;
  devLogin: (handle: string) => Promise<void>;
  logout: () => Promise<void>;
  toggleFavorite: (trackId: string) => Promise<boolean>;
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  loaded: false,
  providers: { github: false, dev: true },
  favoriteIds: new Set(),

  refresh: async () => {
    try {
      const res = await api.get<{ user: User | null; providers: { github: boolean; dev: boolean } }>('/auth/me');
      set({ user: res.user, providers: res.providers, loaded: true });
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

  devLogin: async (handle) => {
    const res = await api.post<{ user: User }>('/auth/dev-login', { handle });
    set({ user: res.user });
    await get().refresh();
  },

  logout: async () => {
    await api.post('/auth/logout');
    set({ user: null, favoriteIds: new Set() });
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
