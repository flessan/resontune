import { create } from 'zustand';

interface Toast { id: number; message: string }
interface ToastState {
  toasts: Toast[];
  push: (message: string) => void;
}

let nextId = 1;

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (message) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, message }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 2800);
  },
}));

export const toast = (message: string) => useToasts.getState().push(message);
