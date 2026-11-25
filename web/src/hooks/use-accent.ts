import { useSyncExternalStore } from 'react';

// 主题色（账户页「外观与偏好」）：只换 --primary 一族（按钮、高亮，以及用 primary 的「进行中」状态），其余状态色 / 图表色不动。
// 取值写在 <html data-accent>，明暗两套色值在 styles/theme.css 里按 [data-accent] 定义；缺省蓝色不写属性。

export type Accent = 'blue' | 'violet' | 'green' | 'orange' | 'rose';
export const ACCENTS: { key: Accent; label: string; swatch: string }[] = [
  { key: 'blue', label: '蓝', swatch: 'oklch(0.56 0.19 261)' },
  { key: 'violet', label: '紫', swatch: 'oklch(0.54 0.22 293)' },
  { key: 'green', label: '绿', swatch: 'oklch(0.55 0.15 160)' },
  { key: 'orange', label: '橙', swatch: 'oklch(0.6 0.19 45)' },
  { key: 'rose', label: '玫红', swatch: 'oklch(0.58 0.21 15)' },
];

const KEY = 'bosun.accent';
const isAccent = (v: unknown): v is Accent => ACCENTS.some((a) => a.key === v);

const read = (): Accent => {
  try { const v = localStorage.getItem(KEY); return isAccent(v) ? v : 'blue'; } catch { return 'blue'; }
};

const apply = (a: Accent) => {
  if (a === 'blue') delete document.documentElement.dataset.accent;
  else document.documentElement.dataset.accent = a;
};

let current: Accent = read();
apply(current);

const listeners = new Set<() => void>();
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export const setAccent = (a: Accent) => {
  try { if (a === 'blue') localStorage.removeItem(KEY); else localStorage.setItem(KEY, a); } catch { /* ignore */ }
  current = a;
  apply(a);
  listeners.forEach((l) => l());
};

// 别的标签页改了：跟上
window.addEventListener('storage', (e) => { if (e.key === KEY || e.key === null) { const a = read(); if (a !== current) { current = a; apply(a); listeners.forEach((l) => l()); } } });

export const useAccent = (): Accent => useSyncExternalStore(subscribe, () => current);
