import { resolve } from 'node:path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: resolve(__dirname, 'src'),
  resolve: {
    conditions: ['browser'],
    dedupe: ['svelte', '@lucide/svelte'],
  },
  plugins: [
    svelte({
      configFile: resolve(__dirname, 'svelte.config.js'),
    }),
  ],
  test: {
    environment: 'jsdom',
    include: ['lib/**/*.test.ts'],
    setupFiles: [resolve(__dirname, 'src/vitest.setup.ts')],
    // Annotorious imports named exports from OpenSeadragon's CommonJS build; let Vite transform it.
    server: { deps: { inline: [/@annotorious\//, 'openseadragon'] } },
  },
});
