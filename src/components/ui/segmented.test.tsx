import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { Segmented } from './segmented'

const OPTIONS = [
  { value: 'one', label: 'One at a time' },
  { value: 'all', label: 'All questions' },
] as const

function Harness({ onChange = () => {} }: { onChange?: (v: 'one' | 'all') => void }) {
  const [value, setValue] = useState<'one' | 'all'>('one')
  return (
    <Segmented
      aria-label="Quiz layout"
      value={value}
      onValueChange={(v) => {
        setValue(v)
        onChange(v)
      }}
      options={OPTIONS}
    />
  )
}

describe('Segmented', () => {
  it('is a labelled single-choice group with the current value checked', () => {
    render(<Harness />)
    const group = screen.getByRole('radiogroup', { name: 'Quiz layout' })
    expect(group).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'One at a time' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'All questions' })).not.toBeChecked()
  })

  it('moves the choice (and the thumb) on click, and reports it', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    await userEvent.click(screen.getByRole('radio', { name: 'All questions' }))
    expect(onChange).toHaveBeenCalledWith('all')
    expect(screen.getByRole('radio', { name: 'All questions' })).toBeChecked()
    // The thumb lives inside the checked item only.
    expect(screen.getByRole('radio', { name: 'All questions' }).querySelector('[aria-hidden]')).not.toBeNull()
    expect(screen.getByRole('radio', { name: 'One at a time' }).querySelector('[aria-hidden]')).toBeNull()
  })

  it('never ends up with nothing chosen when the chosen item is pressed again', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    await userEvent.click(screen.getByRole('radio', { name: 'One at a time' }))
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('radio', { name: 'One at a time' })).toBeChecked()
  })

  it('moves with the arrow keys', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    await userEvent.tab()
    expect(screen.getByRole('radio', { name: 'One at a time' })).toHaveFocus()
    await userEvent.keyboard('{ArrowRight}{Enter}')
    expect(onChange).toHaveBeenCalledWith('all')
  })

  it('is complete in the prerendered markup, thumb included', () => {
    const html = renderToString(<Harness />)
    expect(html).toContain('All questions')
    expect(html).toMatch(/aria-checked="true"[^>]*>(?:(?!<button).)*One at a time/s)
  })
})
