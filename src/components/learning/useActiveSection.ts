import { useEffect, useState } from 'react'

/**
 * The section the reader is in: the last of `ids` (document order) whose top
 * has scrolled up past the sticky bars. Position, not visibility, so a section
 * that stays pinned on screen (the lab beside the steps) never wins over the
 * one being read. Null before any section has reached the bars and on the server.
 */
export function useActiveSection(ids: readonly string[], barsHeight = 112): string | null {
  const [active, setActive] = useState<string | null>(null)
  const key = ids.join('|')

  useEffect(() => {
    const order = key ? key.split('|') : []
    let frame = 0
    const update = () => {
      frame = 0
      let current: string | null = null
      for (const id of order) {
        const el = document.getElementById(id)
        // A little past the bars, so a section counts once its heading is clearly in view.
        if (el && el.getBoundingClientRect().top <= barsHeight + 32) current = id
      }
      setActive(current)
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [key, barsHeight])

  return active
}
