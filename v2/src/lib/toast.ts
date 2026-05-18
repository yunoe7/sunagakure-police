'use client';

import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastStore {
  toasts: Toast[];
  show: (message: string, type?: ToastType, duration?: number) => void;
  dismiss: (id: string) => void;
}

/**
 * Store global pour les toasts (notifications éphémères).
 *
 * Usage depuis n'importe quel composant client :
 *   import { useToastStore } from '@/lib/toast';
 *   const show = useToastStore(s => s.show);
 *   show('Patient ajouté', 'success');
 *
 * Remplace ta fonction `window.showToast()` de l'ancien intranet.
 */
export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  show: (message, type = 'info', duration = 3500) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, duration);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

// Raccourci pratique pour les usages "one-shot" hors React
export const toast = {
  success: (msg: string) => useToastStore.getState().show(msg, 'success'),
  error: (msg: string) => useToastStore.getState().show(msg, 'error'),
  info: (msg: string) => useToastStore.getState().show(msg, 'info'),
  warning: (msg: string) => useToastStore.getState().show(msg, 'warning'),
};
