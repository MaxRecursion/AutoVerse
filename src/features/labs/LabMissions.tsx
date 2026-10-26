import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Circle, Target } from 'lucide-react'
import { useLab, useLabStoreApi } from '@/components/three/LabContext'
import { ProgressRing } from '@/components/learning/ProgressRing'
import { isTourActive } from '@/lib/tourState'
import { cn } from '@/lib/utils'
import { useProgress } from '@/stores/progress'
import { toast } from '@/stores/toasts'
import { completedMissions, emptyContext, getMissions, observe } from './missions'

const NONE: string[] = []

/**
 * A short checklist of things to try in this lab. Items tick from what the
 * learner actually does or sees (see missions.ts), are remembered between
 * visits, and are acknowledged with a toast.
 */
export function LabMissions() {
  const store = useLabStoreApi()
  const labId = useLab((s) => s.config.id)
  const missions = getMissions(labId)
  const done = useProgress((s) => s.missions[labId]) ?? NONE
  const completeMission = useProgress((s) => s.completeMission)
  const evidence = useRef(emptyContext())
  const [open, setOpen] = useState(done.length < missions.length)

  useEffect(() => {
    if (missions.length === 0) return
    evidence.current = observe(evidence.current, store.getState())
    const check = () => {
      if (isTourActive()) return // the product tour is showing this lab, not the learner using it
      for (const id of completedMissions(labId, evidence.current)) {
        if (useProgress.getState().missions[labId]?.includes(id)) continue
        completeMission(labId, id)
        const mission = missions.find((m) => m.id === id)
        const count = useProgress.getState().missions[labId]?.length ?? 0
        const all = count === missions.length
        toast({
          tone: 'success',
          title: all ? 'All missions complete' : `Mission complete: ${mission?.label ?? id}`,
          description: all ? 'You have explored everything this lab sets out to show.' : `${count} of ${missions.length} done.`,
          duration: all ? 7000 : 3500,
        })
      }
    }
    // Skip the initial state: what a lab shows before the learner touches it is not an achievement.
    return store.subscribe((s) => {
      evidence.current = observe(evidence.current, s)
      check()
    })
  }, [store, labId, missions, completeMission])

  if (missions.length === 0) return null
  const count = missions.filter((m) => done.includes(m.id)).length
  const listId = `missions-${labId}`
  return (
    <div className="border-b border-white/[0.06]" data-testid="lab-missions" data-tour="lab-missions">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-white/[0.03]"
      >
        <Target aria-hidden className="size-4 shrink-0 text-cyan" />
        <span className="text-sm font-medium text-paper">Lab missions</span>
        <span className="font-mono text-xs text-steel-400">
          {count}/{missions.length}
        </span>
        <ProgressRing percent={(count / missions.length) * 100} size={18} stroke={2.5} className="ml-auto" barClassName={count === missions.length ? 'stroke-ok' : 'stroke-cyan'} />
        <ChevronDown aria-hidden className={cn('size-4 shrink-0 text-steel-400 transition-transform', open && 'rotate-180')} />
      </button>
      <ul id={listId} hidden={!open} className="flex flex-col gap-0.5 px-3 pb-3">
        {missions.map((m) => {
          const ok = done.includes(m.id)
          return (
            <li key={m.id} className="flex items-start gap-2.5 py-1">
              {ok ? <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-ok" /> : <Circle aria-hidden className="mt-0.5 size-4 shrink-0 text-steel-500" />}
              <span className="text-sm leading-snug">
                <span className={ok ? 'text-steel-300' : 'text-paper'}>{m.label}</span>
                <span className="sr-only">{ok ? ' — done' : ' — to do'}</span>
                {!ok && <span className="block text-xs text-steel-400">{m.hint}</span>}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
