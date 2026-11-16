import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeToggle } from './ThemeToggle'
import { initializeTheme, setTheme, THEME_STORAGE_KEY, useTheme } from './theme'

let stop = () => {}

beforeEach(() => {
  localStorage.clear()
  document.head.innerHTML = '<meta name="theme-color" content="#0b0c0f">'
  setTheme('dark')
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  stop()
  vi.restoreAllMocks()
})

function Snapshot() {
  return <output>{useTheme()}</output>
}

describe('the shared theme engine', () => {
  it('restores the saved choice before a component renders and keeps browser chrome consistent', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light')
    stop = initializeTheme()
    render(<Snapshot />)
    expect(screen.getByRole('status')).toHaveTextContent('light')
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    expect(document.documentElement).not.toHaveClass('dark')
    expect(document.documentElement.style.colorScheme).toBe('light')
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute('content', '#f4f7fb')
  })

  it.each([null, '', 'sepia'])('defaults to dark for an absent or invalid preference (%s)', (stored) => {
    if (stored !== null) localStorage.setItem(THEME_STORAGE_KEY, stored)
    stop = initializeTheme()
    render(<Snapshot />)
    expect(screen.getByRole('status')).toHaveTextContent('dark')
    expect(document.documentElement).toHaveClass('dark')
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
  })

  it('switches instantly by keyboard and persists the choice without remounting consumers', async () => {
    stop = initializeTheme()
    const user = userEvent.setup()
    render(<><ThemeToggle /><Snapshot /></>)
    const output = screen.getByText('dark', { selector: 'output' })
    const button = screen.getByRole('button', { name: 'Switch to light mode' })
    button.focus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('button', { name: 'Switch to dark mode' })).toHaveFocus()
    expect(output).toHaveTextContent('light')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
    expect(document.documentElement).not.toHaveClass('dark')
    await user.keyboard(' ')
    expect(output).toHaveTextContent('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute('content', '#0b0c0f')
  })

  it('updates other open tabs without writing the change back into storage', () => {
    stop = initializeTheme()
    render(<Snapshot />)
    const write = vi.spyOn(Storage.prototype, 'setItem')
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: THEME_STORAGE_KEY, newValue: 'light' })) })
    expect(screen.getByRole('status')).toHaveTextContent('light')
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'another-setting', newValue: 'dark' })) })
    expect(screen.getByRole('status')).toHaveTextContent('light')
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: null, newValue: null })) })
    expect(screen.getByRole('status')).toHaveTextContent('dark')
    expect(write).not.toHaveBeenCalled()
  })

  it('still lets the learner switch when reading and writing storage are blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage blocked') })
    stop = initializeTheme()
    render(<ThemeToggle />)
    await userEvent.click(screen.getByRole('button', { name: 'Switch to light mode' }))
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    expect(screen.getByRole('button', { name: 'Switch to dark mode' })).toBeVisible()
  })

  it('uses a stable dark server snapshot even if a browser instance has switched to light', () => {
    setTheme('light')
    expect(renderToString(<Snapshot />)).toBe('<output>dark</output>')
    expect(renderToString(<ThemeToggle />)).toContain('Switch to light mode')
  })
})
