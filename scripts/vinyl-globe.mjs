import { cp, mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, relative, isAbsolute, extname } from 'node:path';

// The standalone document keeps the approved renderer and CSS independent
// from the parent React app; both are published by this same Vite build.
export function vinylGlobe({ projectRoot }) {
  const source = resolve(projectRoot, 'vendor/globe-vinyle');
  const output = resolve(projectRoot, 'public/globe-vinyle');
  let command, base = '/', prepared;
  const prepare = () => prepared ??= (async () => {
    if (!existsSync(resolve(source, 'node_modules/esbuild'))) {
      throw new Error('Installe le globe avec : npm ci --prefix vendor/globe-vinyle');
    }
    // Serve the pinned files directly in development: copying 1,900 geographic
    // assets into a watched public folder creates a startup file-event storm.
    if (command === 'serve') return;
    console.info('[globe vinyle] Préparation des données et médias intégrés…');
    await mkdir(output, { recursive: true });
    await Promise.all([
      cp(resolve(source, 'data'), resolve(output, 'data'), { recursive: true }),
      cp(resolve(source, 'assets/ui'), resolve(output, 'ui'), { recursive: true }),
      cp(resolve(source, 'assets/models'), resolve(output, 'models'), { recursive: true }),
      cp(resolve(source, 'shared/src/style.css'), resolve(output, 'style.css')),
    ]);
    console.info('[globe vinyle] Données et médias disponibles.');
    if (command === 'build') {
      const require = createRequire(resolve(source, 'package.json'));
      const { build } = require('esbuild');
      await build({
        entryPoints: {
          main: resolve(source, 'shared/src/main.tsx'),
          'border-worker': resolve(source, 'shared/src/border-worker.mjs'),
          'avatar-population-worker': resolve(source, 'shared/src/avatar-population-worker.mjs'),
        },
        bundle: true, splitting: true, format: 'esm', jsx: 'automatic',
        outdir: resolve(output, 'assets'), entryNames: '[name]', chunkNames: '[name]-[hash]',
        target: ['safari17', 'chrome110'], minify: true,
        loader: { '.png': 'file', '.svg': 'file', '.jpg': 'file', '.gif': 'file' },
        external: ['/globe-vinyle/ui/*'],
      });
      const html = await readFile(resolve(source, 'shared/index.html'), 'utf8');
      await writeFile(resolve(output, 'index.html'), html);
    }
  })();
  return {
    name: 'meewav-vinyl-globe',
    configResolved(config) { command = config.command; base = config.base; },
    async buildStart() { await prepare(); },
    async configureServer(server) {
      await prepare();
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url || '/', 'http://localhost').pathname;
        const prefix = `${base}globe-vinyle/`;
        if (pathname.startsWith(prefix)) {
          // This middleware responds before Vite's static-file middleware,
          // which normally applies server.headers. The iframe must inherit
          // the host's COEP policy or the audio-enabled app blocks its document.
          for (const [name, value] of Object.entries(server.config.server.headers ?? {})) {
            if (value !== undefined) response.setHeader(name, value);
          }
          const asset = pathname.slice(prefix.length).match(/^(data|ui|models)\/(.+)$/);
          if (asset) {
            try {
              const root = resolve(source, asset[1] === 'data' ? 'data' : `assets/${asset[1]}`);
              const target = resolve(root, decodeURIComponent(asset[2]));
              const inside = relative(root, target);
              if (!inside || inside.startsWith('..') || isAbsolute(inside) || !(await stat(target)).isFile()) {
                response.statusCode = 404; response.end(); return;
              }
              const bytes = await readFile(target);
              const types = { '.json': 'application/json', '.geojson': 'application/json', '.png': 'image/png',
                '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
                '.js': 'text/javascript', '.wasm': 'application/wasm', '.glb': 'model/gltf-binary' };
              response.setHeader('Content-Type', types[extname(target)] || 'application/octet-stream');
              response.setHeader('Cache-Control', 'no-cache');
              response.setHeader('Content-Length', String(bytes.length));
              response.end(request.method === 'HEAD' ? undefined : bytes);
            } catch { response.statusCode = 404; response.end(); }
            return;
          }
        }
        if (![`${base}globe-vinyle/`, `${base}globe-vinyle/index.html`].includes(pathname)) return next();
        try {
          const html = (await readFile(resolve(source, 'shared/index.html'), 'utf8'))
            .replace('<link rel="stylesheet" href="./assets/main.css">', '')
            .replace('./assets/main.js', `${base}vendor/globe-vinyle/shared/src/main.tsx`)
            .replace('./style.css', `${base}vendor/globe-vinyle/shared/src/style.css`);
          response.setHeader('Content-Type', 'text/html; charset=utf-8');
          response.setHeader('Cache-Control', 'no-cache');
          response.end(await server.transformIndexHtml(pathname, html));
        } catch (error) { next(error); }
      });
    },
  };
}
