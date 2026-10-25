import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LabStoreContext } from '@/components/three/LabContext'
import { TooltipProvider } from '@/components/ui/tooltip'
import { getTopic } from '@/lib/content'
import { createLabStore, type LabStore } from '@/lib/simulation/labStore'
import { usePreferences } from '@/stores/preferences'
import { engineLabConfig } from './config'
import { EngineExplanation } from './EngineExplanation'
import EngineHero from './EngineHero'
import EngineLabView from './EngineLabView'
import { EngineSection2D } from './EngineSection2D'
import { STROKE_SUMMARY } from './engineText'
import { crankAngleFromProgress, progressFromCrankAngle } from './kinematics'

// jsdom has no WebGL: every SceneCanvas shows its 2D fallback.
vi.mock('@/lib/webgl', () => ({ hasWebGL: () => false }))

const cycleTopic = getTopic('four-stroke-cycle')!
const step = (cue: string) => cycleTopic.steps.find((s) => s.cue === cue)!

function renderWithLab(ui: ReactNode, store: LabStore = createLabStore(engineLabConfig)) {
  render(
    <MemoryRouter>
      <TooltipProvider>
        <LabStoreContext.Provider value={store}>{ui}</LabStoreContext.Provider>
      </TooltipProvider>
    </MemoryRouter>,
  )
  return store
}

const seekDeg = (store: LabStore, deg: number) => act(() => store.getState().seek(progressFromCrankAngle(deg)))

beforeEach(() => usePreferences.setState({ level: 'beginner' }))

describe('EngineExplanation', () => {
  it('shows the current stroke from the four-stroke lesson steps and follows the animation', () => {
    const store = renderWithLab(<EngineExplanation />)
    expect(screen.getByRole('heading', { name: step('intake').title })).toBeInTheDocument()
    expect(screen.getByText(step('intake').beginner)).toBeInTheDocument()
    // At 0° both valves are open: the overlap step is called out.
    expect(screen.getByTestId('engine-event')).toHaveTextContent(step('overlap').title)

    seekDeg(store, 300)
    expect(screen.getByRole('heading', { name: step('compression').title })).toBeInTheDocument()
    expect(screen.queryByTestId('engine-event')).toBeNull()

    seekDeg(store, 350)
    expect(screen.getByTestId('engine-event')).toHaveTextContent(step('spark').title)
  })

  it('updates the live state table as the crank turns', () => {
    const store = renderWithLab(<EngineExplanation />)
    const table = screen.getByTestId('engine-live-state')
    seekDeg(store, 100)
    expect(within(table).getByText('100°')).toBeInTheDocument()
    expect(within(table).getByText('50.0°')).toBeInTheDocument()
    expect(within(table).getByText('Moving down')).toBeInTheDocument()
    expect(within(table).getByText(/\d+% open/)).toBeInTheDocument()
    expect(within(table).getByText('Closed')).toBeInTheDocument()

    seekDeg(store, 450)
    expect(within(table).getByText('450°')).toBeInTheDocument()
    expect(within(table).getAllByText('Closed')).toHaveLength(2)
    expect(within(table).getByText(/burning/i)).toBeInTheDocument()
  })

  it('drives the animation from the stroke and event buttons', async () => {
    const user = userEvent.setup()
    const store = renderWithLab(<EngineExplanation />)
    act(() => store.getState().play())

    await user.click(screen.getByRole('button', { name: /Power/ }))
    expect(crankAngleFromProgress(store.getState().progress)).toBe(400)
    expect(store.getState().playing).toBe(false)
    expect(screen.getByRole('heading', { name: step('power').title })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Power/ })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: 'Bottom dead centre' }))
    expect(crankAngleFromProgress(store.getState().progress)).toBe(180)
  })

  it('switches to the technical text at the technical level', () => {
    usePreferences.setState({ level: 'technical' })
    renderWithLab(<EngineExplanation />)
    expect(screen.getByText(step('intake').technical)).toBeInTheDocument()
  })

  it('links to the deeper engine lessons', () => {
    renderWithLab(<EngineExplanation />)
    const nav = screen.getByRole('navigation', { name: 'Deeper lessons' })
    for (const id of ['pistons-and-crankshaft', 'valves-and-camshaft', 'spark-ignition'])
      expect(within(nav).getByRole('link', { name: getTopic(id)!.title })).toHaveAttribute('href', `/topics/${id}`)
  })
})

describe('EngineSection2D', () => {
  it('draws an accessible cross-section and charts, with a stroke-level live summary', () => {
    const store = renderWithLab(<EngineSection2D />)
    expect(screen.getByRole('img', { name: /engine cross-section/i })).toBeInTheDocument()
    expect(screen.getByText(STROKE_SUMMARY.intake)).toBeInTheDocument()
    expect(screen.getByText(/illustrative model · not measured data/)).toBeInTheDocument()
    seekDeg(store, 620)
    expect(screen.getByText(STROKE_SUMMARY.exhaust)).toBeInTheDocument()
  })

  it('scrubs the crank angle from the timing chart with the keyboard', async () => {
    const user = userEvent.setup()
    const store = renderWithLab(<EngineSection2D />)
    const chart = screen.getByRole('slider', { name: /valve-timing chart/i })
    chart.focus()
    await user.keyboard('{ArrowRight}{ArrowRight}')
    expect(crankAngleFromProgress(store.getState().progress)).toBe(10)
    expect(chart).toHaveAttribute('aria-valuenow', '10')
    await user.keyboard('{PageUp}')
    expect(crankAngleFromProgress(store.getState().progress)).toBe(100)
    await user.keyboard('{Home}')
    expect(store.getState().progress).toBe(0)
  })

  it('shares part selection and visibility with the rest of the lab', () => {
    const store = renderWithLab(<EngineSection2D variant="fallback" />)
    const piston = document.querySelector('[data-part="piston"]')!
    fireEvent.click(piston)
    expect(store.getState().selectedId).toBe('piston')
    act(() => store.getState().toggleHidden('spark-plug'))
    expect(document.querySelector('[data-part="spark-plug"]')).toBeNull()
  })
})

describe('EngineLabView', () => {
  it('falls back to the 2D section without WebGL and keeps readouts live', () => {
    const store = renderWithLab(<EngineLabView variant="full" />)
    expect(screen.getByRole('img', { name: /engine cross-section/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Section' })).toBeInTheDocument()
    const readouts = screen.getByTestId('engine-readouts')
    expect(readouts).toHaveTextContent('~40× slower than a 800 rpm idle')
    seekDeg(store, 245)
    expect(readouts).toHaveTextContent('245°')
    expect(readouts).toHaveTextContent('122.5°')
    expect(readouts).toHaveTextContent('2 / 4')
    act(() => store.getState().setSpeed(2))
    expect(readouts).toHaveTextContent('~20× slower')
    expect(screen.getByText(/illustrative teaching values/)).toBeInTheDocument()
  })
})

describe('EngineHero', () => {
  const realMatchMedia = window.matchMedia
  afterEach(() => {
    window.matchMedia = realMatchMedia
  })

  const mockReducedMotion = (reduce: boolean) => {
    window.matchMedia = (query: string) =>
      ({
        matches: reduce && query.includes('prefers-reduced-motion'),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList
  }

  it('autoplays on its own store', () => {
    mockReducedMotion(false)
    render(
      <MemoryRouter>
        <EngineHero />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: 'Pause engine animation' })).toBeInTheDocument()
    expect(screen.getByTestId('hero-stroke')).toHaveTextContent('Intake')
  })

  it('does not autoplay with reduced motion and shows a still power-stroke pose', () => {
    mockReducedMotion(true)
    render(
      <MemoryRouter>
        <EngineHero />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: 'Play engine animation' })).toBeInTheDocument()
    expect(screen.getByTestId('hero-stroke')).toHaveTextContent('Power')
  })
})
