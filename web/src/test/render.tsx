import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { ThemeProvider } from '@mui/material';
import { MemoryRouter } from 'react-router';
import theme from '@/theme';

// 带上 CSS variables 主题与路由的 render（组件用 theme.vars 取色）
export const renderApp = (ui: ReactElement) =>
  render(<ThemeProvider theme={theme}><MemoryRouter>{ui}</MemoryRouter></ThemeProvider>);
