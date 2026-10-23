import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Port 1420 is what the Tauri dev configuration expects.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true, host: '127.0.0.1' },
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
});
