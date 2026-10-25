import { Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getComponent } from '@/lib/content'
import type { ExplanationLevel, SceneComponent, Step } from '@/lib/schemas'
import type { LabStore } from '@/lib/simulation/labStore'
import { cn } from '@/lib/utils'
import { DwellSentinel } from './DwellSentinel'
import { labHasCue, selectActiveStepId, useOptionalLab } from './labSync'

interface LessonStepsProps {
  steps: readonly Step[]
  level: ExplanationLevel
  /** Lab store when the lesson embeds a lab (enables "Show in 3D" and live highlighting). */
  store: LabStore | null
  /** Seek the lab to a cue and bring the scene into view. */
  onShowCue: (cue: string) => void
  /** Select a component (in the lab when present). */
  onSelectComponent: (componentId: string) => void
  /** A step was read (on screen for a moment) or played — evidence for the "See it work" stage. */
  onSeen?: (stepId: string) => void
}

/**
 * Step-by-step explanation synchronised with the lesson's lab: each step
 * with a cue offers "Show in 3D" (seeks the animation), and the step whose
 * cue is currently playing is highlighted live — so text follows animation
 * and animation follows text.
 */
export function LessonSteps({ steps, level, store, onShowCue, onSelectComponent, onSeen }: LessonStepsProps) {
  // The selector runs on every store update but returns a step id, so this
  // re-renders only when the highlighted step changes — not every frame.
  const activeStepId = useOptionalLab(store, (s) => (store ? selectActiveStepId(steps, s) : null))
  const selectedId = useOptionalLab(store, (s) => s.selectedId)

  return (
    <ol className="relative flex flex-col gap-3">
      {steps.map((step, i) => {
        const active = step.id === activeStepId
        const playable = labHasCue(store, step.cue)
        const parts = step.componentIds.map(getComponent).filter((c): c is SceneComponent => !!c)
        return (
          <li
            key={step.id}
            id={`step-${step.id}`}
            data-anchor
            aria-current={active ? 'step' : undefined}
            data-active={active || undefined}
            className={cn(
              'relative scroll-mt-28 rounded-xl border p-4 transition-colors sm:p-5',
              active ? 'border-amber/50 bg-amber/[0.06]' : 'border-white/[0.07] bg-graphite-900/60',
            )}
          >
            {onSeen && <DwellSentinel onSeen={() => onSeen(step.id)} threshold={0.6} ms={1500} />}
            <div className="flex items-start gap-3 sm:gap-4">
              <span
                aria-hidden
                className={cn(
                  'grid size-8 shrink-0 place-items-center rounded-full border font-mono text-xs',
                  active ? 'border-amber/70 bg-amber/15 text-amber' : 'border-white/15 text-steel-300',
                )}
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h3 className="text-base font-semibold leading-snug text-paper">
                    <span className="sr-only">Step {i + 1}: </span>
                    {step.title}
                  </h3>
                  {active && (
                    <span className="font-mono text-[10px] uppercase tracking-wider text-amber">
                      Now playing<span className="sr-only"> in the 3D scene</span>
                    </span>
                  )}
                </div>
                <p className="mt-2 text-[15px] leading-relaxed text-steel-300">{level === 'beginner' ? step.beginner : step.technical}</p>

                {(playable || parts.length > 0) && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {playable && step.cue && (
                      <Button
                        variant={active ? 'default' : 'outline'}
                        size="sm"
                        className="h-9"
                        onClick={() => {
                          if (!step.cue) return
                          onShowCue(step.cue)
                          onSeen?.(step.id)
                        }}
                      >
                        <Play aria-hidden /> Show in 3D<span className="sr-only">: {step.title}</span>
                      </Button>
                    )}
                    {parts.map((c) =>
                      store ? (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => onSelectComponent(c.id)}
                          aria-pressed={selectedId === c.id}
                          className={cn(
                            'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors',
                            selectedId === c.id ? 'border-cyan/60 bg-cyan/10 text-cyan' : 'border-white/10 text-steel-300 hover:border-cyan/40 hover:text-paper',
                          )}
                        >
                          <span className="size-1.5 rounded-full bg-cyan" aria-hidden />
                          {c.name}
                        </button>
                      ) : (
                        <span key={c.id} className="inline-flex min-h-7 items-center rounded-full border border-white/10 px-2.5 text-xs text-steel-300">
                          {c.name}
                        </span>
                      ),
                    )}
                  </div>
                )}
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
