import { fireEvent, render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import SystemMapPage from '@/pages/SystemMapPage'

function renderAt(path: string) {
  const router = createMemoryRouter([{ path: '/map', element: <SystemMapPage /> }], { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return router
}

const pathList = (name: RegExp) => within(screen.getByRole('list', { name })).getAllByRole('listitem').map((li) => li.textContent?.replace(/^\d+/, ''))

describe('SystemMapPage', () => {
  it('shows the front-wheel-drive power path by default, as a diagram and as text', () => {
    renderAt('/map')
    expect(screen.getByRole('heading', { level: 1, name: 'How the systems connect' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Front-wheel drive (transverse)' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('group', { name: /Front-wheel drive \(transverse\): power flow/ })).toBeInTheDocument()
    expect(pathList(/power path/)).toEqual(['Engine', 'Clutch', 'Transaxle', 'Driveshafts', 'Wheels & tyres'])
    // Keyboard-focusable nodes, the path ones numbered.
    const engine = screen.getByRole('button', { name: 'Engine, step 1 of 5 in the power flow' })
    expect(engine).toHaveAttribute('tabindex', '0')
    expect(screen.queryByRole('button', { name: /Propeller shaft/ })).not.toBeInTheDocument()
  })

  it('switches layout from the switcher and keeps it in the URL', () => {
    const router = renderAt('/map')
    fireEvent.click(screen.getByRole('radio', { name: 'Rear-wheel drive' }))
    expect(router.state.location.search).toBe('?layout=rwd')
    expect(pathList(/power path/)).toEqual(['Engine', 'Clutch', 'Gearbox', 'Propeller shaft', 'Differential', 'Driveshafts', 'Wheels & tyres'])
    expect(screen.getByRole('button', { name: 'Propeller shaft, step 4 of 7 in the power flow' })).toBeInTheDocument()
  })

  it('opens all-wheel drive from a link, with its front-axle branch', () => {
    renderAt('/map?layout=awd')
    expect(screen.getByRole('button', { name: 'Front differential, branch of the power flow' })).toBeInTheDocument()
    const branches = screen.getAllByText(/^Branch:/).map((el) => el.textContent)
    expect(branches[0]).toMatch(/^Branch: Centre differential → Front differential — /)
    expect(branches[1]).toMatch(/^Branch: Front differential → Wheels & tyres — /)
  })

  it('explains a node chosen with the keyboard and links to its lesson and 3D focus', () => {
    renderAt('/map?layout=rwd')
    const clutch = screen.getByRole('button', { name: /^Clutch, step 2/ })
    fireEvent.keyDown(clutch, { key: 'Enter' })
    expect(clutch).toHaveAttribute('aria-pressed', 'true')
    const details = screen.getByTestId('map-details')
    expect(within(details).getByRole('heading', { level: 2, name: 'Clutch' })).toBeInTheDocument()
    expect(details).toHaveTextContent('Step 2 of 7')
    expect(within(details).getByRole('link', { name: /Focus in 3D/ })).toHaveAttribute('href', '/labs/transmission?component=clutch-disc')
    expect(within(details).getByRole('link', { name: /Vehicle explorer/ })).toHaveAttribute('href', '/explore?component=clutch-bellhousing')
    expect(within(details).getByRole('link', { name: /Lesson/ })).toHaveAttribute('href', expect.stringMatching(/^\/topics\//))
    // Escape clears the selection.
    fireEvent.keyDown(clutch, { key: 'Escape' })
    expect(clutch).toHaveAttribute('aria-pressed', 'false')
  })

  it('sends supporting systems without a lab to the vehicle explorer', () => {
    renderAt('/map')
    fireEvent.click(screen.getByRole('button', { name: /^Cooling system/ }))
    const details = screen.getByTestId('map-details')
    expect(within(details).getByRole('link', { name: /Focus in 3D/ })).toHaveAttribute('href', '/explore?system=cooling')
    expect(details).toHaveTextContent('Engine — Coolant carries surplus heat away')
  })

  it('offers a pause control for the moving power flow', () => {
    renderAt('/map')
    const pause = screen.getByRole('button', { name: 'Pause flow' })
    fireEvent.click(pause)
    expect(screen.getByRole('button', { name: 'Play flow' })).toHaveAttribute('aria-pressed', 'true')
  })
})
