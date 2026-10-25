import { ExternalLink, History } from 'lucide-react'
import type { EngineeringHistoryNote as EngineeringHistoryNoteData } from '@/lib/schemas'

export function EngineeringHistoryNote({ note }: { note: EngineeringHistoryNoteData }) {
  return (
    <aside className="relative overflow-hidden rounded-xl border border-amber/20 bg-amber/[0.04] p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full border border-amber/25 bg-amber/[0.08] text-amber">
          <History aria-hidden className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="eyebrow text-amber">Engineering history · {note.year}</p>
          <h3 className="mt-1 text-lg font-semibold text-paper">{note.person}</h3>
          <p className="mt-1 text-sm font-medium text-steel-200">{note.contribution}</p>
          <p className="mt-3 text-sm leading-relaxed text-steel-300">{note.anecdote}</p>
          <a
            href={note.source.url}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex min-h-9 items-center gap-1.5 text-sm text-cyan underline-offset-4 hover:underline"
          >
            {note.source.publisher ? `${note.source.publisher}: ` : ''}
            {note.source.title}
            <ExternalLink aria-hidden className="size-3.5" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
      </div>
    </aside>
  )
}
