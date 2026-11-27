import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const BACKEND_TARGET = process.env.VITE_BACKEND_URL || 'http://127.0.0.1:15655';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': {
        target: BACKEND_TARGET,
        changeOrigin: true,
      },
      '/auth': {
        target: BACKEND_TARGET,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: path.resolve(__dirname, '../dist'),
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'i18n-vendor': ['i18next', 'react-i18next'],
          'icons-vendor': ['lucide-react'],
        },
      },
    },
  },
});
