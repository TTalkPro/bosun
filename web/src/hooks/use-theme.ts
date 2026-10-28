import { useEffect, useState } from 'react';

type ThemeMode = 'light' | 'dark';

const applyTheme = (mode: ThemeMode) => {
  document.documentElement.classList.toggle('dark', mode === 'dark');
  document.documentElement.dataset.theme = mode;
};

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(() => (
    localStorage.getItem('bosun.theme') as ThemeMode | null ??
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  ));
  useEffect(() => { applyTheme(mode); localStorage.setItem('bosun.theme', mode); }, [mode]);
  return { mode, setMode: (next: ThemeMode) => setMode(next), toggle: () => setMode(mode === 'dark' ? 'light' : 'dark') };
}
