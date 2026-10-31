import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * The A/V fixtures (copied from cyw-annotate, which copied them from the RAMP
 * prototype) carry `http://localhost:5173/iiif-pcw-*` identifiers. They are kept
 * verbatim in apps/demo/fixtures; apps/demo/manifests is generated from them
 * with those identifiers rebased onto wherever the demo is served. External
 * media and the NLW manifest's identifiers are left alone.
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const fixturesDir = resolve(root, 'apps/demo/fixtures');
export const manifestsDir = resolve(root, 'apps/demo/manifests');

const WIP = /http:\/\/localhost:5173\/(iiif-pcw-)/g;

/** Rebase fixture identifiers onto `base`, the demo's own URL ending in `/`. */
export const relocate = (text, base) => text.replace(WIP, `${base}manifests/$1`);

const TEXT = new Set(['.json', '.vtt', '.txt', '.md']);

/** Writes apps/demo/manifests for a deployment at `base`. */
export const writeManifests = (base) => {
  rmSync(manifestsDir, { recursive: true, force: true });
  mkdirSync(manifestsDir, { recursive: true });
  const walk = (from, to) => {
    for (const entry of readdirSync(from)) {
      const source = join(from, entry);
      const target = join(to, entry);
      if (statSync(source).isDirectory()) {
        mkdirSync(target, { recursive: true });
        walk(source, target);
      } else if (TEXT.has(extname(entry))) {
        writeFileSync(target, relocate(readFileSync(source, 'utf8'), base));
      } else {
        cpSync(source, target);
      }
    }
  };
  walk(fixturesDir, manifestsDir);
};

/** The demo's public URL at build time: DEMO_BASE_URL, else Vercel's, else local dev. */
export const deployBase = () => {
  const explicit = process.env.DEMO_BASE_URL;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  const base = explicit || (vercel ? `https://${vercel}` : 'http://localhost:5173');
  return base.endsWith('/') ? base : `${base}/`;
};

export const fixturePath = (pathname) => {
  const file = join(fixturesDir, pathname.replace(/^\/manifests\//, ''));
  return file.startsWith(fixturesDir) && existsSync(file) && statSync(file).isFile() ? file : null;
};
