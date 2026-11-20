import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';

// 每个用例重新加载模块：主题 store 是模块级的
const setup = async (system: 'light' | 'dark', stored?: string) => {
  vi.resetModules();
  localStorage.clear();
  if (stored) localStorage.setItem('bosun.theme', stored);
  let dark = system === 'dark';
  const mqListeners = new Set<() => void>();
  vi.stubGlobal('matchMedia', () => ({
    get matches() { return dark; },
    addEventListener: (_: string, l: () => void) => mqListeners.add(l),
    removeEventListener: (_: string, l: () => void) => mqListeners.delete(l),
  }));
  const mod = await import('@/hooks/use-theme');
  return { ...mod, setSystem: (m: 'light' | 'dark') => { dark = m === 'dark'; mqListeners.forEach((l) => l()); } };
};

describe('theme store', () => {
  beforeEach(() => { document.documentElement.className = ''; });

  it('every consumer follows one toggle', async () => {
    const t = await setup('light');
    const A = () => <span data-testid="a">{t.useTheme().mode}</span>;
    const B = () => <span data-testid="b">{t.useThemeMode()}</span>;
    render(<><A /><B /></>);
    expect(screen.getByTestId('a').textContent).toBe('light');
    act(() => t.toggleTheme());
    expect(screen.getByTestId('a').textContent).toBe('dark');
    expect(screen.getByTestId('b').textContent).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('bosun.theme')).toBe('dark');
  });

  it('follows the system until the user picks something different', async () => {
    const t = await setup('dark');
    expect(t.getThemeMode()).toBe('dark');
    expect(localStorage.getItem('bosun.theme')).toBeNull();   // 不再首次加载就落盘
    act(() => t.setSystem('light'));
    expect(t.getThemeMode()).toBe('light');
    act(() => t.setThemeMode('dark'));                        // 与系统不同：记住
    act(() => t.setSystem('dark'));
    act(() => t.setSystem('light'));
    expect(t.getThemeMode()).toBe('light');                   // 中途与系统一致过 = 回到跟随
  });

  it('drops a stored value that merely mirrors the system', async () => {
    const t = await setup('light', 'light');                  // 旧版本首次加载自动写入的
    expect(localStorage.getItem('bosun.theme')).toBeNull();
    act(() => t.setSystem('dark'));
    expect(t.getThemeMode()).toBe('dark');
    const kept = await setup('light', 'dark');                // 真正的用户选择保留
    expect(kept.getThemeMode()).toBe('dark');
    expect(localStorage.getItem('bosun.theme')).toBe('dark');
  });
});
