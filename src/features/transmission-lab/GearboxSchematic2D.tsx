import { useId } from 'react'
import { useLab, useLabStoreApi } from '@/components/three/LabContext'
import { cn } from '@/lib/utils'
import { GEAR_NAME, describeDrive, formatMultiplication, formatRatio, formatRoadSpeed, formatRpm, trainExpression } from './gearboxText'
import { schematicLayout, type SchematicRect } from './schematic2d'
import { useDriveState, useTransmissionParams } from './useTransmission'

const FILL: Record<SchematicRect['kind'], string> = {
  clutch: 'fill-graphite-700 stroke-steel-400',
  shaft: 'fill-steel-500/50 stroke-steel-400',
  gear: 'fill-graphite-800 stroke-steel-400',
  synchro: 'fill-steel-300/15 stroke-steel-300',
  idler: 'fill-graphite-800/70 stroke-steel-300 [stroke-dasharray:6_4]',
}

/** Draw order: shafts under gears, the idler (which sits in front) last. */
const LAYER: Record<SchematicRect['kind'], number> = { shaft: 0, clutch: 1, gear: 2, synchro: 3, idler: 4 }

function Drawing({ className }: { className?: string }) {
  const store = useLabStoreApi()
  const p = useTransmissionParams()
  const selectedId = useLab((s) => s.selectedId)
  const layout = schematicLayout(p.gear, p.clutch)
  const titleId = useId()
  const markerId = useId()
  const rects = [...layout.rects].sort((a, b) => LAYER[a.kind] - LAYER[b.kind])
  const idler = layout.rects.find((r) => r.kind === 'idler')
  const idlerX = idler ? idler.x + idler.w / 2 : 0
  const label =
    layout.path.length > 0
      ? `Side-view schematic of the gearbox in ${GEAR_NAME[p.gear]}. The highlighted path runs from the flywheel through the clutch and the engaged gears to the output.`
      : `Side-view schematic of the gearbox in ${GEAR_NAME[p.gear]}. No power path: ${p.gear === 'N' ? 'no gear is locked to the mainshaft' : 'the clutch is disengaged'}.`

  return (
    <svg viewBox={layout.viewBox} className={cn('block select-none', className)} role="img" aria-labelledby={titleId} data-testid="gearbox-schematic">
      <title id={titleId}>{label}</title>
      <defs>
        <marker id={markerId} viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" className="fill-amber" />
        </marker>
      </defs>

      {/* Axis centre lines. */}
      {[layout.axes.main, layout.axes.lay].map((y) => (
        <line key={y} x1={-305} x2={212} y1={y} y2={y} className="stroke-steel-500" strokeWidth={1} strokeDasharray="10 4 2 4" />
      ))}

      {rects.map((r, i) => {
        const selected = selectedId === r.part
        return (
          <rect
            key={`${r.key}-${i}`}
            x={r.x}
            y={r.y}
            width={r.w}
            height={r.h}
            rx={r.kind === 'shaft' ? 2 : 3}
            strokeWidth={selected ? 3 : 1.5}
            className={cn(
              'cursor-pointer transition-colors',
              FILL[r.kind],
              r.active && 'fill-amber/25 stroke-amber',
              selected && 'stroke-cyan',
            )}
            data-key={r.key}
            data-active={r.active || undefined}
            onClick={() => store.getState().select(selected ? null : r.part)}
          />
        )
      })}

      {layout.path.length > 0 && (
        <polyline
          points={layout.path.map(([x, y]) => `${x},${y}`).join(' ')}
          fill="none"
          className="stroke-amber"
          strokeOpacity={0.35 + 0.65 * layout.torqueFraction}
          strokeWidth={5}
          strokeLinejoin="round"
          strokeLinecap="round"
          markerEnd={`url(#${markerId})`}
          pointerEvents="none"
          data-testid="schematic-path"
        />
      )}

      {/* Tooth counts on every gear tall enough to carry one. */}
      {rects
        .filter((r) => r.teeth !== undefined && r.kind !== 'idler')
        .map((r) => (
          <text
            key={`t-${r.key}`}
            x={r.x + r.w / 2}
            y={r.y + r.h / 2}
            className={cn('font-mono text-[15px]', r.active ? 'fill-amber' : 'fill-steel-300')}
            textAnchor="middle"
            dominantBaseline="central"
            transform={`rotate(-90 ${r.x + r.w / 2} ${r.y + r.h / 2})`}
            pointerEvents="none"
          >
            {r.teeth}
          </text>
        ))}

      <g className="fill-steel-400 font-mono text-[13px] uppercase tracking-wider" pointerEvents="none">
        <text x={-300} y={layout.axes.main - 112}>
          Engine · clutch
        </text>
        <text x={-160} y={layout.axes.main - 98}>
          Mainshaft
        </text>
        <text x={212} y={layout.axes.main - 44} textAnchor="end">
          Output
        </text>
        <text x={-160} y={layout.axes.lay + 100}>
          Layshaft
        </text>
        {/* Under the gear bars, following the idler as it slides (clear of the layshaft gears it sits in front of). */}
        <text x={idlerX} y={layout.axes.lay + 100} textAnchor="middle">
          Idler {p.gear === 'R' ? '(in mesh)' : '(slid out)'}
        </text>
      </g>
    </svg>
  )
}

function Numbers({ compact }: { compact?: boolean }) {
  const p = useTransmissionParams()
  const d = useDriveState()
  const rows: [string, string][] = [
    ['Gear ratio', d.ratio === null ? '—' : `${trainExpression(p.gear)} = ${formatRatio(d.ratio)}`],
    ['Engine → output', `${formatRpm(d.engineRpm)} → ${formatRpm(d.outputRpm)}`],
    ['Torque', formatMultiplication(d.torqueMultiplication)],
    ['Road speed', formatRoadSpeed(d.roadSpeedKmh)],
  ]
  return (
    <dl className={cn('grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono tabular-nums', compact ? 'text-[11px]' : 'text-xs')} data-testid="schematic-numbers">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-steel-400">{k}</dt>
          <dd className="text-paper">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

export interface GearboxSchematic2DProps {
  variant?: 'panel' | 'fallback'
}

/**
 * Side-view schematic of shafts and gear pairs with the active power path,
 * driven by the same store and gearbox maths as the 3D scene. Serves as the
 * WebGL fallback and as the "Schematic" tab beside the 3D view.
 */
export function GearboxSchematic2D({ variant = 'panel' }: GearboxSchematic2DProps) {
  const d = useDriveState()
  if (variant === 'fallback')
    return (
      // Leaves room for the readouts (top) and the controls (bottom) overlaid by LabWorkbench.
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 pb-44 pt-40 sm:pt-12 lg:pb-36">
        <Drawing className="min-h-0 w-full max-w-[640px] flex-1" />
        <p className="annotation text-center tabular-nums text-steel-300" data-testid="schematic-caption">
          {d.ratio === null ? 'Neutral · no gear locked to the mainshaft' : `${trainExpression(d.gear)} = ${formatRatio(d.ratio)}`}
        </p>
        <p className="sr-only" aria-live="polite">
          {describeDrive(d)}
        </p>
      </div>
    )

  return (
    <div className="flex flex-col gap-4">
      <figure className="flex flex-col gap-2">
        <figcaption className="flex items-baseline justify-between gap-2">
          <span className="eyebrow">Side-view schematic</span>
          <span className="annotation text-steel-400">bar height = pitch diameter</span>
        </figcaption>
        <div className="rounded-lg border border-white/[0.06] bg-graphite-950 bg-blueprint p-2">
          <Drawing className="h-auto w-full" />
        </div>
      </figure>
      <Numbers />
      <p className="text-xs leading-relaxed text-steel-400">
        Each gear is drawn as a bar as tall as its pitch diameter, so the two gears of a pair meet where their teeth mesh. Numbers are tooth counts. The reverse idler sits in front of the
        other gears (dashed); it only meshes when it slides under the mainshaft reverse gear. Select a bar to find that part in the Parts tab.
      </p>
    </div>
  )
}
