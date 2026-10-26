import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { topics } from '@/lib/content'
import type { LabStore } from '@/lib/simulation/labStore'
import { usePreferences } from '@/stores/preferences'
import { useProgress } from '@/stores/progress'
import { useToasts } from '@/stores/toasts'
import { fixtureOutlineTopic, fixtureTopic } from './__fixtures__/content'
import { LessonTemplate } from './LessonTemplate'

const lab = vi.hoisted(() => ({ store: null as LabStore | null }))

vi.mock('@/lib/content', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/content')>()
  const { withFixtureContent, fixtureTopics, fixtureComponents } = await import('./__fixtures__/content')
  return withFixtureContent(actual, { topics: fixtureTopics, components: fixtureComponents })
})

// A registered fixture lab with two cues; the 3D view itself is replaced (jsdom has no WebGL).
vi.mock('@/features/labs/registry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/labs/registry')>()
  const { defineLabConfig } = await import('@/lib/simulation/labStore')
  const fixtureLab = {
    ...actual.labs[0],
    id: 'fixture-lab',
    title: 'Fixture Laboratory',
    shortTitle: 'Fixture',
    summary: 'A fixture lab for tests.',
    config: defineLabConfig({
      id: 'fixture-lab',
      cues: [
        { id: 'intake', label: 'Intake', progress: 0.1 },
        { id: 'compression', label: 'Compression', progress: 0.4 },
      ],
      deriveCue: (p) => (p < 0.25 ? 'intake' : 'compression'),
    }),
  }
  return { ...actual, labs: [...actual.labs, fixtureLab], getLab: (id: string) => (id === 'fixture-lab' ? fixtureLab : actual.getLab(id)) }
})

vi.mock('@/features/labs/useLabInstance', async () => {
  const { useState } = await import('react')
  const { createLabStore } = await import('@/lib/simulation/labStore')
  const { getLab } = await import('@/features/labs/registry')
  return {
    useLabInstance: (labId: string) => {
      const [store] = useState(() => {
        const def = getLab(labId)
        return def ? createLabStore(def.config) : null
      })
      lab.store = store
      return store
    },
  }
})

vi.mock('@/features/labs/LabHost', () => ({
  LabHost: ({ labId }: { labId: string }) => <div data-testid="lab-host">{labId}</div>,
  LabSkeleton: () => null,
}))

function renderLesson(topic = fixtureTopic) {
  return render(
    <MemoryRouter>
      <TooltipProvider>
        <LessonTemplate key={topic.id} topic={topic} />
      </TooltipProvider>
    </MemoryRouter>,
  )
}

// The finish card is a closing panel, not a numbered lesson section.
const sectionHeadings = () =>
  screen
    .getAllByRole('heading', { level: 2 })
    .filter((h) => h.id !== 'finish-heading')
    .map((h) => h.textContent)

describe('LessonTemplate', () => {
  beforeEach(() => {
    useProgress.getState().clearAll()
    usePreferences.getState().setLevel('beginner')
    useToasts.getState().clear()
    lab.store = null
  })

  it('renders every section of a complete lesson, in order', () => {
    renderLesson()
    expect(screen.getByRole('heading', { level: 1, name: 'Fixture engine cycle' })).toBeInTheDocument()
    expect(sectionHeadings()).toEqual([
      'The idea',
      'What you will learn',
      'Try it yourself',
      'Step by step',
      'Key components',
      'How it flows',
      'Go deeper',
      'Common questions',
      'Check your understanding',
      'Related lessons',
      'Sources & attribution',
    ])
    // Breadcrumbs: Learn › Category › Topic.
    const crumbs = within(screen.getByRole('navigation', { name: 'Breadcrumb' }))
    expect(crumbs.getByRole('link', { name: 'Learn' })).toHaveAttribute('href', '/learn')
    expect(crumbs.getByRole('link', { name: 'Engine' })).toHaveAttribute('href', '/learn/engine')
    expect(screen.getByTestId('lab-host')).toHaveTextContent('fixture-lab')
    // Equation in mono, licence and original-content note, external source labelled.
    expect(screen.getByText('CR = (Vs + Vc) / Vc').tagName).toBe('CODE')
    expect(screen.getByText(/original AutoVerse writing/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Example further reading.*opens in a new tab/i })).toHaveAttribute('target', '_blank')
    // Components that do not exist are skipped.
    const parts = within(screen.getByRole('region', { name: 'Key components' }))
    expect(parts.getAllByRole('button').map((b) => b.querySelector('span span')?.textContent)).toEqual(['Fixture piston', 'Fixture crankshaft'])
    expect(screen.queryByText(/fixture-missing-part/)).not.toBeInTheDocument()
  })

  it('keeps both explanation levels in the page: the other one is a Go deeper panel', () => {
    renderLesson()
    const deeper = within(screen.getByRole('region', { name: 'Go deeper' }))
    expect(deeper.getByText('The engineering explanation')).toBeInTheDocument()
    expect(deeper.getByText('Technical intro paragraph with thermodynamic detail.')).toBeInTheDocument()
    act(() => usePreferences.getState().setLevel('technical'))
    expect(deeper.getByText('The plain-language version')).toBeInTheDocument()
    expect(deeper.getByText('Beginner intro paragraph one.')).toBeInTheDocument()
  })

  it('answers common questions in the page, each question a heading', () => {
    renderLesson()
    const questions = within(screen.getByRole('region', { name: 'Common questions' }))
    expect(questions.getByRole('heading', { level: 3, name: 'Why does the cycle take two crank turns?' })).toBeInTheDocument()
    expect(questions.getByText(/half a crankshaft turn/)).toBeInTheDocument()
  })

  it('records the visit on mount', () => {
    renderLesson()
    expect(useProgress.getState().recent[0]?.topicId).toBe('fixture-engine-cycle')
  })

  it('switches explanation level without changing the active step', async () => {
    const user = userEvent.setup()
    renderLesson()
    expect(screen.getByText('Beginner intro paragraph one.')).toBeInTheDocument()
    expect(screen.getByText('Beginner intake text.')).toBeInTheDocument()
    act(() => lab.store?.getState().seekCue('compression'))
    await user.click(screen.getByRole('radio', { name: /^tech/i }))
    expect(screen.getByText('Technical intro paragraph with thermodynamic detail.')).toBeInTheDocument()
    expect(screen.getByText('Technical compression text.').closest('li')).toHaveAttribute('aria-current', 'step')
    expect(usePreferences.getState().level).toBe('technical')
  })

  it('syncs steps with the lab: "Show in 3D" seeks the cue and the playing step is highlighted', async () => {
    const user = userEvent.setup()
    renderLesson()
    const intake = screen.getByText('Beginner intake text.').closest('li')
    const compression = screen.getByText('Beginner compression text.').closest('li')
    expect(intake).toHaveAttribute('aria-current', 'step')

    await user.click(screen.getByRole('button', { name: 'Show in 3D: Compression stroke' }))
    expect(lab.store?.getState().cue).toBe('compression')
    expect(lab.store?.getState().playing).toBe(false)
    expect(compression).toHaveAttribute('aria-current', 'step')
    expect(intake).not.toHaveAttribute('aria-current')

    // Animation → text: the lab advancing into another cue moves the highlight.
    act(() => lab.store?.getState().seek(0.05))
    expect(intake).toHaveAttribute('aria-current', 'step')
    // Steps without a cue offer no 3D action.
    expect(screen.queryByRole('button', { name: /Putting it together.*3D/ })).not.toBeInTheDocument()
  })

  it('selects components in the lab store, both ways', async () => {
    const user = userEvent.setup()
    renderLesson()
    const parts = within(screen.getByRole('region', { name: 'Key components' }))
    const card = parts.getByRole('button', { name: /Fixture piston/ })
    await user.click(card)
    expect(lab.store?.getState().selectedId).toBe('fixture-piston')
    expect(card).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Cast aluminium alloy')).toBeInTheDocument()
    act(() => lab.store?.getState().select('fixture-crankshaft'))
    expect(parts.getByRole('button', { name: /Fixture crankshaft/ })).toHaveAttribute('aria-pressed', 'true')
    expect(card).toHaveAttribute('aria-pressed', 'false')
    // The step's part chip reflects the same selection.
    const steps = within(screen.getByRole('region', { name: 'Step by step' }))
    await user.click(steps.getByRole('button', { name: 'Fixture piston' }))
    expect(card).toHaveAttribute('aria-pressed', 'true')
  })

  it('bookmarks and completes the lesson', async () => {
    const user = userEvent.setup()
    renderLesson()
    await user.click(screen.getAllByRole('button', { name: 'Bookmark' })[0])
    expect(useProgress.getState().bookmarks).toContain('fixture-engine-cycle')
    await user.click(screen.getAllByRole('button', { name: 'Mark complete' })[0])
    expect(useProgress.getState().completed['fixture-engine-cycle']).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Completed' })[0]).toHaveAttribute('aria-pressed', 'true')
  })

  it('runs the quiz with immediate feedback, records the score and retries', async () => {
    const user = userEvent.setup()
    renderLesson()
    const q1 = screen.getByTestId('quiz-question-q1')
    await user.click(within(q1).getByRole('button', { name: /Four/ }))
    expect(within(q1).getByText('Correct.')).toBeInTheDocument()
    expect(within(q1).getByText('Intake, compression, power, exhaust.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Next question/ }))

    const q2 = screen.getByTestId('quiz-question-q2')
    await user.click(within(q2).getByRole('button', { name: /The spark/ }))
    expect(within(q2).getByText('Not quite.')).toBeInTheDocument()
    expect(useProgress.getState().quizScores['fixture-engine-cycle']).toMatchObject({ score: 1, total: 2 })

    await user.click(screen.getByRole('button', { name: /See your score/ }))
    const summary = screen.getByText('Your score').parentElement as HTMLElement
    expect(summary).toHaveTextContent('1 / 2')
    await user.click(screen.getByRole('button', { name: /Retry quiz/ }))
    expect(screen.getByTestId('quiz-question-q1')).toBeInTheDocument()
    expect(screen.getByText('0 of 2 answered')).toBeInTheDocument()
  })

  it('highlights an event step (not its enclosing stroke) after "Show in 3D" in a real engine lesson', async () => {
    // Real lessons whose steps name an event cue that sits inside another cue's span (e.g. spark during compression).
    const topic = topics.find((t) => t.labId === 'engine' && t.steps.some((st) => st.cue === 'spark') && t.steps.some((st) => st.cue === 'compression'))
    if (!topic) return // Engine lessons are authored elsewhere; nothing to check until they exist.
    const user = userEvent.setup()
    renderLesson(topic)
    const spark = topic.steps.find((st) => st.cue === 'spark')!
    await user.click(screen.getByRole('button', { name: `Show in 3D: ${spark.title}` }))
    expect(lab.store?.getState().playing).toBe(false)
    expect(document.getElementById(`step-${spark.id}`)).toHaveAttribute('aria-current', 'step')
    expect(document.querySelectorAll('[aria-current="step"]')).toHaveLength(1)
  })

  // Smoke test over every lesson in the bundle (authored concurrently by other workstreams).
  it.each(topics.map((t) => [t.id, t] as const))('renders the real lesson “%s” without errors', (_, topic) => {
    const { unmount } = renderLesson(topic)
    expect(screen.getByRole('heading', { level: 1, name: topic.title })).toBeInTheDocument()
    const headings = sectionHeadings()
    expect(headings[0]).toBe('The idea')
    expect(headings.at(-1)).toBe('Sources & attribution')
    if (topic.quiz.length) expect(headings).toContain('Check your understanding')
    if (topic.labId) expect(screen.getByTestId('lab-host')).toHaveTextContent(topic.labId)
    unmount()
  })

  it('shows the outline banner and hides empty sections', () => {
    renderLesson(fixtureOutlineTopic)
    expect(screen.getByRole('note')).toHaveTextContent(/Outline only/)
    const headings = sectionHeadings()
    expect(headings.slice(0, 2)).toEqual(['The idea', 'What you will learn'])
    expect(headings.at(-1)).toBe('Sources & attribution')
    // "Go deeper" stays: it always offers the other explanation level.
    for (const empty of ['Try it yourself', 'How it flows', 'Key components', 'Step by step', 'Common questions', 'Check your understanding']) {
      expect(headings).not.toContain(empty)
    }
    expect(screen.queryByTestId('lab-host')).not.toBeInTheDocument()
  })

  describe('lesson stages', () => {
    const id = fixtureTopic.id
    const stepIds = fixtureTopic.steps.map((st) => st.id)
    const railButton = (name: RegExp) => within(screen.getByRole('navigation', { name: 'Lesson stages' })).getByRole('button', { name })

    it('shows the stages this lesson actually has, in teaching order', () => {
      renderLesson()
      const rail = within(screen.getByRole('navigation', { name: 'Lesson stages' }))
      expect(rail.getAllByRole('button')).toHaveLength(4)
      for (const label of [/Overview/, /See it work/, /Go deeper/, /Check/]) expect(rail.getByRole('button', { name: label })).toBeInTheDocument()
      expect(rail.queryByRole('button', { name: /Story/ })).not.toBeInTheDocument()
      // Nothing is ticked on the learner's behalf.
      expect(railButton(/Overview/)).not.toHaveAccessibleName(/done/)
      expect(railButton(/Overview/)).toHaveAttribute('aria-current', 'true')
    })

    it('counts "Show in 3D" as reading that step and using the lab', async () => {
      const user = userEvent.setup()
      renderLesson()
      await user.click(screen.getByRole('button', { name: 'Show in 3D: Intake stroke' }))
      const signals = useProgress.getState().lessons[id]
      expect(signals?.steps).toEqual(['intake'])
      expect(signals?.lab).toBe(true)
      // One step of three: the stage is still open and says what is left.
      expect(railButton(/See it work/)).toHaveAccessibleName(/2 steps left to read/)
    })

    it('only completes "See it work" once every step is read and the lab was used', () => {
      renderLesson()
      const s = useProgress.getState()
      act(() => {
        stepIds.slice(0, 2).forEach((step) => s.seeStep(id, step))
        s.signal(id, 'lab')
      })
      expect(railButton(/See it work/)).not.toHaveAccessibleName(/done/)
      act(() => s.seeStep(id, stepIds[2]!))
      expect(railButton(/See it work/)).toHaveAccessibleName(/done/)
    })

    it('treats the Technical level as going deeper, but only when the reader switches to it', async () => {
      const user = userEvent.setup()
      renderLesson()
      expect(useProgress.getState().lessons[id]?.deeper).toBeUndefined()
      await user.click(screen.getByRole('radio', { name: /^tech/i }))
      expect(useProgress.getState().lessons[id]?.deeper).toBe(true)
      expect(railButton(/Go deeper/)).toHaveAccessibleName(/done/)
    })

    it('offers Finish once the core stages are done, and finishing completes the lesson with feedback', async () => {
      const user = userEvent.setup()
      renderLesson()
      expect(screen.queryByRole('button', { name: /^Finish/ })).not.toBeInTheDocument()
      const s = useProgress.getState()
      act(() => {
        s.signal(id, 'overview')
        stepIds.forEach((step) => s.seeStep(id, step))
        s.signal(id, 'lab')
        s.recordQuiz(id, 2, 2)
      })
      // Core stages done → a single "ready" acknowledgement, and the Finish control appears.
      expect(useToasts.getState().toasts.map((t) => t.title)).toContain('Core stages complete')
      await user.click(screen.getAllByRole('button', { name: /^Finish/ })[0]!)
      expect(useProgress.getState().completed[id]).toBeTruthy()
      expect(useToasts.getState().toasts.at(-1)?.title).toMatch(/^Lesson complete/)
      expect(screen.getByRole('heading', { name: 'Lesson complete' })).toBeInTheDocument()
    })

    it('lets a learner finish early, but says so', async () => {
      const user = userEvent.setup()
      renderLesson()
      await user.click(screen.getByRole('button', { name: 'Mark complete anyway' }))
      expect(useProgress.getState().completed[id]).toBeTruthy()
    })

    it('does not toast for progress that already existed when the lesson opened', () => {
      const s = useProgress.getState()
      s.signal(id, 'overview')
      renderLesson()
      expect(useToasts.getState().toasts).toEqual([])
    })
  })
})
