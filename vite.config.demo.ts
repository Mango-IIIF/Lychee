import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { apiMiddleware } from './apps/demo/server/api';
import { fixturePath, relocate } from './scripts/fixtures.mjs';

const root = resolve(__dirname, 'apps/demo');
const srcDist = resolve(__dirname, 'src/dist');

const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.vtt': 'text/vtt; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.wasm': 'application/wasm',
};

const serveDemoDistAsStatic = (): Plugin => ({
  name: 'serve-demo-dist-as-static',
  configureServer(server) {
    let reloadTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleReload = (file: string) => {
      if (!file.startsWith(srcDist)) return;
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => {
        reloadTimer = null;
        server.ws.send({
          type: 'full-reload',
          path: '*',
        });
      }, 150);
    };

    server.watcher.add(srcDist);
    server.watcher.on('change', scheduleReload);
    server.watcher.on('add', scheduleReload);

    server.middlewares.use((request, response, next) => {
      const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
      if (!pathname.startsWith('/dist/')) {
        next();
        return;
      }

      const relativePath = normalize(pathname.replace(/^\/dist\//, ''));
      const filePath = join(srcDist, relativePath);
      if (!filePath.startsWith(`${srcDist}${sep}`) || !existsSync(filePath)) {
        next();
        return;
      }

      response.setHeader(
        'Content-Type',
        contentTypes[extname(filePath)] ?? 'application/octet-stream',
      );
      response.setHeader('Cache-Control', 'no-store');
      createReadStream(filePath).pipe(response);
    });
  },
});

/* Fixtures with their localhost identifiers rebased onto this server, whatever its port. */
const serveFixtures = (): Plugin => ({
  name: 'serve-demo-fixtures',
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
      const file = pathname.startsWith('/manifests/') ? fixturePath(pathname) : null;
      if (!file) {
        next();
        return;
      }
      const base = `http://${request.headers.host ?? 'localhost:5173'}/`;
      response.setHeader('Content-Type', contentTypes[extname(file)] ?? 'application/octet-stream');
      response.setHeader('Access-Control-Allow-Origin', '*');
      response.end(relocate(readFileSync(file, 'utf8'), base));
    });
  },
});

/* The demo's AI and GeoNames endpoints. Dev only: a static deploy has no server. */
const demoApi = (env: Record<string, string>): Plugin => ({
  name: 'demo-api',
  configureServer(server) {
    server.middlewares.use('/api', apiMiddleware(env));
  },
  configurePreviewServer(server) {
    server.middlewares.use('/api', apiMiddleware(env));
  },
});

export default defineConfig(({ mode }) => ({
  root,
  plugins: [
    serveFixtures(),
    serveDemoDistAsStatic(),
    demoApi({ ...process.env, ...loadEnv(mode, __dirname, '') } as Record<string, string>),
  ],
}));
