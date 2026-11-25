import { useSyncExternalStore } from 'react';

export type ThemeMode = 'light' | 'dark';

// 全站唯一的主题状态。以前 main.tsx 和 MainLayout 各调一次 useTheme（各有各的 useState），
// markdown 的 useEffectiveMode 和 sonner 的 Toaster 又各自在渲染时读一次 localStorage——
// 切了主题，已经画出来的 mermaid 图、toast 都不跟着换。现在都订阅这一个 store。
//
// 偏好只在与系统不同的时候落盘（localStorage `bosun.theme`）；与系统一致 = 跟随系统，
// 系统明暗切换时页面跟着变。以前首次加载就把当时的模式写进去，「跟随系统」从此冻结；
// 那批自动写入的值与系统一致，按这条规则读到时会被清掉。

const KEY = 'bosun.theme';

const systemMode = (): ThemeMode =>
  window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

const storedMode = (): ThemeMode | null => {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
};

const store = (mode: ThemeMode | null) => {
  try {
    if (mode) localStorage.setItem(KEY, mode);
    else localStorage.removeItem(KEY);
  } catch { /* 隐私模式等写不了：只影响下次打开 */ }
};

const resolve = (): ThemeMode => {
  const system = systemMode();
  const stored = storedMode();
  if (stored === system) store(null);
  return stored ?? system;
};

const apply = (mode: ThemeMode) => {
  document.documentElement.classList.toggle('dark', mode === 'dark');
  document.documentElement.dataset.theme = mode;
};

let current: ThemeMode = resolve();
apply(current);

const listeners = new Set<() => void>();

const refresh = () => {
  const next = resolve();
  if (next === current) return;
  current = next;
  apply(current);
  listeners.forEach((l) => l());
};

// 系统明暗切换、别的标签页改了偏好：都重新算一遍
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', refresh);
window.addEventListener('storage', (e) => { if (e.key === KEY || e.key === null) refresh(); });

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export const getThemeMode = (): ThemeMode => current;

export const setThemeMode = (mode: ThemeMode) => {
  store(mode === systemMode() ? null : mode);
  refresh();
};

export const toggleTheme = () => setThemeMode(current === 'dark' ? 'light' : 'dark');

/** 没有落盘的偏好 = 跟随系统。是否跟随的变化总伴随着生效模式的变化（见上面的规则），
 *  所以用 useThemeMode 驱动重渲染、渲染时读它就够了 */
export const isFollowingSystem = (): boolean => storedMode() === null;

export const getSystemMode = (): ThemeMode => systemMode();

/** 清掉偏好，回到跟随系统 */
export const followSystem = () => {
  store(null);
  refresh();
};

/** 当前生效的明暗模式；切换时所有用到的组件一起重渲染 */
export const useThemeMode = (): ThemeMode => useSyncExternalStore(subscribe, getThemeMode);

export function useTheme() {
  const mode = useThemeMode();
  return { mode, setMode: setThemeMode, toggle: toggleTheme };
}
