/**
 * App-level dialogs that any action can raise.
 *
 * Contextual actions run far from the component that rendered them, so the
 * few flows that need a dialog (add to playlist, rename, confirm a delete)
 * ask for one here and await the answer. `DialogHost` renders them once,
 * near the root.
 */
import { create } from 'zustand';

export interface PromptRequest {
  title: string;
  label?: string;
  value?: string;
  placeholder?: string;
  confirmLabel?: string;
}

export interface ConfirmRequest {
  title: string;
  body?: string;
  confirmLabel?: string;
  danger?: boolean;
}

interface DialogState {
  /** Tracks to add to a playlist (one for a track, many for a release). */
  addToPlaylist: { trackIds: string[]; label: string } | null;
  prompt: (PromptRequest & { resolve: (value: string | null) => void }) | null;
  confirm: (ConfirmRequest & { resolve: (ok: boolean) => void }) | null;

  openAddToPlaylist: (trackIds: string[], label: string) => void;
  closeAddToPlaylist: () => void;
  askPrompt: (req: PromptRequest) => Promise<string | null>;
  askConfirm: (req: ConfirmRequest) => Promise<boolean>;
  resolvePrompt: (value: string | null) => void;
  resolveConfirm: (ok: boolean) => void;
}

export const useDialogs = create<DialogState>((set, get) => ({
  addToPlaylist: null,
  prompt: null,
  confirm: null,

  openAddToPlaylist: (trackIds, label) => set({ addToPlaylist: { trackIds, label } }),
  closeAddToPlaylist: () => set({ addToPlaylist: null }),

  askPrompt: (req) =>
    new Promise((resolve) => {
      // A second request supersedes the first; never leave a promise hanging.
      get().prompt?.resolve(null);
      set({ prompt: { ...req, resolve } });
    }),

  askConfirm: (req) =>
    new Promise((resolve) => {
      get().confirm?.resolve(false);
      set({ confirm: { ...req, resolve } });
    }),

  resolvePrompt: (value) => {
    const pending = get().prompt;
    set({ prompt: null });
    pending?.resolve(value);
  },

  resolveConfirm: (ok) => {
    const pending = get().confirm;
    set({ confirm: null });
    pending?.resolve(ok);
  },
}));

/** Shorthands for action code. */
export const dialogs = {
  addToPlaylist: (trackIds: string[], label: string) => useDialogs.getState().openAddToPlaylist(trackIds, label),
  prompt: (req: PromptRequest) => useDialogs.getState().askPrompt(req),
  confirm: (req: ConfirmRequest) => useDialogs.getState().askConfirm(req),
};
