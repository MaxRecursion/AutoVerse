import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * `vite preview`: serve a prerendered route (`/labs/engine`) from
 * `dist/labs/engine/index.html`, as the hosts do (Netlify: the generated
 * dist/_redirects; Vercel: cleanUrls). Without this, Vite's SPA fallback
 * answers every extensionless URL with the home page's index.html, so the
 * per-route titles and meta written by scripts/prerender never show locally.
 */
function prerenderedRoutes(): Plugin {
  return {
    name: 'autoverse:prerendered-routes',
    configurePreviewServer(server) {
      const outDir = path.resolve(server.config.root, server.config.build.outDir)
      server.middlewares.use((req, _res, next) => {
        if ((req.method === 'GET' || req.method === 'HEAD') && req.url) {
          const q = req.url.indexOf('?')
          const pathname = q === -1 ? req.url : req.url.slice(0, q)
          if (pathname !== '/' && !pathname.endsWith('/') && !path.extname(pathname)) {
            try {
              const file = path.join(outDir, decodeURIComponent(pathname), 'index.html')
              if (file.startsWith(outDir + path.sep) && existsSync(file)) req.url = `${pathname}/index.html${q === -1 ? '' : req.url.slice(q)}`
            } catch {
              // Malformed URL: leave it to Vite.
            }
          }
        }
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), prerenderedRoutes()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    chunkSizeWarningLimit: 1200,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    css: false,
  },
})
