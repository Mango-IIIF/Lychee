import { join, resolve } from 'node:path';
import { webcrypto } from 'node:crypto';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { smartTools } from './build/smartTools';

if (
  typeof globalThis.crypto === 'undefined' ||
  typeof globalThis.crypto.getRandomValues !== 'function'
) {
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
}

const customElementConfig = (filename: string | undefined) => {
  if (/AnnotationEditorElement\.svelte$/.test(filename ?? '')) {
    return { customElement: true };
  }
  return {};
};

export default defineConfig({
  root: resolve(__dirname, 'src'),
  /*
   * `@mango-iiif/iiif-viewer` may be linked from a sibling checkout, which
   * would otherwise resolve its own copies of these from its own
   * node_modules: two Svelte runtimes cannot share components or stores.
   */
  /*
   * The standalone bundle has no consumer bundler after it, so libraries that
   * branch on NODE_ENV (React, RAMP) must be resolved here. Lib mode leaves it.
   */
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  resolve: {
    dedupe: ['svelte', '@lucide/svelte', 'openseadragon', 'react', 'react-dom', '@mango-iiif/av'],
  },
  plugins: [
    smartTools({ workerBase: '../annotorious/assets' }),
    svelte({
      configFile: resolve(__dirname, 'svelte.config.js'),
      dynamicCompileOptions({ filename }) {
        return customElementConfig(filename);
      },
    }),
    {
      name: 'mango-annotate-element-shadow-css',
      enforce: 'post',
      generateBundle(_options, bundle) {
        const jsChunk = bundle['mango-annotation-editor.js'];
        const cssAsset = bundle['mango-annotation-editor.css'];
        if (jsChunk?.type !== 'chunk' || cssAsset?.type !== 'asset') return;
        if (jsChunk.code.includes('/* mango-css-injected */')) return;

        const css =
          typeof cssAsset.source === 'string'
            ? cssAsset.source
            : Buffer.from(cssAsset.source).toString('utf8');
        jsChunk.code += `\n/* mango-css-injected */\n;if (typeof window !== 'undefined' && window.__setMangoAnnotateCss) { window.__setMangoAnnotateCss(${JSON.stringify(css)}); }`;
      },
      writeBundle(_options, bundle) {
        const standaloneDir = resolve(__dirname, 'src/dist/standalone');
        if (!existsSync(standaloneDir)) return;
        for (const entry of readdirSync(standaloneDir)) {
          if (!(`standalone/${entry}` in bundle)) {
            rmSync(join(standaloneDir, entry), { recursive: true, force: true });
          }
        }
      },
    },
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/lib/element-bundle.ts'),
      name: 'MangoAnnotationEditorElement',
      formats: ['es'],
      fileName: () => 'mango-annotation-editor.js',
    },
    rolldownOptions: {
      output: {
        chunkFileNames: 'standalone/[name]-[hash].js',
        assetFileNames: 'mango-annotation-editor.[ext]',
      },
    },
    outDir: resolve(__dirname, 'src/dist'),
    emptyOutDir: false,
    cssCodeSplit: false,
  },
});
