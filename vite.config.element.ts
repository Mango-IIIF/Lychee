import { resolve } from 'node:path';
import { webcrypto } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import react from '@vitejs/plugin-react';
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
    dedupe: ['svelte', '@lucide/svelte', 'openseadragon', 'react', 'react-dom'],
  },
  plugins: [
    smartTools(),
    react({ include: /\.tsx$/ }),
    svelte({
      configFile: resolve(__dirname, 'svelte.config.js'),
      dynamicCompileOptions({ filename }) {
        return customElementConfig(filename);
      },
    }),
    {
      name: 'mango-annotate-element-shadow-css',
      closeBundle() {
        const jsPath = resolve(__dirname, 'src/dist/mango-annotation-editor.js');
        const cssPath = resolve(__dirname, 'src/dist/mango-annotation-editor.css');

        console.log('[CSS Inject] Checking files:', jsPath, cssPath);
        const jsExists = existsSync(jsPath);
        const cssExists = existsSync(cssPath);
        console.log('[CSS Inject] JS Exists:', jsExists, 'CSS Exists:', cssExists);

        if (!jsExists || !cssExists) return;

        const js = readFileSync(jsPath, 'utf8');
        const alreadyPatched = js.includes('/* mango-css-injected */');
        console.log('[CSS Inject] Already Patched?', alreadyPatched);
        if (alreadyPatched) return;

        const css = readFileSync(cssPath, 'utf8');
        console.log('[CSS Inject] Injecting CSS of length:', css.length);
        writeFileSync(
          jsPath,
          `${js}\n/* mango-css-injected */\n;if (typeof window !== 'undefined' && window.__setMangoAnnotateCss) { window.__setMangoAnnotateCss(${JSON.stringify(css)}); }`
        );
        console.log('[CSS Inject] Successfully injected CSS!');
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
        assetFileNames: 'mango-annotation-editor.[ext]',
      },
    },
    outDir: resolve(__dirname, 'src/dist'),
    emptyOutDir: false,
    cssCodeSplit: false,
  },
});
