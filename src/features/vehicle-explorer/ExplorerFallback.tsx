/**
 * 2D fallback for the vehicle explorer (no WebGL, `?nowebgl`, or the 3D scene
 * failed): a side elevation drawn from the same car-frame boxes the 3D scene
 * frames with. It reads and writes the same store, so the system panel, deep
 * links and highlighting keep working. Zones are a pointer shortcut; the
 * panel's system list is the keyboard / screen-reader path.
 */
import { useEffect } from 'react'
import { useLab, useLabStoreApi } from '@/components/three/LabContext'
import { getComponent } from '@/lib/content'
import { cn } from '@/lib/utils'
import { chooseSystem, systemBox } from './explorerActions'
import { P, readView } from './explorerConfig'
import {
  DIAGRAM_HEIGHT,
  DIAGRAM_WHEELS,
  DIAGRAM_WIDTH,
  GROUND_Y,
  bodyProfilePath,
  glasshousePath,
  projectBox,
} from './explorerDiagram'
import { EXPLORER_SYSTEMS, getExplorerSystem, systemOfComponent, type ExplorerSystemId } from './explorerSystems'
import { componentFocusBox } from './vehicleParts'

const BODY_PATH = bodyProfilePath()
const GLASS_PATH = glasshousePath()

/** System zones, largest first so smaller zones stay clickable on top. */
const ZONES = EXPLORER_SYSTEMS.filter((s) => s.id !== 'body')
  .flatMap((s) => {
    const box = systemBox(s.id)
    return box ? [{ id: s.id, label: s.short, rect: projectBox(box) }] : []
  })
  .sort((a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height)

export function ExplorerFallback() {
  const store = useLabStoreApi()
  const system = useLab((s) => readView(s.params).system)
  const selectedId = useLab((s) => s.selectedId)
  const selectedBox = selectedId && systemOfComponent(selectedId) ? componentFocusBox(selectedId) : null
  const selectedRect = selectedBox ? projectBox(selectedBox) : null
  const choose = (id: ExplorerSystemId) => chooseSystem(store, system === id ? null : id)
  // The diagram is what is on screen now: end the 3D loading state.
  useEffect(() => store.getState().setParam(P.ready, true), [store])

  const caption = system
    ? `${getExplorerSystem(system).name}${selectedId ? ` — ${getComponent(selectedId)?.name ?? selectedId}` : ''}`
    : 'Whole vehicle'

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-4 pb-6" data-testid="explorer-fallback">
      <p className="annotation rounded border border-white/10 bg-graphite-950/70 px-2 py-1 text-steel-400">
        2D side view · 3D graphics are not available here
      </p>
      <svg
        viewBox={`0 0 ${DIAGRAM_WIDTH} ${DIAGRAM_HEIGHT}`}
        className="h-auto max-h-[70%] w-full max-w-3xl"
        role="img"
        aria-label={`Side view of the car, front on the left. ${system ? `${getExplorerSystem(system).name} highlighted.` : 'No system selected.'}`}
      >
        <line x1={0} x2={DIAGRAM_WIDTH} y1={GROUND_Y} y2={GROUND_Y} className="stroke-steel-500/40" strokeWidth={1} strokeDasharray="4 4" />
        <path
          d={BODY_PATH}
          onClick={() => choose('body')}
          className={cn(
            'cursor-pointer transition-colors',
            system === 'body' ? 'fill-cyan/15 stroke-cyan' : 'fill-graphite-800/60 stroke-steel-400/70 hover:stroke-paper',
          )}
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
        <path d={GLASS_PATH} className="pointer-events-none fill-steel-400/10 stroke-steel-500/50" strokeWidth={1} />
        {DIAGRAM_WHEELS.map((w) => (
          <g key={w.cx} className="pointer-events-none">
            <circle cx={w.cx} cy={w.cy} r={w.r} className="fill-graphite-950 stroke-steel-400/70" strokeWidth={1.5} />
            <circle cx={w.cx} cy={w.cy} r={w.r * 0.62} className="fill-none stroke-steel-500/60" strokeWidth={1} />
          </g>
        ))}
        {ZONES.map((z) => {
          const active = system === z.id
          return (
            <g key={z.id} onClick={() => choose(z.id)} className="group cursor-pointer" aria-hidden="true">
              <rect
                {...z.rect}
                rx={4}
                className={cn(
                  'transition-colors',
                  active ? 'fill-cyan/20 stroke-cyan' : 'fill-transparent stroke-steel-400/35 group-hover:fill-cyan/10 group-hover:stroke-cyan/70',
                )}
                strokeWidth={active ? 1.5 : 1}
                strokeDasharray={active ? undefined : '3 3'}
              />
              {active && (
                <text x={z.rect.x + 4} y={z.rect.y - 4} className="fill-cyan font-mono text-[9px] uppercase">
                  {z.label}
                </text>
              )}
            </g>
          )
        })}
        {selectedRect && (
          <rect {...selectedRect} rx={3} className="pointer-events-none fill-amber/15 stroke-amber" strokeWidth={1.5} />
        )}
        <text x={8} y={DIAGRAM_HEIGHT - 4} className="fill-steel-500 font-mono text-[9px] uppercase">
          Front
        </text>
        <text x={DIAGRAM_WIDTH - 8} y={DIAGRAM_HEIGHT - 4} textAnchor="end" className="fill-steel-500 font-mono text-[9px] uppercase">
          Rear
        </text>
      </svg>
      <p className="text-sm text-steel-300" aria-live="polite">
        {caption}
      </p>
    </div>
  )
}
