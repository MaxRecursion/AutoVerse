import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { summariseStages, type Stage } from '@/features/progress/stages'
import { LessonIsland } from './LessonIsland'

const stage = (id: Stage['id'], label: string, done: boolean, optional = false): Stage => ({
  id,
  label,
  optional,
  done,
  target: `${id}-section`,
  detail: done ? `${label} done.` : `${label} still to do.`,
})

const SECTIONS = [
  { id: 'intro-section', title: 'The idea' },
  { id: 'see-section', title: 'Step by step' },
  { id: 'check-section', title: 'Check your understanding' },
]

function setup({ done = [true, false, false], complete = false, onFinish = vi.fn() } = {}) {
  const stages = [stage('overview', 'Overview', done[0]!), stage('see', 'See it work', done[1]!), stage('check', 'Check', done[2]!), stage('story', 'Story', false, true)]
  render(
    <>
      <LessonIsland sections={SECTIONS} stages={stages} summary={summariseStages(stages)} complete={complete} onFinish={onFinish} />
      {SECTIONS.map((s) => (
        <section key={s.id} id={s.id}>
          <h2 id={`${s.id}-heading`}>{s.title}</h2>
        </section>
      ))}
    </>,
  )
  return { onFinish }
}

describe('LessonIsland', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('shows progress on the ring and marks the next stage', () => {
    setup()
    expect(screen.getByRole('button', { name: /Lesson progress and outline\. 1 of 3 core stages done/ })).toBeInTheDocument()
    const rail = within(screen.getByRole('navigation', { name: 'Lesson stages' }))
    expect(rail.getByRole('button', { name: /Overview/ })).toHaveAccessibleName(/done/)
    expect(rail.getByRole('button', { name: /See it work/ })).toHaveAttribute('aria-current', 'true')
    expect(rail.getByRole('button', { name: /See it work/ })).toHaveAccessibleName(/next/)
    expect(rail.getByRole('button', { name: /Story/ })).toHaveAccessibleName(/optional/)
  })

  it('offers no Finish while a core stage is open', () => {
    setup()
    expect(screen.queryByRole('button', { name: /^Finish/ })).not.toBeInTheDocument()
  })

  it('offers Finish once every core stage is done (the optional Story is not needed)', async () => {
    const { onFinish } = setup({ done: [true, true, true] })
    await userEvent.click(screen.getByRole('button', { name: /^Finish/ }))
    expect(onFinish).toHaveBeenCalledTimes(1)
  })

  it('says so when the lesson is complete, and offers no Finish', () => {
    setup({ done: [true, true, true], complete: true })
    expect(screen.getAllByText('Lesson complete').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /^Finish/ })).not.toBeInTheDocument()
  })

  it('opens an outline panel with what is left and the page sections; Escape closes it and hands focus back', async () => {
    setup()
    const ring = screen.getByRole('button', { name: /Lesson progress and outline/ })
    expect(screen.queryByRole('navigation', { name: 'On this page' })).not.toBeInTheDocument()
    await userEvent.click(ring)
    const outline = within(screen.getByRole('navigation', { name: 'On this page' }))
    expect(outline.getAllByRole('button').map((b) => b.textContent)).toEqual(['01The idea', '02Step by step', '03Check your understanding'])
    expect(screen.getByText('See it work still to do.')).toBeInTheDocument()
    expect(screen.getByText('1 of 3 core stages done')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('navigation', { name: 'On this page' })).not.toBeInTheDocument()
    expect(ring).toHaveFocus()
  })

  it('jumps to the chosen section and puts keyboard focus on its heading', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: /Lesson progress and outline/ }))
    await userEvent.click(within(screen.getByRole('navigation', { name: 'On this page' })).getByRole('button', { name: /Step by step/ }))
    expect(screen.queryByRole('navigation', { name: 'On this page' })).not.toBeInTheDocument()
    expect(document.getElementById('see-section')!.scrollIntoView).toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Step by step' })).toHaveFocus()
  })

  it('jumps to a stage straight from its chip', async () => {
    setup()
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Lesson stages' })).getByRole('button', { name: /Check/ }))
    expect(document.getElementById('check-section')!.scrollIntoView).toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Check your understanding' })).toHaveFocus()
  })
})
