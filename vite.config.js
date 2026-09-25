import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { existsSync } from 'node:fs'
import { cp, readFile } from 'node:fs/promises'
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { audioLabNativeMonitor } from './scripts/audio-lab-native-monitor.mjs'
import { vinylGlobe } from './scripts/vinyl-globe.mjs'

const projectRoot = dirname(fileURLToPath(import.meta.url))
const canonicalCheckoutRoot = resolve(projectRoot, '..', '..')
const sharedEnvDir = [projectRoot, canonicalCheckoutRoot].find((candidate) => (
  existsSync(resolve(candidate, '.env.local'))
  || existsSync(resolve(candidate, '.env'))
)) ?? projectRoot

const audioLabAssetRoot = resolve(projectRoot, 'audio-lab-public', 'opendaw-wasm')

function containedAssetPath(root, pathname) {
  const target = resolve(root, ...pathname.split('/').filter(Boolean))
  const relativeTarget = relative(root, target)
  return relativeTarget && !relativeTarget.startsWith('..') && !isAbsolute(relativeTarget)
    ? target
    : null
}

function audioLabAssets(enabled) {
  if (!enabled) return null
  const serve = (server) => {
    server.middlewares.use(async (request, response, next) => {
      const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
      const prefix = '/opendaw-wasm/'
      if (!pathname.startsWith(prefix)) return next()
      let decodedPath
      try {
        decodedPath = decodeURIComponent(pathname.slice(prefix.length))
      } catch {
        response.statusCode = 400
        response.end('Invalid openDAW asset path encoding')
        return
      }
      const target = containedAssetPath(audioLabAssetRoot, decodedPath)
      if (!target) {
        response.statusCode = 400
        response.end('Invalid openDAW asset path')
        return
      }
      try {
        const buffer = await readFile(target)
        const extension = extname(target).toLowerCase()
        response.statusCode = 200
        response.setHeader('Content-Type', extension === '.wasm'
          ? 'application/wasm'
          : extension === '.json'
            ? 'application/json; charset=utf-8'
            : 'text/javascript; charset=utf-8')
        response.setHeader('Content-Length', String(buffer.length))
        response.setHeader('Cache-Control', 'no-cache')
        response.end(request.method === 'HEAD' ? undefined : buffer)
      } catch (error) {
        if (error?.code === 'ENOENT') return next()
        next(error)
      }
    })
  }
  return {
    name: 'meewav-audio-lab-assets',
    configureServer: serve,
    async writeBundle(outputOptions) {
      const outputDirectory = resolve(projectRoot, outputOptions.dir ?? 'dist')
      await cp(audioLabAssetRoot, resolve(outputDirectory, 'opendaw-wasm'), { recursive: true })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isAudioLab = mode === 'audio-lab'
  return {
    plugins: [
      react(),
      vinylGlobe({ projectRoot }),
      audioLabAssets(isAudioLab),
      audioLabNativeMonitor({ enabled: isAudioLab, projectRoot }),
    ].filter(Boolean),
    // Git worktrees do not copy ignored .env files. Reuse the canonical
    // checkout's local environment for normal launches. The isolated audio
    // lab intentionally reads its committed, non-secret mode file here.
    envDir: isAudioLab ? projectRoot : sharedEnvDir,
    // Normal MeeWav assets stay available in the laboratory. The plugin above
    // adds only /opendaw-wasm in audio-lab mode, so normal builds never ship it.
    publicDir: resolve(projectRoot, 'public'),
    // Scan only the app entry, excluding HTML in temporary browser profiles.
    optimizeDeps: {
      entries: ['index.html'],
    },
    server: {
      watch: {
        ignored: ['.worktrees', 'tmp', '.tmp', 'public/globe-vinyle', 'vendor/globe-vinyle/data', 'vendor/globe-vinyle/assets'].map((name) => resolve(projectRoot, name)),
      },
      headers: isAudioLab ? {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Resource-Policy': 'same-origin',
      } : undefined,
    },
    preview: isAudioLab ? {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Resource-Policy': 'same-origin',
      },
    } : undefined,
  }
})
