import { describe, expect, it } from 'vitest'
import { isTypingTarget, matchSearchShortcut } from './shortcuts'

const key = (k: string, extra: Partial<Parameters<typeof matchSearchShortcut>[0]> = {}) =>
  matchSearchShortcut({ key: k, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, isComposing: false, target: document.body, ...extra })

describe('search shortcuts', () => {
  it('toggles with ⌘K and Ctrl+K', () => {
    expect(key('k', { metaKey: true })).toBe('toggle')
    expect(key('K', { ctrlKey: true })).toBe('toggle')
    expect(key('k', { ctrlKey: true, shiftKey: true })).toBeNull()
    expect(key('k')).toBeNull()
  })

  it('opens with "/" unless the user is typing', () => {
    expect(key('/')).toBe('open')
    const input = document.createElement('input')
    expect(key('/', { target: input })).toBeNull()
    const textarea = document.createElement('textarea')
    expect(key('/', { target: textarea })).toBeNull()
    // ⌘K still works from inside a field.
    expect(key('k', { metaKey: true, target: input })).toBe('toggle')
  })

  it('ignores IME composition', () => {
    expect(key('/', { isComposing: true })).toBeNull()
  })

  it('detects typing targets', () => {
    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    expect(isTypingTarget(checkbox)).toBe(false)
    const search = document.createElement('input')
    search.type = 'search'
    expect(isTypingTarget(search)).toBe(true)
    const editable = document.createElement('div')
    editable.setAttribute('role', 'textbox')
    expect(isTypingTarget(editable)).toBe(true)
    expect(isTypingTarget(document.createElement('button'))).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })
})
