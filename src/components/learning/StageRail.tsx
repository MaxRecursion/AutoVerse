import { Check, CircleCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Stage, StageSummary } from '@/features/progress/stages'
import { cn } from '@/lib/utils'

/**
 * The lesson's stages as a sticky rail: what you have done, what is next,
 * and — once the core stages are complete — a one-click finish.
 */
export function StageRail({
  stages,
  summary,
  complete,
  onGo,
  onFinish,
}: {
  stages: readonly Stage[]
  summary: StageSummary
  complete: boolean
  onGo: (stage: Stage) => void
  onFinish: () => void
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 self-stretch" data-tour="stage-rail">
      <nav aria-label="Lesson stages" className="min-w-0 flex-1 self-stretch overflow-x-auto [scrollbar-width:none] pointer-coarse:px-1.5 [&::-webkit-scrollbar]:hidden">
        <ol className="flex h-full w-max items-center gap-1 sm:gap-1.5 pointer-coarse:gap-3.5">
          {stages.map((s, i) => {
            const isNext = !complete && summary.next?.id === s.id
            return (
              <li key={s.id} className="flex shrink-0 items-center gap-1 sm:gap-1.5">
                {i > 0 && <span aria-hidden className="hidden h-px w-3 bg-white/15 lg:block" />}
                <button
                  type="button"
                  onClick={() => onGo(s)}
                  aria-current={isNext ? 'true' : undefined}
                  title={s.detail}
                  className={cn(
                    'relative hit-area flex min-h-9 items-center gap-1.5 rounded-full border px-1.5 text-xs transition-colors sm:px-2.5',
                    s.done
                      ? 'border-ok/35 bg-ok/[0.07] text-ok'
                      : isNext
                        ? 'border-cyan/60 bg-cyan/10 text-cyan'
                        : 'border-white/10 text-steel-400 hover:border-white/25 hover:text-paper',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn('grid size-5 shrink-0 place-items-center rounded-full font-mono text-[10px]', s.done ? 'bg-ok/20' : 'bg-white/[0.06]')}
                  >
                    {s.done ? <Check className="size-3" /> : i + 1}
                  </span>
                  {/* Visually hidden (never display:none) when narrow, so assistive tech always hears the stage name. */}
                  <span className={cn('whitespace-nowrap', !isNext && 'sr-only lg:not-sr-only')}>{s.label}</span>
                  <span className="sr-only">
                    {s.done ? ' — done' : isNext ? ' — next' : ''}
                    {s.optional ? ' (optional)' : ''}. {s.detail}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </nav>
      {complete ? (
        <span className="inline-flex min-h-9 shrink-0 items-center gap-1.5 text-xs text-ok">
          <CircleCheck aria-hidden className="size-4" />
          <span className="hidden sm:inline">Lesson complete</span>
          <span className="sr-only sm:hidden">Lesson complete</span>
        </span>
      ) : summary.ready ? (
        <Button size="sm" className="h-9 shrink-0 animate-pulse motion-reduce:animate-none" onClick={onFinish}>
          <CircleCheck aria-hidden /> Finish<span className="sr-only sm:not-sr-only"> lesson</span>
        </Button>
      ) : (
        <span className="hidden shrink-0 font-mono text-[11px] text-steel-400 xl:inline" aria-hidden>
          {summary.coreDone}/{summary.coreTotal} core
        </span>
      )}
    </div>
  )
}
