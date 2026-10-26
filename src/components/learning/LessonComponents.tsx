import { useState } from 'react'
import { Crosshair } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { SceneComponent } from '@/lib/schemas'
import type { LabStore } from '@/lib/simulation/labStore'
import { cn } from '@/lib/utils'
import { useOptionalLab } from './labSync'

interface LessonComponentsProps {
  components: readonly SceneComponent[]
  /** When present, selection is shared with the 3D lab (clicking a part in 3D selects its card too). */
  store: LabStore | null
  /** Bring the 3D scene into view (offered for the selected part when a lab is present). */
  onLocate?: () => void
}

/**
 * Annotated, selectable component cards. With a lab, selecting a card
 * selects (highlights) that part in the 3D scene and vice versa; without
 * one, selection simply expands the card's technical notes.
 */
export function LessonComponents({ components, store, onLocate }: LessonComponentsProps) {
  const labSelected = useOptionalLab(store, (s) => s.selectedId)
  const [localSelected, setLocalSelected] = useState<string | null>(null)
  const selectedId = store ? labSelected : localSelected

  const toggle = (id: string) => {
    const next = selectedId === id ? null : id
    if (store) store.getState().select(next)
    else setLocalSelected(next)
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {components.map((c) => {
        const selected = selectedId === c.id
        const detailId = `component-${c.id}-detail`
        const hasDetail = !!c.technical || c.annotations.length > 0
        return (
          <li
            key={c.id}
            data-anchor
            className={cn(
              'flex flex-col rounded-xl border transition-colors',
              selected ? 'border-cyan/50 bg-cyan/[0.05]' : 'border-white/[0.07] bg-graphite-900/60',
            )}
          >
            <button
              type="button"
              onClick={() => toggle(c.id)}
              aria-pressed={selected}
              aria-controls={hasDetail ? detailId : undefined}
              className="flex min-h-11 pointer-coarse:min-h-12 flex-col items-start gap-1 rounded-xl p-4 text-left"
            >
              <span className="flex w-full items-center justify-between gap-2">
                <span className={cn('font-medium', selected ? 'text-cyan' : 'text-paper')}>{c.name}</span>
                <span
                  aria-hidden
                  className={cn('size-2.5 shrink-0 rounded-full border', selected ? 'border-cyan bg-cyan' : 'border-steel-500')}
                  style={selected ? undefined : { borderColor: c.highlight.color }}
                />
              </span>
              <span className="text-sm leading-relaxed text-steel-400">{c.description}</span>
              <span className="sr-only">{store ? (selected ? 'Selected in the 3D scene.' : 'Select to highlight in the 3D scene.') : ''}</span>
            </button>

            {selected && (hasDetail || (store && onLocate)) && (
              <div id={detailId} className="flex flex-col gap-3 border-t border-white/[0.06] px-4 pb-4 pt-3">
                {c.technical && <p className="text-sm leading-relaxed text-steel-300">{c.technical}</p>}
                {c.annotations.length > 0 && (
                  <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr]">
                    {c.annotations.map((a) => (
                      <div key={a.label} className="contents">
                        <dt className="annotation pt-0.5 text-steel-400">{a.label}</dt>
                        <dd className="text-steel-300">{a.text}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {store && onLocate && (
                  <Button variant="outline" size="sm" className="h-9 self-start" onClick={onLocate}>
                    <Crosshair aria-hidden /> View in 3D
                  </Button>
                )}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
