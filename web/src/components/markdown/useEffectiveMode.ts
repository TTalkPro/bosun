import { useColorScheme } from '@mui/material';

// 当前生效的明暗模式（system 时取系统值）
export const useEffectiveMode = (): 'light' | 'dark' => {
  const { mode, systemMode } = useColorScheme();
  const effective = mode === 'system' ? systemMode : mode;
  return effective === 'dark' ? 'dark' : 'light';
};
