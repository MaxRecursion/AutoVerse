// @vitest-environment node
import handler from '../../../api/router.ts'

describe('Vercel function router', () => {
  it('dispatches the health route and rejects unknown routes', async () => {
    const health = await handler.fetch(new Request('https://example.test/api?route=health'))
    expect(health.status).toBe(200)
    await expect(health.json()).resolves.toEqual({ ok: true })

    const missing = await handler.fetch(new Request('https://example.test/api?route=anything'))
    expect(missing.status).toBe(404)
    await expect(missing.json()).resolves.toMatchObject({ code: 'NOT_FOUND' })
  })
})
