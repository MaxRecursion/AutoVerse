import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { toast, useToasts } from '@/stores/toasts'
import { ToastHost } from './ToastHost'

const renderHost = () => render(<MemoryRouter><ToastHost /></MemoryRouter>)

describe('ToastHost', () => {
  beforeEach(() => useToasts.getState().clear())

  it('announces progress politely and offers a link to what comes next', () => {
    renderHost()
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite')
    act(() => void toast({ tone: 'success', title: 'Lesson complete: The Clutch', description: '3 of 34 lessons done.', action: { label: 'Next lesson: Gearbox', to: '/topics/manual-gearbox' } }))
    expect(screen.getByText('Lesson complete: The Clutch')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Next lesson: Gearbox/ })).toHaveAttribute('href', '/topics/manual-gearbox')
  })

  it('can be dismissed', async () => {
    const user = userEvent.setup()
    renderHost()
    act(() => void toast({ title: 'Saved' }))
    await user.click(screen.getByRole('button', { name: /dismiss notification/i }))
    await waitFor(() => expect(screen.queryByText('Saved')).not.toBeInTheDocument())
  })

  it('runs a button action such as Undo, then closes', async () => {
    const user = userEvent.setup()
    let undone = 0
    renderHost()
    act(() => void toast({ title: 'Bookmark removed', action: { label: 'Undo', onClick: () => undone++ } }))
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(undone).toBe(1)
    await waitFor(() => expect(screen.queryByText('Bookmark removed')).not.toBeInTheDocument())
  })

  it('moves focus to the action when asked, for a toast that replaces a control that went away', () => {
    renderHost()
    act(() => void toast({ title: 'Progress cleared', action: { label: 'Undo', onClick: () => {} }, focusAction: true }))
    expect(screen.getByRole('button', { name: 'Undo' })).toHaveFocus()
  })

  it('dismisses itself after its duration', async () => {
    renderHost()
    act(() => void toast({ title: 'Quick note', duration: 150 }))
    expect(screen.getByText('Quick note')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Quick note')).not.toBeInTheDocument(), { timeout: 2000 })
  })

  it('never stacks more than three, keeping the newest', () => {
    renderHost()
    act(() => {
      for (const n of [1, 2, 3, 4, 5]) toast({ title: `Toast ${n}`, duration: 0 })
    })
    expect(useToasts.getState().toasts.map((t) => t.title)).toEqual(['Toast 3', 'Toast 4', 'Toast 5'])
  })
})
