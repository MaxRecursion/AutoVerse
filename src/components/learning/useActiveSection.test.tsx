import { act, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useActiveSection } from './useActiveSection'

function Probe({ ids }: { ids: string[] }) {
  return <p data-testid="active">{useActiveSection(ids) ?? 'none'}</p>
}

/** Pretends each section's top is at the given y (px from the viewport top). */
function layout(tops: Record<string, number>) {
  for (const [id, top] of Object.entries(tops)) {
    const el = document.getElementById(id)!
    el.getBoundingClientRect = () => ({ top, bottom: top + 400, left: 0, right: 0, width: 0, height: 400, x: 0, y: top, toJSON: () => ({}) })
  }
}

/** Scrolls, then lets the hook's animation-frame update run. */
const scroll = () =>
  act(async () => {
    window.dispatchEvent(new Event('scroll'))
    await new Promise((r) => requestAnimationFrame(() => r(null)))
  })

describe('useActiveSection', () => {
  it('is the last section whose top has passed the bars, however many are still in view', async () => {
    render(
      <>
        {['intro', 'scene', 'steps', 'quiz'].map((id) => (
          <section key={id} id={id} />
        ))}
        <Probe ids={['intro', 'scene', 'steps', 'quiz']} />
      </>,
    )
    // Reading the steps: the lab ("scene") is pinned under the bars, the quiz is far below.
    layout({ intro: -900, scene: 120, steps: 130, quiz: 1400 })
    await scroll()
    expect(screen.getByTestId('active')).toHaveTextContent('steps')
    // Scrolled to the quiz.
    layout({ intro: -2000, scene: 120, steps: -900, quiz: 100 })
    await scroll()
    expect(screen.getByTestId('active')).toHaveTextContent('quiz')
  })

  it('is none until a section reaches the bars', async () => {
    render(
      <>
        <section id="intro" />
        <Probe ids={['intro']} />
      </>,
    )
    layout({ intro: 500 })
    await scroll()
    expect(screen.getByTestId('active')).toHaveTextContent('none')
  })
})
