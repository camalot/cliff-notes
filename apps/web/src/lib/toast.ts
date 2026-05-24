import { create } from "zustand";
import type { ReactNode } from "react";

export type ToastKind = "info" | "success" | "error";

export interface ToastItem {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
  details?: ReactNode;
  durationMs: number;
}

interface ToastStore {
  toasts: ToastItem[];
  push: (t: Omit<ToastItem, "id" | "durationMs"> & { durationMs?: number }) => string;
  dismiss: (id: string) => void;
}

let nextId = 0;

const clampDuration = (ms: number | undefined) =>
  Math.min(5000, Math.max(3000, ms ?? 4000));

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: ({ durationMs, ...rest }) => {
    const id = `t${++nextId}`;
    set((s) => ({
      toasts: [...s.toasts, { id, durationMs: clampDuration(durationMs), ...rest }],
    }));
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

type ToastOpts = { message?: string; details?: ReactNode; durationMs?: number };

export const toast = {
  info: (title: string, opts?: ToastOpts) =>
    useToastStore.getState().push({ kind: "info", title, ...opts }),
  success: (title: string, opts?: ToastOpts) =>
    useToastStore.getState().push({ kind: "success", title, ...opts }),
  error: (title: string, opts?: ToastOpts) =>
    useToastStore.getState().push({ kind: "error", title, ...opts }),
};
