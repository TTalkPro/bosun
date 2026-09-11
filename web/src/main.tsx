import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { ThemeProvider, CssBaseline, InitColorSchemeScript } from '@mui/material';
import { SnackbarProvider } from 'notistack';
import { SWRConfig } from 'swr';
import theme from './theme';
import router from './routes/router';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <InitColorSchemeScript attribute="data-mui-color-scheme" />
    <ThemeProvider theme={theme} defaultMode="system">
      <CssBaseline />
      <SWRConfig value={{ revalidateOnFocus: true, shouldRetryOnError: false }}>
        <SnackbarProvider maxSnack={3} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
          <RouterProvider router={router} />
        </SnackbarProvider>
      </SWRConfig>
    </ThemeProvider>
  </React.StrictMode>,
);
