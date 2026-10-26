import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getCourses } from '@/features/certificate/award'
import { certificateCode, courseStatus } from '@/features/certificate/courses'
import { usePreferences } from '@/stores/preferences'
import { useProgress } from '@/stores/progress'
import CertificatePage from './CertificatePage'

const course = () => getCourses()[0]!
const renderAt = (id: string) => {
  const router = createMemoryRouter([{ path: '/certificate/:courseId', element: <CertificatePage /> }, { path: '*', element: <p>elsewhere</p> }], {
    initialEntries: [`/certificate/${id}`],
  })
  return render(<RouterProvider router={router} />)
}

/** Everything in the course done, as a learner would have done it. */
function finish(c = course()) {
  const s = useProgress.getState()
  for (const t of c.topics) {
    s.setCompleted(t.id, true)
    if (t.quiz.length) s.recordQuiz(t.id, t.quiz.length - 1, t.quiz.length)
  }
}

describe('CertificatePage', () => {
  beforeEach(() => {
    useProgress.getState().clearAll()
    usePreferences.setState({ learnerName: '' })
  })
  afterEach(() => vi.restoreAllMocks())

  it('lists the real courses when the id is unknown', () => {
    renderAt('nope')
    expect(screen.getByRole('heading', { level: 1, name: /No course called “nope”/ })).toBeInTheDocument()
    for (const c of getCourses()) expect(screen.getByRole('link', { name: c.title })).toHaveAttribute('href', `/certificate/${c.id}`)
  })

  describe('before it is earned', () => {
    it('shows exactly what is left, and no certificate', () => {
      const c = course()
      renderAt(c.id)
      expect(screen.getByRole('heading', { level: 1, name: c.title })).toBeInTheDocument()
      expect(screen.getByText('Not earned yet')).toBeInTheDocument()
      expect(document.getElementById('certificate')).toBeNull()
      const status = courseStatus(c, {}, {})
      expect(screen.getByText(`0 of ${status.lessonsTotal} lessons · 0 of ${status.quizzesTotal} quizzes`)).toBeInTheDocument()
      const lessons = within(screen.getByText('Lessons to complete').parentElement!)
      expect(lessons.getAllByRole('link')).toHaveLength(c.topics.length)
      expect(screen.getByRole('link', { name: new RegExp(`^Next lesson: ${c.topics[0]!.title}`) })).toHaveAttribute('href', `/topics/${c.topics[0]!.slug}`)
    })

    it('points at the quiz when only quizzes are missing', () => {
      const c = course()
      const s = useProgress.getState()
      for (const t of c.topics) s.setCompleted(t.id, true)
      renderAt(c.id)
      expect(screen.queryByText('Lessons to complete')).not.toBeInTheDocument()
      expect(screen.getByText('Quizzes to take')).toBeInTheDocument()
      const first = c.topics.find((t) => t.quiz.length)!
      expect(screen.getByRole('link', { name: new RegExp(`^Take the quiz: ${first.title}`) })).toHaveAttribute('href', `/topics/${first.slug}#quiz`)
      expect(document.getElementById('certificate')).toBeNull()
    })
  })

  describe('once earned', () => {
    it('shows the certificate with the course, the date, the learner’s results and a reference number', () => {
      const c = course()
      finish(c)
      renderAt(c.id)
      const cert = within(document.getElementById('certificate')!)
      const earnedAt = useProgress.getState().certificates[c.id]!.earnedAt
      expect(cert.getByText('Certificate of completion')).toBeInTheDocument()
      expect(cert.getByRole('heading', { name: c.title })).toBeInTheDocument()
      expect(cert.getByText(new RegExp(`^${c.topics.length} lessons`))).toBeInTheDocument()
      expect(cert.getByText(/average quiz score \d+%/)).toBeInTheDocument()
      expect(cert.getByText(certificateCode(c.id, earnedAt, ''))).toBeInTheDocument()
      expect(cert.getByText(/not independently verified/i)).toBeInTheDocument()
    })

    it('awards it on arrival if the learner finished the course before certificates existed', () => {
      const c = course()
      finish(c)
      useProgress.setState({ certificates: {} })
      renderAt(c.id)
      expect(useProgress.getState().certificates[c.id]).toBeDefined()
      expect(document.getElementById('certificate')).not.toBeNull()
    })

    it('needs a name before it can be printed, shows it as typed, and remembers it', async () => {
      const user = userEvent.setup()
      const c = course()
      finish(c)
      renderAt(c.id)
      const print = screen.getByRole('button', { name: /print or save as pdf/i })
      expect(print).toBeDisabled()
      expect(screen.getByText('Enter your name to enable printing.', { exact: false })).toBeInTheDocument()
      expect(within(document.getElementById('certificate')!).getByText('Your name')).toBeInTheDocument()

      await user.type(screen.getByRole('textbox', { name: 'Name on the certificate' }), 'Ada Lovelace')
      expect(print).toBeEnabled()
      expect(usePreferences.getState().learnerName).toBe('Ada Lovelace')
      const earnedAt = useProgress.getState().certificates[c.id]!.earnedAt
      const cert = within(document.getElementById('certificate')!)
      expect(cert.getByText('Ada Lovelace')).toBeInTheDocument()
      expect(cert.getByText(certificateCode(c.id, earnedAt, 'Ada Lovelace'))).toBeInTheDocument()
    })

    it('limits the name to a length that fits the certificate', async () => {
      const user = userEvent.setup()
      finish()
      renderAt(course().id)
      await user.type(screen.getByRole('textbox', { name: 'Name on the certificate' }), 'x'.repeat(80))
      expect(usePreferences.getState().learnerName).toHaveLength(60)
    })

    it('prints through the browser, naming the file after the course, and restores the title afterwards', async () => {
      const user = userEvent.setup()
      usePreferences.setState({ learnerName: 'Ada Lovelace' })
      const c = course()
      finish(c)
      renderAt(c.id)
      const before = document.title
      let titleWhilePrinting = ''
      const print = vi.spyOn(window, 'print').mockImplementation(() => {
        titleWhilePrinting = document.title
      })
      await user.click(screen.getByRole('button', { name: /print or save as pdf/i }))
      expect(print).toHaveBeenCalledOnce()
      expect(titleWhilePrinting).toBe(`AutoVerse certificate – ${c.title} – Ada Lovelace`)
      act(() => void window.dispatchEvent(new Event('afterprint')))
      expect(document.title).toBe(before)
    })
  })
})
