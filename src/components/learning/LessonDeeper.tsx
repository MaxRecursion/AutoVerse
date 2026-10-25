import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'

export interface DeeperPanel {
  id: string
  title: string
  count: number
  content: ReactNode
  defaultOpen?: boolean
}

/** Optional depth, collapsed by default: key concepts, misconceptions, real-world examples. */
export function LessonDeeper({ panels, onOpen }: { panels: readonly DeeperPanel[]; onOpen: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      {panels.map((p) => (
        <details
          key={p.id}
          open={p.defaultOpen}
          onToggle={(e) => {
            if ((e.currentTarget as HTMLDetailsElement).open) onOpen()
          }}
          className="group rounded-xl border border-white/[0.07] bg-graphite-900/60"
        >
          <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 rounded-xl px-4 py-3 text-paper hover:bg-white/[0.03] [&::-webkit-details-marker]:hidden">
            <ChevronRight aria-hidden className="size-4 shrink-0 text-steel-400 transition-transform group-open:rotate-90" />
            <span className="font-medium">{p.title}</span>
            <span className="ml-auto font-mono text-xs text-steel-400">{p.count}</span>
          </summary>
          <div className="border-t border-white/[0.06] p-4 sm:p-5">{p.content}</div>
        </details>
      ))}
    </div>
  )
}
