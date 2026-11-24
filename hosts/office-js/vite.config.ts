import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

function resolveOfficeDevHttps() {
  const certDir = path.join(os.homedir(), '.office-addin-dev-certs');
  const keyPath = path.join(certDir, 'localhost.key');
  const certPath = path.join(certDir, 'localhost.crt');
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    };
  }
  return undefined;
}

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  server: {
    port: 3100,
    strictPort: true,
    https: resolveOfficeDevHttps(),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        taskpane: path.resolve(__dirname, 'taskpane.html'),
        commands: path.resolve(__dirname, 'commands.html'),
      },
    },
  },
});
