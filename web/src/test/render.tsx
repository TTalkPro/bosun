import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

// 带上 CSS variables 主题与路由的 render（组件用 theme.vars 取色）
export const renderApp = (ui: ReactElement) =>
  render(<><MemoryRouter>{ui}</MemoryRouter></>);
