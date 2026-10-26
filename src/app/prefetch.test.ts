import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RouteObject } from 'react-router'
import { HOVER_MS, installRoutePrefetch } from './prefetch'

function setup() {
  const page = vi.fn(async () => ({ Component: () => null }))
  const lesson = vi.fn(async () => ({ Component: () => null }))
  const routes: RouteObject[] = [{ path: '/', children: [{ path: 'glossary', lazy: page }, { path: 'topics/:slug', lazy: lesson }] }]
  document.body.innerHTML = `
    <a id="glossary" href="/glossary"><span>Glossary</span></a>
    <a id="lesson-a" href="/topics/a">A</a>
    <a id="lesson-b" href="/topics/b">B</a>
    <a id="away" href="https://example.org/glossary">Elsewhere</a>
    <a id="tab" href="/glossary" target="_blank">New tab</a>`
  const cleanup = installRoutePrefetch(routes)
  const link = (id: string) => document.getElementById(id)!
  return { page, lesson, cleanup, link }
}

describe('route prefetch on link intent', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('loads the route code after a short hover, not when the pointer only passes by', () => {
    const { page, cleanup, link } = setup()
    link('glossary').querySelector('span')!.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))
    vi.advanceTimersByTime(HOVER_MS / 2)
    link('glossary').dispatchEvent(new PointerEvent('pointerout', { bubbles: true }))
    vi.advanceTimersByTime(HOVER_MS)
    expect(page).not.toHaveBeenCalled()

    link('glossary').dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))
    vi.advanceTimersByTime(HOVER_MS)
    expect(page).toHaveBeenCalledOnce()
    cleanup()
  })

  it('loads on focus at once, and each route module only once whatever its params', () => {
    const { lesson, cleanup, link } = setup()
    link('lesson-a').dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    link('lesson-b').dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    expect(lesson).toHaveBeenCalledOnce()
    cleanup()
  })

  it('ignores other sites and links that open a new tab', () => {
    const { page, cleanup, link } = setup()
    for (const id of ['away', 'tab']) link(id).dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    expect(page).not.toHaveBeenCalled()
    cleanup()
  })
})
