import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GlossaryEntry } from '@/lib/glossary'
import { useProgress } from '@/stores/progress'
import { orderForPractice } from './deck'
import { PracticeButton } from './PracticeButton'

const entry = (slug: string, term: string): GlossaryEntry => ({
  term,
  slug,
  definition: `${term} means something precise.`,
  equation: slug === 'torque' ? 'T = F × r' : undefined,
  topics: [{ id: 'torque-and-power', slug: 'torque-and-power', title: 'Torque and Power' }],
})
const ENTRIES = [entry('torque', 'Torque'), entry('slip', 'Slip'), entry('camshaft', 'Camshaft')]
const DEALT = orderForPractice(['torque', 'slip', 'camshaft'], {}, 1)
const termFor = (slug: string) => ENTRIES.find((e) => e.slug === slug)!.term

async function open() {
  render(
    <MemoryRouter>
      <PracticeButton entries={ENTRIES} />
    </MemoryRouter>,
  )
  await userEvent.click(screen.getByRole('button', { name: /Practise these terms/ }))
  return screen.findByRole('dialog', { name: 'Practise terms' })
}

beforeEach(() => {
  useProgress.getState().clearAll()
  vi.spyOn(Date, 'now').mockReturnValue(1)
})

describe('flashcards', () => {
  it('opens on the first card of the deal, showing the term and not yet the meaning', async () => {
    const dialog = await open()
    expect(within(dialog).getByText(termFor(DEALT[0]!), { selector: 'p.font-display' })).toBeInTheDocument()
    expect(within(dialog).getByText('0 of 3 known')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /Show meaning/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('flips with the button and with Space, and shows where the term is explained', async () => {
    const dialog = await open()
    await userEvent.click(within(dialog).getByRole('button', { name: /Show meaning/ }))
    const flip = within(dialog).getByRole('button', { name: /Show term/ })
    expect(flip).toHaveAttribute('aria-pressed', 'true')
    expect(within(dialog).getByRole('link', { name: 'Torque and Power' })).toHaveAttribute('href', '/topics/torque-and-power')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('flips on Space when focus is on the card area, not on a button', async () => {
    const dialog = await open()
    dialog.focus()
    await userEvent.keyboard(' ')
    expect(within(dialog).getByRole('button', { name: /Show term/ })).toBeInTheDocument()
  })

  it('records "Got it" (right arrow) and "Again" (left arrow) per term, and brings an "Again" card back', async () => {
    const dialog = await open()
    dialog.focus()
    const [first, second] = DEALT as [string, string, string]
    await userEvent.keyboard('{ArrowLeft}')
    expect(useProgress.getState().practice[first]).toMatchObject({ known: false })
    await userEvent.keyboard('{ArrowRight}')
    expect(useProgress.getState().practice[second]).toMatchObject({ known: true })
    expect(within(dialog).getByText('1 of 3 known')).toBeInTheDocument()
  })

  it('finishes when every term has been known, summarises the round, and can deal again', async () => {
    const dialog = await open()
    dialog.focus()
    await userEvent.keyboard('{ArrowLeft}{ArrowRight}{ArrowRight}{ArrowRight}')
    const summary = await within(dialog).findByTestId('flashcard-summary')
    expect(summary).toHaveTextContent('3 terms covered')
    expect(summary).toHaveTextContent('asked to see one card again')
    expect(Object.values(useProgress.getState().practice).every((r) => r.known)).toBe(true)
    await userEvent.click(within(summary).getByRole('button', { name: /Practise again/ }))
    expect(within(dialog).getByText('0 of 3 known')).toBeInTheDocument()
  })

  it('does nothing for an empty set of terms', () => {
    render(
      <MemoryRouter>
        <PracticeButton entries={[]} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: /Practise these terms/ })).toBeDisabled()
  })
})
