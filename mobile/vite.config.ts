import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    host: true,
    port: 5174,
    fs: {
      allow: [path.resolve(rootDir, '..')],
    },
  },
  preview: {
    host: true,
    port: 5174,
  },
});
