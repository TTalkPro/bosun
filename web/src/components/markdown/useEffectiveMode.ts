export const useEffectiveMode = () => {
  const mode = localStorage.getItem('bosun.theme');
  const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  return mode === 'dark' || (!mode && systemDark) ? 'dark' : 'light';
};
