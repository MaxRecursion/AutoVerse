import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider, useParams } from 'react-router'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useProgress } from '@/stores/progress'
import { openSearch } from './events'
import { SearchCommand } from './SearchCommand'

vi.mock('@/lib/content', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/content')>()
  const { withFixtureContent, fixtureTopics, fixtureComponents } = await import('@/components/learning/__fixtures__/content')
  return withFixtureContent(actual, { topics: fixtureTopics, components: fixtureComponents })
})

beforeAll(() => {
  // cmdk scrolls the active option into view; jsdom has no layout.
  Element.prototype.scrollIntoView = vi.fn()
})

function Lesson() {
  const { slug } = useParams()
  return <h1>Lesson {slug}</h1>
}

function setup() {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: (
          <>
            <SearchCommand />
            <input aria-label="Notes" />
          </>
        ),
      },
      { path: '/topics/:slug', element: <Lesson /> },
      { path: '/labs/:labId', element: <h1>Lab page</h1> },
    ],
    { initialEntries: ['/'] },
  )
  render(<RouterProvider router={router} />)
  return router
}

describe('SearchCommand', () => {
  beforeEach(() => useProgress.getState().clearAll())

  it('opens with Ctrl+K, ranks results in groups and navigates with Enter', async () => {
    const user = userEvent.setup()
    const router = setup()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.keyboard('{Control>}k{/Control}')
    const dialog = await screen.findByRole('dialog')
    const input = within(dialog).getByRole('combobox')
    expect(input).toHaveFocus()

    await user.type(input, 'fixture engine')
    const topics = await within(dialog).findByRole('group', { name: 'Topics' })
    expect(within(topics).getAllByRole('option')[0]).toHaveTextContent('Fixture engine cycle')
    await user.keyboard('{Enter}')
    expect(router.state.location.pathname).toBe('/topics/fixture-engine-cycle')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('finds components and opens their first related lesson, tolerating a typo', async () => {
    const user = userEvent.setup()
    const router = setup()
    await user.click(screen.getByRole('button', { name: /search lessons, labs and components/i }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByRole('combobox'), 'fixture pistn')
    const group = await within(dialog).findByRole('group', { name: 'Components' })
    await user.click(within(group).getByRole('option', { name: /Fixture piston/ }))
    expect(router.state.location.pathname).toBe('/topics/fixture-engine-cycle')
  })

  it('opens with "/" except while typing in a field', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByLabelText('Notes'))
    await user.keyboard('/')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Notes')).toHaveValue('/')

    await user.click(document.body)
    await user.keyboard('/')
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows recently viewed lessons when the query is empty', async () => {
    useProgress.getState().visit('fixture-ignition')
    useProgress.getState().visit('topic-that-no-longer-exists')
    setup()
    act(() => openSearch())
    const recent = await screen.findByRole('group', { name: 'Recently viewed' })
    const options = within(recent).getAllByRole('option')
    expect(options).toHaveLength(1)
    expect(options[0]).toHaveTextContent('Fixture ignition')
  })

  it('can be opened pre-filled from anywhere', async () => {
    setup()
    act(() => openSearch('crankshaft'))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('combobox')).toHaveValue('crankshaft')
    expect(await within(dialog).findByRole('option', { name: /Fixture crankshaft/ })).toBeInTheDocument()
  })
})
