import { act, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { layerOf } from '@/features/progress/curriculum'
import { pioneers, topics } from '@/lib/content'
import { useProgress } from '@/stores/progress'
import { LearningJourney } from './LearningJourney'

const renderJourney = () => render(<MemoryRouter><LearningJourney /></MemoryRouter>)
const count = (layer: string) => topics.filter((t) => layerOf(t) === layer).length

describe('LearningJourney', () => {
  beforeEach(() => useProgress.getState().clearAll())

  it('lays out the descent: surface, mechanism, engineering, then the stories', () => {
    renderJourney()
    const cards = screen.getAllByRole('listitem')
    expect(cards).toHaveLength(4)
    expect(within(cards[0]!).getByText('Get the idea')).toBeInTheDocument()
    expect(within(cards[1]!).getByText('See it work')).toBeInTheDocument()
    expect(within(cards[2]!).getByText('Go deeper')).toBeInTheDocument()
    expect(within(cards[3]!).getByText('Meet the engineers')).toBeInTheDocument()
    expect(within(cards[3]!).getByText(new RegExp(`${pioneers.length} engineers`))).toBeInTheDocument()
  })

  it('shows live progress per depth and updates it', () => {
    renderJourney()
    expect(within(screen.getAllByRole('listitem')[0]!).getByText(`0 of ${count('surface')} lessons`)).toBeInTheDocument()
    act(() => useProgress.getState().setCompleted('how-a-car-works', true))
    expect(within(screen.getAllByRole('listitem')[0]!).getByText(`1 of ${count('surface')} lessons`)).toBeInTheDocument()
  })

  it('gives each depth one obvious next step', () => {
    renderJourney()
    const links = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(links[0]).toBe('/topics/how-a-car-works')
    expect(links[1]).toBe('/labs')
    expect(links[2]).toMatch(/^\/topics\//)
    expect(links[3]).toBe('/pioneers')
  })
})
