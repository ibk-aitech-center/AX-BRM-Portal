import { reactive } from 'vue';

export interface Toast { id: number; text: string; tone: 'info' | 'success' | 'warning' | 'danger'; action?: { label: string; run: () => void } }

export const toasts = reactive<Toast[]>([]);
let seq = 0;

export function toast(text: string, tone: Toast['tone'] = 'info', opts: { action?: Toast['action']; ms?: number } = {}) {
  const t: Toast = { id: ++seq, text, tone, action: opts.action };
  toasts.push(t);
  setTimeout(() => dismiss(t.id), opts.ms ?? (opts.action ? 8000 : 4000));
  return t.id;
}
export function dismiss(id: number) {
  const i = toasts.findIndex((t) => t.id === id);
  if (i >= 0) toasts.splice(i, 1);
}
