import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { HeroAnnotations } from './HeroAnnotations'
import { HERO_ZONES } from './homeData'

const webgl = vi.hoisted(() => ({ available: true }))
vi.mock('@/lib/webgl', () => ({ hasWebGL: () => webgl.available }))

describe('HeroAnnotations', () => {
  it('describes contiguous, ordered bands of the frame height', () => {
    for (const [i, z] of HERO_ZONES.entries()) {
      expect(z.from).toBeGreaterThanOrEqual(0)
      expect(z.to).toBeLessThanOrEqual(1)
      expect(z.to).toBeGreaterThan(z.from)
      if (i > 0) expect(z.from).toBeCloseTo(HERO_ZONES[i - 1].to)
    }
  })

  it('draws one decorative callout per zone over the WebGL model', () => {
    webgl.available = true
    const { container } = render(<HeroAnnotations />)
    const zones = screen.getAllByTestId('hero-zone')
    expect(zones).toHaveLength(HERO_ZONES.length)
    expect(zones[0]).toHaveStyle({ top: '12%', height: '18%' })
    for (const z of HERO_ZONES) expect(screen.getByText(z.label)).toBeInTheDocument()
    // Hidden from assistive tech (the canvas carries the description) and never in the pointer's way.
    const root = container.firstElementChild!
    expect(root).toHaveAttribute('aria-hidden', 'true')
    expect(root).toHaveClass('pointer-events-none')
  })

  it('stays out of the 2D fallback, which has its own labels', () => {
    webgl.available = false
    const { container } = render(<HeroAnnotations />)
    expect(container).toBeEmptyDOMElement()
  })
})
