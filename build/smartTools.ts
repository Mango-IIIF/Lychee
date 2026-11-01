import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

/*
 * Build-time adjustments to the Annotorious smart-tool plugins (the IMMARKUS
 * toolset), carried over from cyw-annotate. Each fails the build when upstream
 * changes rather than silently shipping without the fix: review them when
 * upgrading these packages.
 *
 * The two plugins are bundled into the library (not left external) so these
 * fixes ship with it.
 */

// Their `exports` don't list package.json, so resolve the folder directly.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageDir = (name: string) => path.join(root, 'node_modules', name);

const SAM = '@annotorious/plugin-segment-anything';
const MAGNETIC = '@annotorious/plugin-magnetic-outline';
/**
 * Where the SAM worker loads ONNX runtime from, instead of next to itself (~27 MB): the
 * onnxruntime-web release it was built with. Not the plugin's own copy: with its models
 * the plugin is over jsDelivr's package size limit, so jsDelivr serves none of its files.
 */
const ortBase = (version: string) => `https://cdn.jsdelivr.net/npm/onnxruntime-web@${version}/dist/`;

const endsWith = (id: string, suffix: string) => id.split('?')[0].replaceAll('\\', '/').endsWith(suffix);

/**
 * plugin-segment-anything 0.5.0: its OSD destroy() removes overlays and
 * listeners but leaves the inference worker and scheduled encoding retries alive.
 */
const samLifecycle = (code: string) => {
  const destroy = 'let R = () => {\n\t\ti = !1, s = !1';
  const retry = 'setTimeout(() => E(), 100)';
  if (!code.includes(destroy) || !code.includes(retry) || !code.includes('z = new Worker(')) {
    throw new Error('SAM lifecycle patch no longer matches upstream; review it before upgrading.');
  }
  return code
    .replace(destroy, 'let R = () => {\n\t\tz.onmessage = null; z.terminate(); d.sam = void 0;\n\t\ti = !1, s = !1')
    .replace(retry, 'setTimeout(() => { if (i) E(); }, 100)');
};

/**
 * The SAM worker resolves ONNX runtime against its own URL; point it at the CDN. The
 * worker's copies carry a Vite content hash that the release's file names don't.
 */
const samWorkerRuntime = (code: string) => {
  const pattern = /new URL\(`(ort-wasm-[^`]+)-[\w-]{8}\.(mjs|wasm)`,self\.location\.href\)/g;
  const matches = code.match(pattern) ?? [];
  const version = code.match(/Object\.defineProperty\(\w+\.versions,"web",\{value:(\w+)/)?.[1];
  const release = version && code.match(new RegExp(`var ${version}=\`(\\d+\\.\\d+\\.\\d+)\``))?.[1];
  if (matches.length !== 2 || !release) {
    throw new Error('SAM worker ONNX runtime URLs changed upstream; review the patch.');
  }
  const base = JSON.stringify(ortBase(release));
  return code.replace(pattern, (_m, name: string, ext: string) => `new URL(\`${name}.${ext}\`,${base})`);
};

/** plugin-magnetic-outline loads its worker from `/assets/` at the site root. */
const MAGNETIC_WORKER = '/assets/get-keypoints-worker-BNnnN2-f.js';

const magneticWorker = (code: string) => {
  if (!code.includes(`"${MAGNETIC_WORKER}"`)) {
    throw new Error('Magnetic outline worker path changed upstream; review the patch.');
  }
  // The comment keeps Vite's worker plugin from trying to bundle a file that only exists in the output.
  return code.replace(
    `"${MAGNETIC_WORKER}"`,
    `/* @vite-ignore */ new URL("./annotorious${MAGNETIC_WORKER}", import.meta.url)`,
  );
};

/** …and its cursor likewise. Inlined, so it works wherever the CSS ends up (incl. shadow roots). */
const magneticCursor = (code: string) => {
  if (!code.includes('url(/assets/crosshair.svg)')) {
    throw new Error('Magnetic outline cursor path changed upstream; review the patch.');
  }
  const svg = fs.readFileSync(path.join(packageDir(MAGNETIC), 'dist/assets/crosshair.svg'), 'utf8');
  return code.replaceAll(
    'url(/assets/crosshair.svg)',
    `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
  );
};

const SAM_WORKER_REF = /new URL\("assets\/(sam2-worker-[\w-]+\.js)", import\.meta\.url\)/;

/**
 * Workers are emitted as files under `annotorious/assets/` next to the bundle
 * and referenced relative to it, so the library works when hosted under a
 * subdirectory and a consuming bundler can copy them as ordinary assets.
 */
export const smartTools = (): Plugin => {
  const workers = new Map<string, string>();
  return {
    name: 'mango-annotate-smart-tools',
    enforce: 'pre',
    transform(code, id) {
      if (endsWith(id, `/${SAM}/dist/openseadragon/index.js`)) {
        return { code: samLifecycle(code), map: null };
      }
      if (/\/@annotorious\/plugin-segment-anything\/dist\/utils-[\w-]+\.js$/.test(id.split('?')[0])) {
        const match = code.match(SAM_WORKER_REF);
        if (!match) throw new Error('SAM worker reference changed upstream; review the patch.');
        const file = path.join(packageDir(SAM), 'dist/assets', match[1]);
        workers.set(match[1], samWorkerRuntime(fs.readFileSync(file, 'utf8')));
        return {
          code: code.replace(SAM_WORKER_REF, `new URL("./annotorious/assets/${match[1]}", import.meta.url)`),
          map: null,
        };
      }
      if (endsWith(id, `/${MAGNETIC}/dist/plugin-magnetic-outline.js`)) {
        const name = path.basename(MAGNETIC_WORKER);
        workers.set(name, fs.readFileSync(path.join(packageDir(MAGNETIC), 'dist/assets', name), 'utf8'));
        return { code: magneticWorker(code), map: null };
      }
      if (endsWith(id, `/${MAGNETIC}/dist/style.css`)) {
        return { code: magneticCursor(code), map: null };
      }
      return undefined;
    },
    // The rewritten URLs don't exist next to the source module, so Vite leaves
    // them to resolve at runtime, against the bundle — where these land.
    generateBundle() {
      for (const [name, source] of workers) {
        this.emitFile({ type: 'asset', fileName: `annotorious/assets/${name}`, source });
      }
    },
  };
};
