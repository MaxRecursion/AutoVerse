import { render, screen, waitFor } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AnimatedNumber } from './animated-number'

function reduceMotion(reduce: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) => ({ matches: reduce && query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList,
  )
}

afterEach(() => vi.restoreAllMocks())

describe('AnimatedNumber', () => {
  it('is its final value in server-rendered markup, even when it will count up in the browser', () => {
    // A server has no window; jsdom always does, so take it away for this one render.
    vi.stubGlobal('window', undefined)
    try {
      expect(renderToString(<AnimatedNumber value={4} from={0} />)).toContain('>4<')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('is one plain text node, so it reads and matches like any other number', () => {
    reduceMotion(true)
    render(
      <p data-testid="line">
        <AnimatedNumber value={3} /> of 9 done
      </p>,
    )
    expect(screen.getByTestId('line').textContent).toBe('3 of 9 done')
  })

  it('counts up from its start value to the final one', async () => {
    reduceMotion(false)
    render(<AnimatedNumber value={5} from={0} duration={0.2} />)
    await waitFor(() => expect(screen.getByText('5')).toBeInTheDocument(), { timeout: 2000 })
  })

  it('counts to a new value when it changes, and jumps there for reduced motion', async () => {
    reduceMotion(false)
    const { rerender } = render(<AnimatedNumber value={2} duration={0.2} />)
    expect(screen.getByText('2')).toBeInTheDocument()
    rerender(<AnimatedNumber value={7} duration={0.2} />)
    await waitFor(() => expect(screen.getByText('7')).toBeInTheDocument(), { timeout: 2000 })

    reduceMotion(true)
    rerender(<AnimatedNumber value={9} duration={0.2} />)
    await waitFor(() => expect(screen.getByText('9')).toBeInTheDocument())
  })
})
