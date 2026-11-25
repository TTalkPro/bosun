import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { SWRConfig } from 'swr';
import { Toaster } from '@/components/ui/sonner';
import './styles/index.css';
// 主题色同样在模块加载时应用到 <html data-accent>
import './hooks/use-accent';
import router from './routes/router';

// 主题在 hooks/use-theme 模块加载时就应用到 <html> 上（Toaster 引用了它），这里不用再调
const App = () => {
  return (
    <React.StrictMode>
      <SWRConfig value={{ revalidateOnFocus: true, shouldRetryOnError: false }}>
        <RouterProvider router={router} />
        <Toaster position="bottom-right" richColors closeButton />
      </SWRConfig>
    </React.StrictMode>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
