import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { labs } from '@/features/labs/registry'
import { resolvePathProgress } from '@/features/progress/paths'
import { OPEN_SEARCH_EVENT, type OpenSearchDetail } from '@/features/search/events'
import { categories, getTopic, learningPaths } from '@/lib/content'
import HomePage from '@/pages/HomePage'
import { useProgress } from '@/stores/progress'
import { HOME_DOCUMENT_TITLE, pickBeginnerPath, startLearningHref } from './homeData'

// The real hero pulls in three.js; a stand-in keeps this a page-level test. `crash` exercises the error fallback.
const hero = vi.hoisted(() => ({ crash: false }))
vi.mock('@/features/engine-lab/EngineHero', () => ({
  default: function MockEngineHero() {
    if (hero.crash) throw new Error('chunk failed')
    return <div data-testid="engine-hero">live engine</div>
  },
}))

function renderHome() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  )
}

const resetProgress = () => useProgress.setState({ recent: [], completed: {}, bookmarks: [], quizScores: {} })

beforeEach(() => {
  hero.crash = false
  resetProgress()
})
afterEach(() => vi.restoreAllMocks())

describe('HomePage', () => {
  it('renders the hero heading, the three calls to action and the lazy engine', async () => {
    renderHome()
    expect(screen.getByRole('heading', { level: 1, name: 'Understand Every Moving Part.' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Explore the Car' })).toHaveAttribute('href', '/explore')
    expect(screen.getByRole('link', { name: 'Explore Systems' })).toHaveAttribute('href', '/map')

    const path = pickBeginnerPath(learningPaths)!
    const expectedStart = startLearningHref(resolvePathProgress(path, getTopic, {}).next)
    expect(screen.getByRole('link', { name: 'Start Learning' })).toHaveAttribute('href', expectedStart)

    expect(await screen.findByTestId('engine-hero')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open the engine lab' })).toHaveAttribute('href', '/labs/engine')
    expect(screen.getByRole('list', { name: 'The four strokes, in order' })).toBeInTheDocument()
    expect(document.title).toBe(HOME_DOCUMENT_TITLE)
  })

  it('continues at the next unfinished lesson when the learner has completed a lesson', () => {
    const path = pickBeginnerPath(learningPaths)!
    const first = resolvePathProgress(path, getTopic, {}).topics[0]
    useProgress.setState({ completed: { [first.id]: '2026-01-01T00:00:00.000Z' } })
    renderHome()
    const expected = startLearningHref(resolvePathProgress(path, getTopic, { [first.id]: 'x' }).next)
    expect(screen.getByRole('link', { name: 'Continue Learning' })).toHaveAttribute('href', expected)
  })

  it('links every category with its lesson count', () => {
    renderHome()
    const section = screen.getByRole('region', { name: 'Take the car apart, system by system' })
    const hrefs = within(section)
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'))
    for (const c of categories) {
      expect(hrefs).toContain(`/learn/${c.slug}`)
      expect(within(section).getByText(c.title)).toBeInTheDocument()
    }
  })

  it('features every registered lab with a link to it', () => {
    renderHome()
    const section = screen.getByRole('region', { name: 'Run the machinery yourself' })
    for (const lab of labs.slice(0, 4)) {
      expect(within(section).getByRole('link', { name: lab.title })).toHaveAttribute('href', `/labs/${lab.id}`)
    }
    expect(within(section).getByRole('link', { name: /All labs/ })).toHaveAttribute('href', '/labs')
  })

  it('shows the beginner path with its first lesson marked as the start', () => {
    renderHome()
    const path = pickBeginnerPath(learningPaths)!
    const { topics: stops } = resolvePathProgress(path, getTopic, {})
    const section = screen.getByRole('region', { name: /how a car moves/i })
    expect(within(section).getAllByRole('listitem').length).toBeGreaterThanOrEqual(stops.length)
    expect(within(section).getByRole('link', { name: new RegExp(`^Start with ${stops[0].title}`) })).toHaveAttribute(
      'href',
      `/topics/${stops[0].slug}`,
    )
  })

  it('opens the search palette, optionally pre-filled', async () => {
    const user = userEvent.setup()
    const events: (string | undefined)[] = []
    const onOpen = (e: Event) => events.push((e as CustomEvent<OpenSearchDetail>).detail.query)
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen)
    try {
      renderHome()
      await user.click(screen.getByRole('button', { name: /Search lessons, labs and parts/ }))
      await user.click(screen.getByRole('button', { name: 'Search for Piston' }))
      expect(events).toEqual([undefined, 'Piston'])
    } finally {
      window.removeEventListener(OPEN_SEARCH_EVENT, onOpen)
    }
  })

  it('shows recent lessons only after a lesson has been viewed', () => {
    const topic = getTopic('four-stroke-cycle')!
    const { unmount } = renderHome()
    expect(screen.queryByRole('region', { name: 'Your recent lessons' })).toBeNull()
    unmount()

    act(() => useProgress.setState({ recent: [{ topicId: topic.id, at: new Date().toISOString() }, { topicId: 'not-a-topic', at: '' }] }))
    renderHome()
    const section = screen.getByRole('region', { name: 'Your recent lessons' })
    expect(within(section).getByRole('link', { name: new RegExp(topic.title) })).toHaveAttribute('href', `/topics/${topic.slug}`)
    expect(within(section).getAllByRole('listitem')).toHaveLength(1)
  })

  it('resumes the path of the most recently visited lesson across the home actions', () => {
    const recentTopic = getTopic('pistons-and-crankshaft')!
    useProgress.setState({ recent: [{ topicId: recentTopic.id, at: new Date().toISOString() }] })
    renderHome()

    expect(screen.getByRole('link', { name: 'Continue Learning' })).toHaveAttribute('href', '/topics/four-stroke-cycle')
    const pathSection = screen.getByRole('region', { name: 'Inside the engine' })
    expect(within(pathSection).getByRole('link', { name: /Continue with The Four-Stroke Cycle/ })).toHaveAttribute('href', '/topics/four-stroke-cycle')
  })

  it('keeps the page usable when the 3D hero cannot load', async () => {
    hero.crash = true
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    renderHome()
    expect(await screen.findByText('The live engine couldn’t start in this browser.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Try the engine lab' })).toHaveAttribute('href', '/labs/engine')
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })
})
