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
import { LAP_SECONDS, responseFor, settingsFromParams } from './quarterCar'
import { ResponseChart } from './ResponseChart'
import { SuspensionControls } from './SuspensionControls'
import { SuspensionDiagram2D } from './SuspensionDiagram2D'
import { SuspensionExplanation } from './SuspensionExplanation'
import SuspensionLabView from './SuspensionLabView'
import { suspensionLabConfig } from './config'
import { CHART, chartX } from './chartGeometry'

// jsdom has no WebGL: every SceneCanvas shows its 2D fallback.
vi.mock('@/lib/webgl', () => ({ hasWebGL: () => false }))

const basics = getTopic('suspension-basics')!
const dampers = getTopic('springs-and-dampers')!
const stepFor = (cue: string) => [...basics.steps, ...dampers.steps].find((s) => s.cue === cue)!

function renderWithLab(ui: ReactNode, store: LabStore = createLabStore(suspensionLabConfig)) {
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
/** Seek to a simulated time (s) within the lap. */
const seekSeconds = (store: LabStore, s: number) => act(() => store.getState().seek(s / LAP_SECONDS))

beforeEach(() => usePreferences.setState({ level: 'beginner' }))

describe('SuspensionControls', () => {
  it('sets the road input, damper preset and spring rate as lab params', async () => {
    const user = userEvent.setup()
    const store = renderWithLab(<SuspensionControls />)
    expect(screen.getByRole('group', { name: 'Test setup' })).toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Road' }), 'pothole')
    expect(params(store).road).toBe('pothole')

    const damper = screen.getByRole('group', { name: 'Damper' })
    expect(within(damper).getByRole('radio', { name: 'Balanced' })).toBeChecked()
    await user.click(within(damper).getByRole('radio', { name: 'Too stiff' }))
    expect(params(store).damping).toBe('stiff')
    // Radios move with the arrow keys (native radio group).
    await user.keyboard('{ArrowLeft}')
    expect(params(store).damping).toBe('balanced')

    const spring = screen.getByRole('slider', { name: /Spring rate/ })
    expect(spring).toHaveAttribute('aria-valuetext', '25 newtons per millimetre')
    fireEvent.change(spring, { target: { value: '40' } })
    expect(params(store).springRate).toBe(40)
    expect(spring).toHaveAttribute('aria-valuetext', '40 newtons per millimetre')
    expect(screen.getByText(/body 1\.7 Hz/)).toBeInTheDocument()
  })

  it('folds into a summary button on phones that says what is set', async () => {
    const user = userEvent.setup()
    renderWithLab(<SuspensionControls />)
    const toggle = screen.getByRole('button', { name: /Setup/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveTextContent('Single bump · Balanced · 25 N/mm')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })
})

describe('SuspensionExplanation', () => {
  it('follows the live phase with the lesson text, at the reader’s level', () => {
    const store = renderWithLab(<SuspensionExplanation />)
    expect(screen.getByRole('heading', { name: stepFor('approach').title })).toBeInTheDocument()
    expect(screen.getByText(stepFor('approach').beginner)).toBeInTheDocument()

    act(() => store.getState().seekCue('compression'))
    expect(store.getState().cue).toBe('compression')
    expect(screen.getByRole('heading', { name: stepFor('compression').title })).toBeInTheDocument()

    act(() => usePreferences.setState({ level: 'technical' }))
    expect(screen.getByText(stepFor('compression').technical)).toBeInTheDocument()
  })

  it('prefers the steps of the lesson being read', () => {
    render(
      <MemoryRouter initialEntries={[`/topics/${dampers.slug}`]}>
        <TooltipProvider>
          <LabStoreContext.Provider value={createLabStore(suspensionLabConfig)}>
            <SuspensionExplanation />
          </LabStoreContext.Provider>
        </TooltipProvider>
      </MemoryRouter>,
    )
    const approach = dampers.steps.find((s) => s.cue === 'approach')!
    expect(screen.getByRole('heading', { name: approach.title })).toBeInTheDocument()
    // The lesson being read is not offered again under "Go deeper".
    expect(within(screen.getByRole('navigation', { name: 'Deeper lessons' })).queryByRole('link', { name: dampers.title })).toBeNull()
  })

  it('jumps to a phase from its button', async () => {
    const user = userEvent.setup()
    const store = renderWithLab(<SuspensionExplanation />)
    const phases = screen.getByRole('group', { name: 'Jump to a phase' })
    await user.click(within(phases).getByRole('button', { name: /Ripples/ }))
    expect(params(store).road).toBe('washboard')
    expect(store.getState().cue).toBe('ripples')
    expect(within(phases).getByRole('button', { name: /Ripples/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('tells a scenario’s story while paused on it, and warns when the tyre leaves the road', async () => {
    const user = userEvent.setup()
    const store = renderWithLab(<SuspensionExplanation />)
    const scenarios = screen.getByRole('region', { name: 'Try a scenario' })
    await user.click(within(scenarios).getByRole('button', { name: /Damper too soft/ }))
    expect(params(store)).toMatchObject({ road: 'bump', damping: 'soft' })
    expect(within(scenarios).getByRole('button', { name: /Damper too soft/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { name: stepFor('soft-float').title })).toBeInTheDocument()

    // The pothole scenario is the airborne lesson step itself: no duplicate callout.
    await user.click(within(scenarios).getByRole('button', { name: /Tyre off the road/ }))
    expect(screen.getByRole('heading', { name: stepFor('airborne').title })).toBeInTheDocument()
    expect(screen.queryByTestId('suspension-airborne')).toBeNull()

    // A moment later the tyre is still in the air, but this is no longer the scenario cue: the phase text plus a callout.
    act(() => store.getState().stepBy(1))
    expect(store.getState().params.road).toBe('pothole')
    expect(screen.getByTestId('suspension-airborne')).toHaveTextContent(stepFor('airborne').beginner)
  })

  it('shows the bump-stop callout when a soft spring bottoms out', () => {
    const store = renderWithLab(<SuspensionExplanation />)
    act(() => store.getState().seekCue('soft-spring'))
    expect(screen.getByRole('heading', { name: stepFor('soft-spring').title })).toBeInTheDocument()
    expect(screen.queryByTestId('suspension-stop')).toBeNull() // the step itself explains it
    // A worn damper lets the default spring bottom out too: the deepest moment of the lap is on the stop, under the live phase text.
    act(() => {
      store.getState().setParam('damping', 'soft')
      store.getState().setParam('springRate', 25)
    })
    const r = responseFor(settingsFromParams(params(store)))
    let deepest = 0
    for (let i = 0; i < r.count; i++) if (r.travel[i] > r.travel[deepest]) deepest = i
    expect(r.travel[deepest]).toBeGreaterThan(r.params.bumpStopAt)
    act(() => store.getState().seek(deepest / (r.count - 1)))
    expect(screen.getByTestId('suspension-stop')).toHaveTextContent(stepFor('soft-spring').beginner)
  })

  it('writes live numbers into the state table without re-rendering', () => {
    const store = renderWithLab(<SuspensionExplanation />)
    const table = screen.getByTestId('suspension-live-state')
    const cell = (k: string) => table.querySelector(`[data-cell="${k}"]`)!
    act(() => store.getState().seekCue('full-bump'))
    expect(cell('travel').textContent).toMatch(/^5\d mm bump$/)
    expect(cell('load').textContent).toMatch(/× static$/)
    expect(cell('camber').textContent).toMatch(/^−2\.\d°$/)
    act(() => store.getState().seekCue('airborne'))
    expect(cell('load')).toHaveTextContent('off the road')
  })

  it('links to the deeper lessons', () => {
    renderWithLab(<SuspensionExplanation />)
    const nav = screen.getByRole('navigation', { name: 'Deeper lessons' })
    expect(within(nav).getByRole('link', { name: basics.title })).toHaveAttribute('href', `/topics/${basics.slug}`)
    expect(within(nav).getByRole('link', { name: dampers.title })).toHaveAttribute('href', `/topics/${dampers.slug}`)
  })
})

describe('ResponseChart', () => {
  it('describes the lap and moves its cursor with the lab', () => {
    const store = renderWithLab(<ResponseChart />)
    const chart = screen.getByRole('img', { name: /Body and wheel displacement over one lap/ })
    expect(chart).toHaveAccessibleName(expect.stringMatching(/the tyre stayed on the road/))
    const cursor = chart.querySelector('g[aria-hidden]')!
    seekSeconds(store, 1)
    expect(cursor.getAttribute('transform')).toBe(`translate(${chartX(0.5).toFixed(2)} 0)`)
  })

  it('scrubs (and pauses) the lab when the plot is clicked', () => {
    const store = renderWithLab(<ResponseChart />)
    act(() => store.getState().play())
    const svg = screen.getByRole('img', { name: /Body and wheel displacement/ })
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: CHART.width, height: CHART.height, right: CHART.width, bottom: CHART.height, x: 0, y: 0, toJSON: () => ({}) })
    fireEvent.pointerDown(svg, { clientX: chartX(0.25), clientY: 50, pointerId: 1 })
    expect(store.getState().playing).toBe(false)
    expect(store.getState().progress).toBeCloseTo(0.25, 6)
  })
})

describe('SuspensionDiagram2D', () => {
  it('draws the corner and the quarter-car model with text alternatives', () => {
    const store = renderWithLab(<SuspensionDiagram2D variant="panel" />)
    expect(screen.getByRole('img', { name: /^Front view of the double-wishbone corner\. Approach\./ })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /^Quarter-car model/ })).toBeInTheDocument()
    expect(screen.queryByText('tyre off the road')).toBeNull()
    act(() => store.getState().seekCue('airborne'))
    expect(screen.getByText('tyre off the road')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /^Quarter-car model.*tyre off the road\.$/ })).toBeInTheDocument()
  })
})

describe('SuspensionLabView', () => {
  it('renders the workbench with the 2D fallback, readouts, controls and disclaimer when WebGL is unavailable', () => {
    const store = renderWithLab(<SuspensionLabView variant="full" />)
    expect(screen.getAllByTestId('suspension-diagram').length).toBeGreaterThan(0)
    expect(screen.getByTestId('cue-badge')).toHaveTextContent('Approach')
    expect(screen.getByTestId('suspension-controls')).toBeInTheDocument()
    expect(screen.getByText(/illustrative teaching values/)).toBeInTheDocument()

    const readouts = screen.getByTestId('suspension-readouts')
    const value = (k: string) => readouts.querySelector(`[data-readout="${k}"]`)!
    act(() => store.getState().seekCue('airborne'))
    expect(value('load')).toHaveTextContent('off the road')
    expect(value('load')).toHaveAttribute('data-airborne', 'true')
    expect(screen.getByTestId('cue-badge')).not.toHaveTextContent('Approach')
  })
})
