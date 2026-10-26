import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { routes } from '@/app/router'
import { LabSkeleton } from '@/features/labs/LabHost'
import { createLabStore, defineLabConfig, type CameraApi } from '@/lib/simulation/labStore'
import { AnimationControls } from './AnimationControls'
import { LabStoreContext } from './LabContext'
import { LabWorkbench } from './LabWorkbench'
import { SceneLoadingFallback } from './SceneLoadingFallback'
import { workbenchGrid, workbenchScene } from './workbenchLayout'

const config = defineLabConfig({ id: 'workbench-test', speeds: [0.5, 1, 2] })

function renderWorkbench(props: Partial<Parameters<typeof LabWorkbench>[0]> = {}) {
  const store = createLabStore(config)
  render(
    <MemoryRouter>
      <TooltipProvider>
        <LabStoreContext.Provider value={store}>
          <LabWorkbench
            title="Test Lab"
            scene={<div data-testid="scene" />}
            explanation={<p>Explanation</p>}
            componentIds={[]}
            readouts={<div data-testid="readouts">Readouts</div>}
            controls={<div data-testid="controls">Controls</div>}
            {...props}
          />
        </LabStoreContext.Provider>
      </TooltipProvider>
    </MemoryRouter>,
  )
  return store
}

describe('LabWorkbench phone overlays', () => {
  it('tucks the readouts and lab controls away on phones and brings them back', async () => {
    const user = userEvent.setup()
    renderWorkbench()
    const readouts = screen.getByTestId('readouts').parentElement!
    const controls = screen.getByTestId('controls').parentElement!
    expect(readouts).not.toHaveClass('max-sm:hidden')
    expect(controls).not.toHaveClass('max-sm:hidden')

    const hide = screen.getByRole('button', { name: 'Hide readouts and controls' })
    expect(hide).toHaveAttribute('aria-pressed', 'false')
    await user.click(hide)
    expect(readouts).toHaveClass('max-sm:hidden')
    expect(controls).toHaveClass('max-sm:hidden')
    // The transport stays: playback is never out of reach.
    expect(screen.getByRole('group', { name: 'Animation controls' })).toBeInTheDocument()

    const show = screen.getByRole('button', { name: 'Show readouts and controls' })
    expect(show).toHaveAttribute('aria-pressed', 'true')
    await user.click(show)
    expect(readouts).not.toHaveClass('max-sm:hidden')
    expect(controls).not.toHaveClass('max-sm:hidden')
  })

  it('offers no tuck button when there is nothing to tuck', () => {
    renderWorkbench({ readouts: undefined, controls: undefined })
    expect(screen.queryByRole('button', { name: /readouts and controls/ })).toBeNull()
  })
})

describe('AnimationControls', () => {
  it('has a compact speed button that steps through the speeds and wraps round', async () => {
    const user = userEvent.setup()
    const store = createLabStore(config)
    render(
      <LabStoreContext.Provider value={store}>
        <AnimationControls />
      </LabStoreContext.Provider>,
    )
    await user.click(screen.getByRole('button', { name: 'Playback speed 1×, change' }))
    expect(store.getState().speed).toBe(2)
    await user.click(screen.getByRole('button', { name: 'Playback speed 2×, change' }))
    expect(store.getState().speed).toBe(0.5)
    // The full select (wider screens) shows the same value.
    expect(screen.getByRole('combobox', { name: 'Playback speed' })).toHaveValue('0.5')
  })
})

describe('camera home', () => {
  it('lets a lab move the view "Reset camera" returns to', () => {
    const store = createLabStore(config)
    const calls: string[] = []
    let home: [number, number, number] | null = null
    const camera: CameraApi = {
      reset: () => calls.push(home ? `home ${home.join(',')}` : 'initial'),
      setHome: (p) => {
        home = p
      },
    }
    store.getState().registerCamera(camera)
    store.getState().resetCamera()
    store.getState().camera?.setHome?.([1, 2, 3], [0, 0, 0])
    store.getState().resetCamera()
    expect(calls).toEqual(['initial', 'home 1,2,3'])
  })
})

describe('loading states', () => {
  it('shows an in-scene status until the scene has drawn', () => {
    const { rerender } = render(<SceneLoadingFallback pending label="Preparing 3D scene…" />)
    expect(screen.getByRole('status')).toHaveTextContent('Preparing 3D scene…')
    rerender(<SceneLoadingFallback pending={false} />)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('shows a lab-shaped skeleton with a loading status while the lab code downloads', () => {
    render(<LabSkeleton variant="embedded" />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading laboratory…')
    expect(screen.getByTestId('lab-loading')).toHaveClass('h-[52dvh]')
  })

  it('lays the skeleton out with the workbench classes and holds its contents back for ~300 ms', () => {
    const { container } = render(<LabSkeleton variant="full" />)
    expect(container.firstElementChild).toHaveClass(...workbenchGrid('full').split(' '))
    expect(screen.getByTestId('lab-loading')).toHaveClass(...workbenchScene('full').split(' '))
    // Everything visible inside the boxes waits for the delay; the boxes themselves do not.
    expect(screen.getByTestId('lab-loading')).not.toHaveClass('skeleton-delay')
    expect(screen.getByText('Loading laboratory…').closest('.skeleton-delay')).not.toBeNull()
  })

  it('gives the root route a HydrateFallback for the first lazy page load', () => {
    expect(routes[0].HydrateFallback).toBeTypeOf('function')
  })
})
