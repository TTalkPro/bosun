import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { SWRConfig } from 'swr';
import { Toaster } from '@/components/ui/sonner';
import { useTheme } from '@/hooks/use-theme';
import './styles/index.css';
import router from './routes/router';

const App = () => {
  useTheme();
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
