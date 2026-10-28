/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// 开发：/api 与 /mcp 代理到 Erlang 后端；构建：产物直接落到后端静态目录
export default defineConfig({
  plugins: [
    {
      name: 'mui-icons-compat',
      enforce: 'pre',
      resolveId(id) {
        if (id.startsWith('@mui/icons-material/')) return path.resolve(__dirname, 'src/mui-compat/icons.ts');
      },
    },react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src'), '@mui/material': fileURLToPath(new URL('./src/mui-compat/material.tsx', import.meta.url)), '@mui/material/styles': fileURLToPath(new URL('./src/mui-compat/material.tsx', import.meta.url)), '@mui/lab': fileURLToPath(new URL('./src/mui-compat/lab.tsx', import.meta.url)), '@mui/x-data-grid': fileURLToPath(new URL('./src/mui-compat/material.tsx', import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:4000',
      '/mcp': 'http://127.0.0.1:4000',
    },
  },
  build: {
    outDir: path.resolve(__dirname, '../apps/bosun_web/priv/static'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
