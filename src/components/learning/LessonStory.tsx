import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import type { Pioneer } from '@/lib/schemas'
import { PioneerCard } from './PioneerCard'

/** "The story behind it": the engineers linked to this lesson. Opening any story is the lesson's Story stage. */
export function LessonStory({ pioneers, topicId, onOpened }: { pioneers: readonly Pioneer[]; topicId: string; onOpened: () => void }) {
  const [open, setOpen] = useState<Record<string, boolean>>({})
  return (
    <div className="flex flex-col gap-3">
      {pioneers.map((p) => (
        <PioneerCard
          key={p.id}
          pioneer={p}
          currentTopicId={topicId}
          open={!!open[p.id]}
          onOpenChange={(v) => {
            setOpen((o) => ({ ...o, [p.id]: v }))
            if (v) onOpened()
          }}
        />
      ))}
      <Link to="/pioneers" className="inline-flex min-h-10 w-fit items-center gap-1.5 text-sm text-cyan underline-offset-4 hover:underline">
        Browse every engineer on the timeline <ArrowRight aria-hidden className="size-4" />
      </Link>
    </div>
  )
}
