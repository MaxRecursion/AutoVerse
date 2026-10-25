import { useEffect } from 'react'

/** Set `document.title` to "<title> · AutoVerse" while mounted. */
export function useDocumentTitle(title: string | null | undefined): void {
  useEffect(() => {
    if (!title) return
    const previous = document.title
    document.title = `${title} · AutoVerse`
    return () => {
      document.title = previous
    }
  }, [title])
}
