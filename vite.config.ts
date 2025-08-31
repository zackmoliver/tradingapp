import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@/components': path.resolve(__dirname, 'src/components'),
      '@/types': path.resolve(__dirname, 'src/types'),
      '@/utils': path.resolve(__dirname, 'src/utils'),
      '@/pages': path.resolve(__dirname, 'src/pages'),
      '@/features': path.resolve(__dirname, 'src/features')
    }
  },
  server: {
    port: 8080,
    strictPort: true
  }
});
