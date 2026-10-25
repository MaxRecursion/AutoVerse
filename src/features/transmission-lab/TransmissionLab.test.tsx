import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LabStoreContext } from '@/components/three/LabContext'
import { TooltipProvider } from '@/components/ui/tooltip'
import { getTopic } from '@/lib/content'
import { createLabStore, type LabStore } from '@/lib/simulation/labStore'
import { usePreferences } from '@/stores/preferences'
import { CLUTCH_CUES, PARAM, transmissionLabConfig } from './config'
import { GearboxSchematic2D } from './GearboxSchematic2D'
import { TransmissionControls } from './TransmissionControls'
import { TransmissionExplanation } from './TransmissionExplanation'
import TransmissionLabView from './TransmissionLabView'

// jsdom has no WebGL: every SceneCanvas shows its 2D fallback.
vi.mock('@/lib/webgl', () => ({ hasWebGL: () => false }))

const gearbox = getTopic('manual-gearbox')!
const clutch = getTopic('clutch')!
const gearStep = (cue: string) => gearbox.steps.find((s) => s.cue === cue)!
const clutchStep = (cue: string) => clutch.steps.find((s) => s.cue === cue)!

function renderWithLab(ui: ReactNode, store: LabStore = createLabStore(transmissionLabConfig)) {
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

beforeEach(() => usePreferences.setState({ level: 'beginner' }))

describe('gear selector', () => {
  it('is a radio group laid out as a shift gate, selecting by click', async () => {
    const user = userEvent.setup()
    const store = renderWithLab(<TransmissionControls />)
    const group = screen.getByRole('radiogroup', { name: 'Gear' })
    const radios = within(group).getAllByRole('radio')
    expect(radios.map((r) => r.textContent)).toEqual(['N', '1', '2', '3', '4', '5', 'R'])
    expect(within(group).getByRole('radio', { name: /1st gear, ratio 3\.70 : 1/ })).toHaveAttribute('aria-checked', 'true')

    await user.click(within(group).getByRole('radio', { name: /3rd gear/ }))
    expect(params(store)[PARAM.gear]).toBe('3')
    expect(store.getState().cue).toBe('third')
  })

  it('supports roving focus with arrow keys and direct keys', async () => {
    const user = userEvent.setup()
    const store = renderWithLab(<TransmissionControls />)
    const group = screen.getByRole('radiogroup', { name: 'Gear' })
    // Only the checked radio is in the tab order.
    expect(within(group).getAllByRole('radio').filter((r) => r.tabIndex === 0)).toHaveLength(1)

    await user.tab()
    expect(within(group).getByRole('radio', { name: /1st gear/ })).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    expect(params(store)[PARAM.gear]).toBe('2')
    expect(within(group).getByRole('radio', { name: /2nd gear/ })).toHaveFocus()
    await user.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(params(store)[PARAM.gear]).toBe('N')
    await user.keyboard('r')
    expect(params(store)[PARAM.gear]).toBe('R')
    await user.keyboard('{Home}')
    expect(params(store)[PARAM.gear]).toBe('N')
    await user.keyboard('5')
    expect(params(store)[PARAM.gear]).toBe('5')
  })
})

describe('clutch, engine speed and rotation controls', () => {
  it('drives the clutch pedal from the keyboard with a spoken value', async () => {
    const user = userEvent.setup()
    const store = renderWithLab(<TransmissionControls />)
    const pedal = screen.getByRole('slider', { name: 'Clutch pedal' })
    expect(pedal).toHaveAttribute('aria-valuetext', expect.stringMatching(/0% pressed, clutch fully engaged/))
    act(() => pedal.focus())
    await user.keyboard('{End}')
    expect(params(store)[PARAM.clutch]).toBe(1)
    expect(store.getState().cue).toBe(CLUTCH_CUES.down)
    expect(pedal).toHaveAttribute('aria-valuetext', expect.stringMatching(/disengaged/))
  })

  it('sets the engine speed and toggles rotation', async () => {
    const user = userEvent.setup()
    const store = renderWithLab(<TransmissionControls />)
    const rpm = screen.getByRole('slider', { name: 'Engine speed' })
    act(() => rpm.focus())
    await user.keyboard('{ArrowRight}')
    expect(params(store)[PARAM.rpm]).toBe(2050)

    await user.click(screen.getByRole('button', { name: 'Pause shaft rotation' }))
    expect(params(store)[PARAM.running]).toBe(false)
    expect(screen.getByRole('button', { name: 'Play shaft rotation' })).toBeInTheDocument()
  })
})

describe('TransmissionExplanation', () => {
  it('follows the selected gear with the manual-gearbox lesson text, at the reader’s level', () => {
    const store = renderWithLab(<TransmissionExplanation />)
    expect(screen.getByRole('heading', { name: gearStep('first').title })).toBeInTheDocument()
    expect(screen.getByText(gearStep('first').beginner)).toBeInTheDocument()
    expect(screen.getByTestId('transmission-ratio-expression')).toHaveTextContent('34/20 × 37/17 = 3.70 : 1')

    act(() => store.getState().setParam(PARAM.gear, '4'))
    expect(screen.getByRole('heading', { name: gearStep('fourth').title })).toBeInTheDocument()
    expect(screen.getByTestId('transmission-ratio-expression')).toHaveTextContent('Input locked to output = 1.00 : 1')

    act(() => usePreferences.setState({ level: 'technical' }))
    expect(screen.getByText(gearStep('fourth').technical)).toBeInTheDocument()
  })

  it('switches to the clutch lesson while the pedal is down', async () => {
    const user = userEvent.setup()
    const store = renderWithLab(<TransmissionExplanation />)
    await user.click(screen.getByRole('button', { name: /Bite point/ }))
    expect(store.getState().cue).toBe(CLUTCH_CUES.bite)
    expect(params(store)[PARAM.gear]).toBe('1') // pedal shortcuts keep the selected gear
    expect(screen.getByRole('heading', { name: clutchStep('clutch-bite').title })).toBeInTheDocument()
    expect(screen.getByText(clutchStep('clutch-bite').beginner)).toBeInTheDocument()
  })

  it('lists the power path and selects a part from it', async () => {
    const user = userEvent.setup()
    const store = renderWithLab(<TransmissionExplanation />)
    const path = screen.getByTestId('transmission-power-path')
    expect(within(path).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Flywheel',
      'Pressure plate and cover',
      'Clutch disc',
      'Input shaft',
      'Constant-mesh gears',
      'Layshaft (countershaft)',
      '1st gear (mainshaft)',
      '1–2 synchroniser',
      'Mainshaft (output shaft)',
    ])
    await user.click(within(path).getByRole('button', { name: 'Layshaft (countershaft)' }))
    expect(store.getState().selectedId).toBe('layshaft')

    act(() => store.getState().setParam(PARAM.gear, 'N'))
    expect(within(screen.getByTestId('transmission-power-path')).getByText(/No power path/)).toBeInTheDocument()
  })

  it('shows live numbers for the operating point', () => {
    const store = renderWithLab(<TransmissionExplanation />)
    act(() => store.getState().setParam(PARAM.gear, '4'))
    const table = screen.getByTestId('transmission-live-state')
    expect(within(table).getAllByText('2,000 rpm')).toHaveLength(3) // engine = input = output in direct drive
    expect(within(table).getByText('≈ 57 km/h')).toBeInTheDocument()
  })
})

describe('GearboxSchematic2D', () => {
  it('draws the active power path and the ratio numbers', () => {
    const store = renderWithLab(<GearboxSchematic2D variant="panel" />)
    expect(screen.getByRole('img', { name: /highlighted path runs from the flywheel/ })).toBeInTheDocument()
    expect(screen.getByTestId('schematic-path')).toBeInTheDocument()
    expect(screen.getByTestId('schematic-numbers')).toHaveTextContent('3.70 : 1')

    act(() => store.getState().setParam(PARAM.gear, 'N'))
    expect(screen.queryByTestId('schematic-path')).toBeNull()
    expect(screen.getByRole('img', { name: /No power path/ })).toBeInTheDocument()
  })
})

describe('TransmissionLabView', () => {
  it('renders the workbench with the 2D fallback, readouts and controls when WebGL is unavailable', () => {
    const store = renderWithLab(<TransmissionLabView variant="full" />)
    expect(screen.getByTestId('gearbox-schematic')).toBeInTheDocument()
    expect(screen.getByTestId('schematic-caption')).toHaveTextContent('3.70 : 1')
    const readouts = screen.getByTestId('transmission-readouts')
    expect(within(readouts).getByText('3.70 : 1')).toBeInTheDocument()
    expect(screen.getByTestId('cue-badge')).toHaveTextContent('1st gear')
    expect(screen.getByText(/not the data of any production gearbox/)).toBeInTheDocument()

    act(() => store.getState().setParam(PARAM.gear, 'R'))
    expect(within(readouts).getByText('3.51 : 1 reversed')).toBeInTheDocument()
    expect(within(readouts).getByText('≈ 16 km/h backwards')).toBeInTheDocument()
  })
})
