import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { useProgress } from '@/stores/progress'
import { getCourses } from './award'
import { CertificatesSection } from './CertificatesSection'

const renderSection = () => render(<MemoryRouter><CertificatesSection /></MemoryRouter>)

describe('CertificatesSection', () => {
  beforeEach(() => useProgress.getState().clearAll())

  it('shows every course with its progress and the next step towards it', () => {
    renderSection()
    const courses = getCourses()
    expect(screen.getAllByRole('article')).toHaveLength(courses.length)
    const first = within(screen.getByRole('article', { name: `Certificate: ${courses[0]!.title}` }))
    expect(first.getByText(new RegExp(`0 of ${courses[0]!.topics.length} lessons`))).toBeInTheDocument()
    expect(first.getByRole('link', { name: new RegExp(`^Next lesson: ${courses[0]!.topics[0]!.title}`) })).toBeInTheDocument()
    expect(first.getByRole('link', { name: 'What’s needed' })).toHaveAttribute('href', `/certificate/${courses[0]!.id}`)
    expect(screen.queryByRole('link', { name: 'View certificate' })).not.toBeInTheDocument()
  })

  it('shows an earned certificate with its date and a link to it', () => {
    const c = getCourses()[0]!
    useProgress.setState({ certificates: { [c.id]: { earnedAt: '2026-10-26T10:00:00.000Z' } } })
    renderSection()
    const card = within(screen.getByRole('article', { name: `Certificate: ${c.title}` }))
    expect(card.getByText(/Earned 26 Oct 2026/)).toBeInTheDocument()
    expect(card.getByRole('link', { name: 'View certificate' })).toHaveAttribute('href', `/certificate/${c.id}`)
    expect(card.queryByRole('link', { name: 'What’s needed' })).not.toBeInTheDocument()
  })
})

describe('CertificatesSection awarding', () => {
  it('awards a finished course it finds on arrival, so the card shows it as earned', () => {
    useProgress.getState().clearAll()
    const c = getCourses()[0]!
    const s = useProgress.getState()
    for (const t of c.topics) {
      s.setCompleted(t.id, true)
      if (t.quiz.length) s.recordQuiz(t.id, 1, t.quiz.length)
    }
    expect(useProgress.getState().certificates).toEqual({})
    renderSection()
    expect(useProgress.getState().certificates[c.id]).toBeDefined()
    expect(within(screen.getByRole('article', { name: `Certificate: ${c.title}` })).getByRole('link', { name: 'View certificate' })).toBeInTheDocument()
  })
})
