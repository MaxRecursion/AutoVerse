import { useId } from 'react'
import { useLab } from '@/components/three/LabContext'
import { cn } from '@/lib/utils'
import { FRONT, SCHEMATIC, frontView, points, schematic, type Pt } from './diagram2d'
import { PHASE_LABEL, describeFrame, formatLoad, formatMm, formatTravel } from './suspensionText'
import { frameFor } from './useSuspensionFrame'

const INK = {
  body: '#3d4552',
  bodyStroke: '#6b7584',
  arm: '#8a929d',
  knuckle: '#a6adb6',
  joint: '#d0d4da',
  tyre: '#1d2025',
  tyreStroke: '#5b6472',
  rim: '#9aa1aa',
  spring: '#5f95bf',
  damper: '#2b3038',
  rod: '#e3e6ea',
  bumpStop: '#d9a441',
  behind: '#5b6472',
  road: '#262a31',
  roadEdge: '#8a93a0',
  amber: '#f6a63a',
  cyan: '#38d7f2',
  danger: '#ff5c4d',
  text: '#8a93a0',
} as const

const line = (a: Pt, b: Pt) => ({ x1: a[0], y1: a[1], x2: b[0], y2: b[1] })

/**
 * 2D view of the lab: the front view of the corner at true scale (same solved
 * linkage as the 3D scene) next to the quarter-car schematic (body mass,
 * wheel mass, spring, damper, tyre spring) over the scrolling road. Used as
 * the WebGL fallback and in the "Model" tab; it reads the same lab store, so
 * play / scrub / step and the parameter controls drive it too.
 */
export function SuspensionDiagram2D({ variant }: { variant: 'fallback' | 'panel' }) {
  const progress = useLab((s) => s.progress)
  const params = useLab((s) => s.params)
  const f = frameFor(progress, params)
  const fv = frontView(f)
  const sc = schematic(f)
  const frontTitle = useId()
  const schemTitle = useId()
  const { pose } = f
  const fallback = variant === 'fallback'

  return (
    <div className={cn('flex flex-col gap-3', fallback && 'h-full overflow-y-auto bg-graphite-950 bg-blueprint p-3 pt-24 pb-56 sm:pt-28')} data-testid="suspension-diagram">
      <div className={cn('grid gap-3', fallback ? 'mx-auto w-full max-w-3xl sm:grid-cols-[3fr_2fr]' : 'grid-cols-1')}>
        <figure className="flex flex-col gap-1">
          <svg viewBox={`0 0 ${FRONT.width} ${FRONT.height}`} className="w-full" role="img" aria-labelledby={frontTitle}>
            <title id={frontTitle}>{`Front view of the double-wishbone corner. ${describeFrame(f)}`}</title>
            {/* Static ride-height reference */}
            <line x1={0} x2={FRONT.width} y1={fv.rideHeightY} y2={fv.rideHeightY} stroke={INK.amber} strokeDasharray="4 4" strokeWidth={1} opacity={0.6} />
            <text x={FRONT.width - 4} y={fv.rideHeightY - 4} textAnchor="end" fill={INK.amber} className="font-mono text-[9px]">
              ride height
            </text>
            {/* Behind the corner (z < 0): tie rod and drop link */}
            <line {...line(...fv.tieRod)} stroke={INK.behind} strokeWidth={5} strokeLinecap="round" />
            <line {...line(...fv.dropLink)} stroke={INK.behind} strokeWidth={3} strokeLinecap="round" />
            {/* Body side */}
            {fv.chassis.map((r, i) => (
              <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={INK.body} stroke={INK.bodyStroke} strokeWidth={0.8} />
            ))}
            {/* Coil-over */}
            <line {...line(...fv.damperBody)} stroke={INK.damper} strokeWidth={14} strokeLinecap="round" />
            <line {...line(...fv.damperRod)} stroke={INK.rod} strokeWidth={4} />
            <line {...line(...fv.bumpStop)} stroke={INK.bumpStop} strokeWidth={10} />
            <path
              d={fv.spring.path}
              transform={`translate(${fv.spring.from[0].toFixed(1)} ${fv.spring.from[1].toFixed(1)}) rotate(${fv.spring.angleDeg.toFixed(2)})`}
              fill="none"
              stroke={INK.spring}
              strokeWidth={3.2}
              strokeLinejoin="round"
            />
            {/* Arms */}
            <line {...line(...fv.lowerArm)} stroke={INK.arm} strokeWidth={9} strokeLinecap="round" />
            <line {...line(...fv.upperArm)} stroke={INK.arm} strokeWidth={7} strokeLinecap="round" />
            {/* Wheel */}
            <polygon points={points(fv.tyre)} fill={INK.tyre} stroke={INK.tyreStroke} strokeWidth={1} strokeLinejoin="round" />
            <polygon points={points(fv.rim)} fill="none" stroke={INK.rim} strokeWidth={1.5} />
            <polyline points={points(fv.knuckle)} fill="none" stroke={INK.knuckle} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
            {fv.ballJoints.map((p, i) => (
              <circle key={i} cx={p[0]} cy={p[1]} r={5} fill={INK.joint} />
            ))}
            {/* Road (drawn over the tyre: the squashed part of the tyre is hidden, like a contact patch) */}
            <rect x={0} y={fv.roadY} width={FRONT.width} height={Math.max(0, FRONT.height - fv.roadY)} fill={INK.road} />
            <line x1={0} x2={FRONT.width} y1={fv.roadY} y2={fv.roadY} stroke={INK.roadEdge} strokeWidth={1.2} />
            {fv.load.width > 0 && (
              <rect x={fv.load.x - fv.load.width / 2} y={fv.load.y - 1.5} width={fv.load.width} height={3} rx={1.5} fill={INK.amber} opacity={0.85} />
            )}
            {!pose.contact && (
              <text x={fv.load.x} y={fv.roadY + 14} textAnchor="middle" fill={INK.danger} className="font-mono text-[10px]">
                tyre off the road
              </text>
            )}
          </svg>
          <figcaption className="annotation text-center">Front view · true scale</figcaption>
        </figure>

        <figure className="flex flex-col gap-1">
          <svg viewBox={`0 0 ${SCHEMATIC.width} ${SCHEMATIC.height}`} className="mx-auto w-full max-w-[16rem]" role="img" aria-labelledby={schemTitle}>
            <title id={schemTitle}>
              {`Quarter-car model: body mass on a spring and damper above the wheel mass, which sits on the tyre spring. Body ${formatMm(pose.body)}, wheel ${formatMm(pose.wheel)}${pose.contact ? '' : ', tyre off the road'}.`}
            </title>
            <path d={sc.roadFill} fill={INK.road} />
            <path d={sc.road} fill="none" stroke={INK.roadEdge} strokeWidth={1.4} />
            {/* Rest references */}
            {[sc.bodyRestY, sc.wheelRestY].map((y, i) => (
              <line key={i} x1={8} x2={SCHEMATIC.width - 8} y1={y} y2={y} stroke={INK.amber} strokeDasharray="3 4" strokeWidth={0.8} opacity={0.5} />
            ))}
            {/* Tyre spring */}
            <path d={sc.tyreSpring} fill="none" stroke={pose.contact ? INK.text : INK.danger} strokeWidth={2} strokeLinejoin="round" />
            <circle cx={sc.contact.x} cy={sc.contact.y} r={3} fill={sc.contact.touching ? INK.amber : INK.danger} />
            {/* Suspension spring and damper */}
            <path d={sc.spring} fill="none" stroke={INK.spring} strokeWidth={2.4} strokeLinejoin="round" />
            <rect {...sc.damperCylinder} fill="none" stroke={INK.joint} strokeWidth={1.6} />
            <line {...line(...sc.damperRod)} stroke={INK.rod} strokeWidth={2.2} />
            <line {...line(...sc.piston)} stroke={INK.rod} strokeWidth={3} />
            {/* Masses */}
            <rect {...sc.wheel} rx={3} fill="#3a2f22" stroke={INK.amber} strokeWidth={1.4} />
            <rect {...sc.body} rx={3} fill="#173039" stroke={INK.cyan} strokeWidth={1.4} />
            <text x={sc.body.x + sc.body.w / 2} y={sc.body.y + sc.body.h / 2 + 3.5} textAnchor="middle" fill={INK.cyan} className="font-mono text-[10px]">
              body m_s
            </text>
            <text x={sc.wheel.x + sc.wheel.w / 2} y={sc.wheel.y + sc.wheel.h / 2 + 3.5} textAnchor="middle" fill={INK.amber} className="font-mono text-[10px]">
              wheel m_u
            </text>
            <text x={sc.contact.x + 12} y={(sc.contact.y + sc.wheel.y + sc.wheel.h) / 2 + 3} fill={INK.text} className="font-mono text-[9px]">
              tyre k_t
            </text>
            <text x={8} y={sc.body.y + sc.body.h + 30} fill={INK.text} className="font-mono text-[9px]">
              k
            </text>
            <text x={SCHEMATIC.width - 14} y={sc.body.y + sc.body.h + 30} fill={INK.text} className="font-mono text-[9px]">
              c
            </text>
          </svg>
          <figcaption className="annotation text-center">Quarter-car model · movements drawn {SCHEMATIC.exaggeration}×</figcaption>
        </figure>
      </div>

      <dl className={cn('grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border border-white/[0.06] p-3 text-sm', fallback ? 'mx-auto w-full max-w-3xl sm:grid-cols-4' : '')} aria-live="off">
        <Item label="Phase" value={PHASE_LABEL[pose.phase]} />
        <Item label="Body" value={formatMm(pose.body)} />
        <Item label="Wheel" value={formatMm(pose.wheel)} />
        <Item label="Travel" value={formatTravel(pose.travel)} />
        <Item label="Tyre load" value={formatLoad(pose.loadFactor, pose.contact)} danger={!pose.contact} />
      </dl>
    </div>
  )
}

function Item({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="flex flex-col">
      <dt className="eyebrow">{label}</dt>
      <dd className={cn('font-mono tabular-nums', danger ? 'text-danger' : 'text-paper')}>{value}</dd>
    </div>
  )
}
