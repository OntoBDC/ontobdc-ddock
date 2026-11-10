import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

// The build the service worker caches the files of: a new one drops what the old one kept.
const BUILD_ID = Date.now().toString(36);

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
});
