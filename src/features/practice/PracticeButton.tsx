import { lazy, Suspense, useState } from 'react'
import { Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { GlossaryEntry } from '@/lib/glossary'

// The cards (and their drag and flip code) load only when someone practises.
const FlashcardDialog = lazy(() => import('./FlashcardDialog'))

/** Opens flashcards for these glossary entries. */
export function PracticeButton({ entries, label = 'Practise these terms', className }: { entries: readonly GlossaryEntry[]; label?: string; className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="outline" className={className} disabled={entries.length === 0} onClick={() => setOpen(true)}>
        <Layers aria-hidden /> {label}
      </Button>
      {open && (
        <Suspense fallback={null}>
          <FlashcardDialog entries={entries} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  )
}
