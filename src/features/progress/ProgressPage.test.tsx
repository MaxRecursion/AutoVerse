import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastHost } from '@/components/layout/ToastHost'
import ProgressPage from '@/pages/ProgressPage'
import { useProgress } from '@/stores/progress'
import { useToasts } from '@/stores/toasts'

vi.mock('@/lib/content', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/content')>()
  const { withFixtureContent, fixtureTopics, fixtureComponents } = await import('@/components/learning/__fixtures__/content')
  const { LearningPathSchema } = await import('@/lib/schemas')
  return {
    ...withFixtureContent(actual, { topics: fixtureTopics, components: fixtureComponents }),
    learningPaths: [
      LearningPathSchema.parse({
        id: 'fixture-path',
        title: 'Fixture path',
        summary: 'Two written lessons and one that is not written yet.',
        level: 'beginner',
        order: 1,
        topicIds: ['fixture-engine-cycle', 'lesson-not-written-yet', 'fixture-ignition'],
      }),
      LearningPathSchema.parse({
        id: 'next-path',
        title: 'Next path',
        summary: 'One more topic.',
        level: 'intermediate',
        order: 2,
        topicIds: ['fixture-outline', 'fixture-engine-cycle'],
      }),
    ],
  }
})

const renderPage = () =>
  render(
    <MemoryRouter>
      <ProgressPage />
      <ToastHost />
    </MemoryRouter>,
  )

describe('ProgressPage', () => {
  beforeEach(() => {
    useProgress.getState().clearAll()
    useToasts.getState().clear()
  })

  it('explains that progress stays in this browser and shows an empty state', () => {
    renderPage()
    expect(screen.getByText(/stored only in this browser/i)).toBeInTheDocument()
    expect(screen.getByText('Nothing here yet.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Clear all progress/ })).toBeDisabled()
  })

  it('lists recent, bookmarked, completed lessons, quiz scores and path progress (skipping unwritten lessons)', () => {
    const s = useProgress.getState()
    s.visit('fixture-ignition')
    s.visit('removed-topic')
    s.toggleBookmark('fixture-outline')
    s.setCompleted('fixture-engine-cycle', true)
    s.recordQuiz('fixture-engine-cycle', 1, 2)
    renderPage()

    expect(within(screen.getByRole('region', { name: 'Recently viewed' })).getAllByRole('link')).toHaveLength(1)
    expect(within(screen.getByRole('region', { name: 'Bookmarks' })).getByRole('link', { name: /Fixture outline/ })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Completed lessons' })).getByRole('link', { name: /Fixture engine cycle/ })).toBeInTheDocument()
    expect(within(screen.getByRole('table')).getByText('1/2')).toBeInTheDocument()

    const path = screen.getByRole('article', { name: 'Fixture path' })
    expect(within(path).getByText('1 of 2 lessons')).toBeInTheDocument()
    expect(within(path).getByText(/1 more lesson is planned/)).toBeInTheDocument()
    expect(within(path).getByRole('link', { name: /Continue with Fixture ignition/ })).toHaveAttribute('href', '/topics/fixture-ignition')
  })

  it('celebrates a completed path and points to the next one', () => {
    const s = useProgress.getState()
    s.visit('fixture-ignition')
    s.setCompleted('fixture-engine-cycle', true)
    s.setCompleted('fixture-ignition', true)
    renderPage()

    const path = screen.getByRole('article', { name: 'Fixture path' })
    expect(within(path).getByRole('status')).toHaveTextContent('All available lessons complete')
    expect(within(path).getByText('You finished 2 lessons in Fixture path.')).toBeInTheDocument()
    expect(within(path).getByRole('link', { name: /Start next path: Next path/ })).toHaveAttribute('href', '/topics/fixture-outline')
  })

  it('removes a bookmark and clears everything at once, each with an Undo toast instead of a confirm step', async () => {
    const user = userEvent.setup()
    useProgress.getState().toggleBookmark('fixture-outline')
    useProgress.getState().toggleBookmark('fixture-ignition')
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Remove bookmark: Fixture outline' }))
    expect(useProgress.getState().bookmarks).toEqual(['fixture-ignition'])
    expect(screen.getByText('Bookmark removed')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(useProgress.getState().bookmarks).toEqual(['fixture-ignition', 'fixture-outline'])
    await waitFor(() => expect(screen.queryByText('Bookmark removed')).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: /Clear all progress/ }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(useProgress.getState().bookmarks).toEqual([])
    expect(screen.getByText('Nothing here yet.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(useProgress.getState().bookmarks).toEqual(['fixture-ignition', 'fixture-outline'])
  })
})
