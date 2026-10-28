import type { IncomingMessage } from 'node:http'
import { defineConfig, type Plugin } from 'vitest/config'
import type { ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { handleAnalyze } from './lib/server/routes/analyze.ts'
import { handleHealth } from './lib/server/routes/health.ts'
import { handleSource } from './lib/server/routes/source.ts'

function localApi(): Plugin {
  return {
    name: 'archaeologist-local-api',
    configureServer(server) { registerApi(server) },
    configurePreviewServer(server) { registerApi(server) },
  }
}

function registerApi(server: Pick<ViteDevServer, 'middlewares'>) {
      const routes: Record<string, (request: Request) => Promise<Response>> = {
        '/api/analyze': handleAnalyze,
        '/api/source': handleSource,
        '/api/health': handleHealth,
      }
      server.middlewares.use(async (req, res, next) => {
        const pathname = new URL(req.url || '/', 'http://localhost').pathname
        const handler = routes[pathname]
        if (!handler) return next()
        if (req.method !== 'POST' && pathname !== '/api/health') {
          res.statusCode = 405
          res.setHeader('Allow', 'POST')
          res.end('Method not allowed')
          return
        }
        try {
          const body = await readBody(req, 8_192)
          const response = await handler(new Request(`http://localhost${req.url}`, {
            method: req.method,
            headers: { 'content-type': req.headers['content-type'] || 'application/json' },
            body: req.method === 'POST' ? body : undefined,
          }))
          res.statusCode = response.status
          response.headers.forEach((value, key) => res.setHeader(key, value))
          res.end(Buffer.from(await response.arrayBuffer()))
        } catch (error) {
          if (res.headersSent) return next(error)
          res.statusCode = error instanceof BodyLimitError ? 413 : 500
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: error instanceof BodyLimitError ? 'Request body is too large.' : 'The local analysis request failed.' }))
        }
      })
}

class BodyLimitError extends Error {}

async function readBody(req: IncomingMessage, maxBytes: number): Promise<string> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk)
    size += buffer.byteLength
    if (size > maxBytes) throw new BodyLimitError()
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export default defineConfig({
  plugins: [react(), tailwindcss(), localApi()],
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'lib/**/*.test.ts'],
    css: false,
  },
})
