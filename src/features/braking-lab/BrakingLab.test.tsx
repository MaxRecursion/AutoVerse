import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LabStoreContext } from '@/components/three/LabContext'
import { TooltipProvider } from '@/components/ui/tooltip'
import { getTopic } from '@/lib/content'
import { createLabStore, type LabStore } from '@/lib/simulation/labStore'
import { usePreferences } from '@/stores/preferences'
import { PARAM, planFor, progressAtTime, timeAtProgress, toLabParams } from './braking'
import { Braking2D } from './Braking2D'
import { BrakingControls } from './BrakingControls'
import { BrakingExplanation } from './BrakingExplanation'
import BrakingLabView from './BrakingLabView'
import { SCENARIOS, brakingLabConfig } from './config'
import { StopChart } from './StopChart'

// jsdom has no WebGL: every SceneCanvas shows its 2D fallback.
vi.mock('@/lib/webgl', () => ({ hasWebGL: () => false }))

const discBrakes = getTopic('disc-brakes')!
const abs = getTopic('anti-lock-braking')!
const stepFor = (cue: string) => [...discBrakes.steps, ...abs.steps].find((s) => s.cue === cue)!

function renderWithLab(ui: ReactNode, store: LabStore = createLabStore(brakingLabConfig)) {
  render(
    <MemoryRouter>
      <TooltipProvider>
        <LabStoreContext.Provider value={store}>{ui}</LabStoreContext.Provider>
      </TooltipProvider>
    </MemoryRouter>,
  )
  return store
}

const params = (store: LabStore) => store.getState().params
const elapsed = (store: LabStore) => timeAtProgress(planFor(params(store)), store.getState().progress)

beforeEach(() => usePreferences.setState({ level: 'beginner' }))

describe('BrakingControls', () => {
  it('brakes while the pedal button is held from the keyboard and pauses on release', async () => {
    const user = userEvent.setup()
    const store = renderWithLab(<BrakingControls />)
    const pedal = screen.getByRole('button', { name: 'Hold to brake' })
    expect(pedal).toHaveAttribute('aria-pressed', 'false')

    act(() => pedal.focus())
    await user.keyboard('[Space>]')
    expect(pedal).toHaveAttribute('aria-pressed', 'true')
    expect(store.getState().playing).toBe(true)
    // The stop starts at the moment the pedal goes down.
    expect(elapsed(store)).toBeCloseTo(planFor(params(store)).tApply, 6)

    await user.keyboard('[/Space]')
    expect(pedal).toHaveAttribute('aria-pressed', 'false')
    expect(store.getState().playing).toBe(false)
    expect(screen.getByRole('status')).toHaveTextContent(/Pedal released: paused/)
  })

  it('supports press-and-hold with a pointer, resuming mid-stop rather than restarting', () => {
    const store = renderWithLab(<BrakingControls />)
    const plan = planFor(params(store))
    const mid = progressAtTime(plan, (plan.tApply + plan.tStop) / 2)
    act(() => store.getState().seek(mid))
    const pedal = screen.getByTestId('brake-pedal-button')
    fireEvent.pointerDown(pedal, { button: 0, pointerId: 1 })
    expect(store.getState().playing).toBe(true)
    expect(store.getState().progress).toBe(mid)
    fireEvent.pointerUp(pedal, { button: 0, pointerId: 1 })
    expect(store.getState().playing).toBe(false)
  })

  it('sets the road surface, ABS and the sliders through real store params', async () => {
    const user = userEvent.setup()
    const store = renderWithLab(<BrakingControls />)

    const road = screen.getByRole('group', { name: 'Road surface' })
    await user.click(within(road).getByRole('radio', { name: /Wet/ }))
    expect(params(store)[PARAM.surface]).toBe('wet')
    expect(within(road).getByRole('radio', { name: /Wet/ })).toBeChecked()

    const absSwitch = screen.getByRole('switch', { name: 'ABS' })
    expect(absSwitch).toHaveAttribute('aria-checked', 'true')
    await user.click(absSwitch)
    expect(params(store)[PARAM.abs]).toBe(false)

    const pedalForce = screen.getByRole('slider', { name: /Pedal force/ })
    act(() => pedalForce.focus())
    fireEvent.change(pedalForce, { target: { value: '200' } })
    expect(params(store)[PARAM.pedal]).toBe(200)
    expect(pedalForce).toHaveAttribute('aria-valuetext', '200 N')

    const speed = screen.getByRole('slider', { name: /Speed/ })
    fireEvent.change(speed, { target: { value: '50' } })
    expect(params(store)[PARAM.speed]).toBe(50)
  })

  it('keeps the same moment of the stop when a param changes mid-stop', () => {
    const store = renderWithLab(<BrakingControls />)
    const plan = planFor(params(store))
    const t = (plan.tApply + plan.tStop) / 2
    act(() => store.getState().seek(progressAtTime(plan, t)))
    fireEvent.change(screen.getByRole('slider', { name: /Pedal force/ }), { target: { value: '160' } })
    expect(elapsed(store)).toBeCloseTo(t, 6)
  })
})

describe('BrakingExplanation', () => {
  it('shows the lesson step for the current phase at the reader’s level', () => {
    renderWithLab(<BrakingExplanation />)
    expect(screen.getByRole('heading', { name: stepFor('rolling').title })).toBeInTheDocument()
    expect(screen.getByText(stepFor('rolling').beginner)).toBeInTheDocument()
    act(() => usePreferences.setState({ level: 'technical' }))
    expect(screen.getByText(stepFor('rolling').technical)).toBeInTheDocument()
  })

  it('runs a scenario and jumps to ABS events, following with the ABS lesson text and live valve state', async () => {
    const user = userEvent.setup()
    const store = renderWithLab(<BrakingExplanation />)
    const scenarios = screen.getByRole('group', { name: 'Try a scenario' })

    await user.click(within(scenarios).getByRole('button', { name: /Hard stop, no ABS/ }))
    expect(params(store)).toEqual(toLabParams(SCENARIOS.wetLock))
    expect(store.getState().playing).toBe(true)
    expect(store.getState().progress).toBe(0)
    expect(within(scenarios).getByRole('button', { name: /Hard stop, no ABS/ })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: 'ABS releases pressure' }))
    expect(params(store)).toEqual(toLabParams(SCENARIOS.wetAbs))
    expect(store.getState().playing).toBe(false)
    expect(screen.getByRole('heading', { name: stepFor('abs-release').title })).toBeInTheDocument()
    const live = screen.getByTestId('braking-live-state')
    expect(within(live).getByText(/^Release — outlet open/)).toBeInTheDocument()
    expect(within(live).getByText(/^Rolling · slip \d+ %$/)).toBeInTheDocument()
  })

  it('summarises the stop with the same numbers as the model', async () => {
    const user = userEvent.setup()
    renderWithLab(<BrakingExplanation />)
    const summary = screen.getByTestId('stop-summary')
    expect(within(summary).getByText('41 m')).toBeInTheDocument()
    expect(within(summary).getByText('0.66 g')).toBeInTheDocument()
    expect(within(summary).getByText('+29 K')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Hard stop, no ABS/ }))
    expect(within(summary).getByText('51 m')).toBeInTheDocument()
    expect(within(summary).getByText(/^Without ABS .* the wheel locks and the tyre slides\.$/)).toBeInTheDocument()
  })

  it('links to the deeper lessons', () => {
    renderWithLab(<BrakingExplanation />)
    const nav = screen.getByRole('navigation', { name: 'Deeper lessons' })
    expect(within(nav).getByRole('link', { name: /Anti-lock/i })).toHaveAttribute('href', `/topics/${abs.slug}`)
  })
})

describe('StopChart', () => {
  it('has a text alternative describing the whole stop and moves its time cursor with progress', () => {
    const store = renderWithLab(<StopChart />)
    const chart = screen.getByRole('img', { name: /Stop from 80 km\/h on dry/ })
    const cursor = chart.querySelector('line[stroke="#ffffff"]')!
    const before = cursor.getAttribute('x1')
    act(() => store.getState().seek(0.5))
    expect(cursor.getAttribute('x1')).not.toBe(before)
  })
})

describe('Braking2D', () => {
  it('reads the same store: numbers and ABS valve state follow the timeline', () => {
    const store = renderWithLab(<Braking2D variant="panel" />)
    const panel = screen.getByTestId('braking-2d-panel')
    expect(within(panel).getByText('80 km/h')).toBeInTheDocument()
    expect(within(panel).getByText('0.0 bar')).toBeInTheDocument()

    act(() => store.getState().seekCue('stopped'))
    expect(within(panel).getByText('0 km/h')).toBeInTheDocument()
    expect(within(panel).getByText('99 kJ')).toBeInTheDocument()
  })
})

describe('BrakingLabView', () => {
  it('renders the workbench with the 2D fallback, readouts, controls and the illustrative-values disclaimer', () => {
    const store = renderWithLab(<BrakingLabView variant="full" />)
    expect(screen.getByTestId('braking-2d-fallback')).toBeInTheDocument()
    expect(screen.getByTestId('brake-controls')).toBeInTheDocument()
    expect(screen.getByTestId('cue-badge')).toHaveTextContent('Rolling')
    const readouts = screen.getByTestId('braking-readouts')
    expect(readouts.querySelector('[data-readout="speed"]')).toHaveTextContent('80 km/h')
    expect(within(readouts).getByText('illustrative values')).toBeInTheDocument()
    expect(screen.getByText(/not data for any real vehicle/)).toBeInTheDocument()

    act(() => store.getState().seekCue('stopped'))
    expect(readouts.querySelector('[data-readout="speed"]')).toHaveTextContent('0 km/h')
    expect(readouts.querySelector('[data-readout="temp"]')).toHaveTextContent('59 °C')
    expect(screen.getByTestId('cue-badge')).toHaveTextContent('Stopped')
  })
})
