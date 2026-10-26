import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { LabStoreContext } from '@/components/three/LabContext'
import { engineLabConfig } from '@/features/engine-lab/config'
import { createLabStore } from '@/lib/simulation/labStore'
import { useProgress } from '@/stores/progress'
import { useToasts } from '@/stores/toasts'
import { useTour } from '@/features/tour/tourStore'
import { LabMissions } from './LabMissions'
import { MISSIONS } from './missions'

function setup() {
  const store = createLabStore(engineLabConfig)
  render(
    <LabStoreContext.Provider value={store}>
      <LabMissions />
    </LabStoreContext.Provider>,
  )
  return store
}

describe('LabMissions', () => {
  beforeEach(() => {
    useProgress.getState().clearAll()
    useToasts.getState().clear()
  })

  it('starts at zero and lists what to try', () => {
    setup()
    expect(screen.getByRole('button', { name: /lab missions/i })).toHaveTextContent(`0/${MISSIONS.engine!.length}`)
    expect(screen.getByText('Select the piston')).toBeInTheDocument()
    expect(screen.getByText('Click it in the scene or in the Parts tab.')).toBeInTheDocument()
  })

  it('ticks a mission from a real action, remembers it, and says so', () => {
    const store = setup()
    act(() => store.getState().select('piston'))
    const list = within(screen.getByTestId('lab-missions'))
    expect(list.getByText('Select the piston').closest('li')).toHaveTextContent('done')
    expect(useProgress.getState().missions.engine).toEqual(['pick-piston'])
    expect(useToasts.getState().toasts.at(-1)).toMatchObject({ title: 'Mission complete: Select the piston', description: `1 of ${MISSIONS.engine!.length} done.` })
    expect(screen.getByRole('button', { name: /lab missions/i })).toHaveTextContent(`1/${MISSIONS.engine!.length}`)
  })

  it('stays silent while the product tour is showing the lab', () => {
    useTour.getState().start()
    const store = setup()
    act(() => {
      for (const cue of ['intake', 'compression', 'power', 'exhaust']) store.getState().seekCue(cue)
    })
    useTour.getState().stop('interrupted')
    expect(useProgress.getState().missions.engine).toBeUndefined()
    expect(useToasts.getState().toasts).toEqual([])
  })

  it('does not tick for what the lab shows before it is touched', () => {
    setup()
    expect(useProgress.getState().missions.engine).toBeUndefined()
    expect(useToasts.getState().toasts).toEqual([])
  })

  it('credits watching the timeline as well as acting on it', () => {
    const store = setup()
    act(() => {
      for (const cue of ['intake', 'compression', 'power', 'exhaust']) store.getState().seekCue(cue)
    })
    expect(useProgress.getState().missions.engine).toEqual(expect.arrayContaining(['watch-cycle', 'jump-power']))
  })

  it('celebrates once when every mission is done', () => {
    const store = setup()
    act(() => {
      for (const cue of ['intake', 'compression', 'power', 'exhaust']) store.getState().seekCue(cue)
      store.getState().select('piston')
      store.getState().setExploded(true)
    })
    expect(useProgress.getState().missions.engine).toHaveLength(MISSIONS.engine!.length)
    expect(useToasts.getState().toasts.filter((t) => t.title === 'All missions complete')).toHaveLength(1)
  })

  it('stays out of the way once finished, and can be reopened', async () => {
    const user = userEvent.setup()
    useProgress.setState({ missions: { engine: MISSIONS.engine!.map((m) => m.id) } })
    setup()
    const toggle = screen.getByRole('button', { name: /lab missions/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })
})
