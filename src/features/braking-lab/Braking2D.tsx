import { useLab, useLabStoreApi } from '@/components/three/LabContext'
import { cn } from '@/lib/utils'
import { getComponent } from '@/lib/content'
import { BRAKE_SPEC, planFor, stateFor, type BrakingState, type StopPlan } from './braking'
import { PEDAL } from './brakeParts'
import {
  PHASE_LABEL,
  PHASE_SUMMARY,
  VALVE_LABEL,
  formatDecel,
  formatEnergy,
  formatForce,
  formatPressure,
  formatSpeed,
  formatTemp,
  heatGlow,
  pressureGlow,
  rgbToCss,
  valveOpenings,
} from './brakingText'

/* ------------------------------------------------------------------ */
/* Drawing geometry (viewBox units)                                     */
/* ------------------------------------------------------------------ */

const VB = { w: 400, h: 250 } as const
const PIVOT = { x: 30, y: 26 } as const
const ARM = 100
const AXIS = PIVOT.y + ARM / BRAKE_SPEC.pedalRatio
/** Pushrod travel at full pedal, viewBox units (pin radius × sin max angle). */
const ROD_TRAVEL = (ARM / BRAKE_SPEC.pedalRatio) * Math.sin((PEDAL.maxAngleDeg * Math.PI) / 180)
const GAP = 4
const WHEEL = { x: 112, y: 182, tyre: 50, disc: 31 } as const

const STEEL = '#8a93a0'
const BODY = '#4b5563'
const LINE = '#5c636c'

function fluidFill(pa: number): string {
  const g = pressureGlow(pa)
  // Mix the resting fluid colour towards cyan with pressure.
  const rest = [0x1d / 255, 0x4d / 255, 0x58 / 255] as const
  return rgbToCss([rest[0] + (g.color[0] - rest[0]) * g.intensity, rest[1] + (g.color[1] - rest[1]) * g.intensity, rest[2] + (g.color[2] - rest[2]) * g.intensity])
}

function discFill(tempC: number): string {
  const h = heatGlow(tempC)
  const base = [0x80 / 255, 0x85 / 255, 0x8c / 255] as const
  return rgbToCss([base[0] + (h.color[0] - base[0]) * h.intensity, base[1] + (h.color[1] - base[1]) * h.intensity, base[2] + (h.color[2] - base[2]) * h.intensity])
}

interface DrawingProps {
  state: BrakingState
  plan: StopPlan
  className?: string
}

/**
 * Schematic of the whole brake: pedal → servo → master cylinder → ABS
 * modulator → caliper (edge-on section with pads and disc), plus a face-on
 * wheel that rolls or locks on the road. Pure function of the braking state.
 * Clicking a labelled part selects it, like the 3D scene.
 */
function BrakeDrawing({ state: st, plan, className }: DrawingProps) {
  const store = useLabStoreApi()
  const selectedId = useLab((s) => s.selectedId)
  const beta = PEDAL.maxAngleDeg * st.pedalTravel
  const rod = ROD_TRAVEL * (Math.sin((beta * Math.PI) / 180) / Math.sin((PEDAL.maxAngleDeg * Math.PI) / 180))
  const take = st.padContact * GAP
  const valves = valveOpenings(st.absValve)
  const spinDeg = -((st.wheelAngle * 180) / Math.PI) % 360
  const dashShift = (st.travel * 22) % 40
  const skid = plan.mode === 'lock' && st.t > plan.tLimit ? Math.min(100, (st.travel - plan.atLimit.x) * 6) : 0

  const part = (id: string) => ({
    'data-part': id,
    className: cn('cursor-pointer', selectedId === id && '[&_*]:stroke-cyan'),
    onClick: () => store.getState().select(selectedId === id ? null : id),
  })
  const label = (x: number, y: number, text: string, anchor: 'start' | 'middle' | 'end' = 'middle') => (
    <text x={x} y={y} textAnchor={anchor} fontSize={7.5} fill={STEEL} fontFamily="JetBrains Mono, ui-monospace, monospace" letterSpacing={0.4}>
      {text.toUpperCase()}
    </text>
  )

  return (
    <svg viewBox={`0 0 ${VB.w} ${VB.h}`} className={cn('block select-none', className)} aria-hidden>
      {/* ---------- Pedal, pushrod, servo ---------- */}
      <g {...part('brake-pedal')}>
        <g transform={`rotate(${(-beta).toFixed(2)} ${PIVOT.x} ${PIVOT.y})`}>
          <line x1={PIVOT.x} y1={PIVOT.y} x2={PIVOT.x} y2={PIVOT.y + ARM} stroke="#8d939c" strokeWidth={4} strokeLinecap="round" />
          <rect x={PIVOT.x - 7} y={PIVOT.y + ARM - 4} width={9} height={16} rx={2} fill="#8d939c" />
        </g>
        <circle cx={PIVOT.x} cy={PIVOT.y} r={4} fill="#2b2f35" stroke={STEEL} />
        <line x1={PIVOT.x + rod} y1={AXIS} x2={66 + rod} y2={AXIS} stroke="#8d939c" strokeWidth={2.5} />
      </g>
      <g {...part('brake-servo')}>
        <rect x={66} y={AXIS - 22} width={32} height={44} rx={7} fill="#262a30" stroke={STEEL} strokeWidth={0.8} />
      </g>
      {/* ---------- Master cylinder (section) ---------- */}
      <g {...part('master-cylinder')}>
        <rect x={118} y={AXIS - 30} width={34} height={13} rx={2} fill="#ece8de" opacity={0.25} stroke={STEEL} strokeWidth={0.6} />
        <rect x={98} y={AXIS - 10} width={70} height={20} rx={2} fill="#2b3036" stroke="#bcc1c8" strokeWidth={1} />
        <rect x={118 + rod} y={AXIS - 7} width={47 - rod} height={14} fill={fluidFill(st.masterPressurePa)} />
        <rect x={101 + rod} y={AXIS - 7} width={17} height={14} rx={1} fill="#d9dde2" />
      </g>
      {/* ---------- ABS modulator ---------- */}
      <g {...part('abs-modulator')}>
        <rect x={190} y={AXIS - 16} width={36} height={32} rx={3} fill="#a9afb7" stroke={STEEL} strokeWidth={0.6} />
        <circle cx={201} cy={AXIS - 5} r={4} fill={valves.inlet ? '#38d7f2' : '#2a3038'} />
        <circle cx={215} cy={AXIS - 5} r={4} fill={valves.outlet ? '#f6a63a' : '#2a3038'} />
        <text x={201} y={AXIS + 10} textAnchor="middle" fontSize={6} fill="#15181d" fontFamily="JetBrains Mono, monospace">
          IN
        </text>
        <text x={215} y={AXIS + 10} textAnchor="middle" fontSize={6} fill="#15181d" fontFamily="JetBrains Mono, monospace">
          OUT
        </text>
      </g>
      {/* ---------- Brake line ---------- */}
      <g {...part('brake-line')} fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d={`M168 ${AXIS}H190`} stroke={LINE} strokeWidth={4} />
        <path d={`M168 ${AXIS}H190`} stroke={fluidFill(st.masterPressurePa)} strokeWidth={2} />
        <path d={`M226 ${AXIS}H262V140H${278 - take}`} stroke={LINE} strokeWidth={4} />
        <path d={`M226 ${AXIS}H262V140H${278 - take}`} stroke={fluidFill(st.caliperPressurePa)} strokeWidth={2} />
      </g>

      {/* ---------- Disc and caliper, edge-on section (axle runs left → right) ---------- */}
      <g {...part('brake-disc')}>
        <rect x={318} y={104} width={12} height={136} fill={discFill(st.discTempC)} stroke="#5b6472" strokeWidth={0.6} />
        <line x1={324} y1={108} x2={324} y2={236} stroke="#2b2f35" strokeWidth={1.2} strokeDasharray="5 4" />
        <path d="M330 236H362V244" fill="none" stroke="#5b6472" strokeWidth={4} />
      </g>
      <g {...part('brake-caliper')} transform={`translate(${-take} 0)`}>
        <path
          d="M278 116H306V112H342V164H350V100H278Z"
          fill={BODY}
          stroke={STEEL}
          strokeWidth={0.6}
        />
        <rect x={278} y={116} width={8} height={48} fill="#8f523d" />
        <rect x={278} y={160} width={28} height={6} fill="#8f523d" />
        <rect x={286} y={125} width={6 + 2 * take} height={30} fill={fluidFill(st.caliperPressurePa)} />
      </g>
      <g {...part('caliper-piston')} transform={`translate(${take} 0)`}>
        <rect x={292} y={124} width={13} height={32} rx={1.5} fill="#d9dde2" />
      </g>
      <g {...part('inner-brake-pad')} transform={`translate(${take} 0)`}>
        <rect x={305} y={118} width={3} height={44} fill="#858b93" />
        <rect x={308} y={120} width={6} height={40} fill="#3d3833" />
      </g>
      <g {...part('outer-brake-pad')} transform={`translate(${-take} 0)`}>
        <rect x={334} y={120} width={6} height={40} fill="#3d3833" />
        <rect x={340} y={118} width={3} height={44} fill="#858b93" />
      </g>

      {/* ---------- Face-on wheel on the road ---------- */}
      <g {...part('braked-wheel')}>
        <g transform={`rotate(${spinDeg.toFixed(2)} ${WHEEL.x} ${WHEEL.y})`}>
          <circle cx={WHEEL.x} cy={WHEEL.y} r={WHEEL.tyre - 6} fill="none" stroke="#1f2125" strokeWidth={12} />
          <circle cx={WHEEL.x} cy={WHEEL.y} r={WHEEL.tyre} fill="none" stroke="#3a3d42" strokeWidth={1} />
          <rect x={WHEEL.x - 2} y={WHEEL.y - WHEEL.tyre + 1} width={4} height={8} fill="#f6a63a" />
        </g>
      </g>
      <g {...part('brake-disc')}>
        <circle cx={WHEEL.x} cy={WHEEL.y} r={WHEEL.disc} fill={discFill(st.discTempC)} stroke="#5b6472" strokeWidth={0.8} />
        <g transform={`rotate(${spinDeg.toFixed(2)} ${WHEEL.x} ${WHEEL.y})`} stroke="#25282d" strokeWidth={2} strokeLinecap="round">
          {[0, 60, 120, 180, 240, 300].map((a) => (
            <line key={a} x1={WHEEL.x} y1={WHEEL.y - 15} x2={WHEEL.x + 6} y2={WHEEL.y - 26} transform={`rotate(${a} ${WHEEL.x} ${WHEEL.y})`} />
          ))}
          <circle cx={WHEEL.x} cy={WHEEL.y} r={10} fill="#959ca5" stroke="none" />
        </g>
      </g>
      <g {...part('brake-caliper')}>
        <path d={`M${WHEEL.x - 26} ${WHEEL.y - 22}a34 34 0 0 1 22 -12l3 9a25 25 0 0 0 -17 9z`} fill={BODY} stroke={STEEL} strokeWidth={0.6} />
      </g>
      <g>
        <line x1={14} x2={232} y1={WHEEL.y + WHEEL.tyre} y2={WHEEL.y + WHEEL.tyre} stroke="#5b6472" strokeWidth={1} />
        <g transform={`translate(${dashShift.toFixed(1)} 0)`}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <line key={i} x1={i * 40 - 26} x2={i * 40 - 10} y1={WHEEL.y + WHEEL.tyre + 5} y2={WHEEL.y + WHEEL.tyre + 5} stroke="#d6d1c4" strokeWidth={1.5} opacity={0.6} />
          ))}
        </g>
        {skid > 0.5 && <rect x={WHEEL.x} y={WHEEL.y + WHEEL.tyre - 1.5} width={skid} height={3} fill="#08090a" opacity={0.85} />}
        <rect x={0} y={WHEEL.y + WHEEL.tyre + 1} width={14} height={14} fill="#0b0c0f" />
        <rect x={232} y={WHEEL.y + WHEEL.tyre + 1} width={20} height={14} fill="#0b0c0f" />
      </g>

      {/* ---------- Labels ---------- */}
      {label(PIVOT.x + 2, PIVOT.y + ARM + 24, 'Pedal')}
      {label(82, AXIS + 32, 'Servo')}
      {label(133, AXIS + 22, 'Master cyl.')}
      {label(208, AXIS + 28, 'ABS unit')}
      {label(314, 92, 'Caliper')}
      {label(324, 250, 'Disc')}
      {label(WHEEL.x, WHEEL.y - WHEEL.tyre - 8, st.wheelLocked ? 'Wheel locked' : 'Wheel')}
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* Public component                                                     */
/* ------------------------------------------------------------------ */

export interface Braking2DProps {
  /** `fallback` replaces the 3D canvas (leaves room for overlays); `panel` sits in the side panel. */
  variant?: 'fallback' | 'panel'
}

/** 2D brake diagram: the WebGL fallback and the "Diagram" tab. Reads the same lab store as the 3D scene. */
export function Braking2D({ variant = 'panel' }: Braking2DProps) {
  const progress = useLab((s) => s.progress)
  const params = useLab((s) => s.params)
  const selectedId = useLab((s) => s.selectedId)
  const plan = planFor(params)
  const st = stateFor(params, progress)
  const selected = selectedId ? getComponent(selectedId) : undefined

  const readouts: [string, string][] = [
    ['Speed', formatSpeed(st.vehicleSpeed)],
    ['Pressure', formatPressure(st.caliperPressurePa)],
    ['Clamp', formatForce(st.clampN)],
    ['Decel.', formatDecel(st.decel)],
    ['Heat', formatEnergy(st.energyTotal)],
    ['Disc', formatTemp(st.discTempC)],
  ]

  if (variant === 'fallback')
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 pt-14 pb-60 sm:pb-56" data-testid="braking-2d-fallback">
        <BrakeDrawing state={st} plan={plan} className="min-h-0 w-full max-w-[560px] flex-1" />
        {/* Phones show the same text in the explanation panel below the scene, so the drawing keeps the room. */}
        <p className="annotation max-w-md text-center text-steel-300 max-sm:hidden">
          {PHASE_LABEL[st.phase]}: {PHASE_SUMMARY[st.phase]}
        </p>
        <p className="sr-only" aria-live="polite">
          {PHASE_LABEL[st.phase]}
        </p>
      </div>
    )

  return (
    <div className="flex flex-col gap-4" data-testid="braking-2d-panel">
      <figure className="flex flex-col gap-2">
        <div className="rounded-lg border border-white/[0.06] bg-graphite-950 bg-blueprint p-2">
          <BrakeDrawing state={st} plan={plan} className="w-full" />
        </div>
        <figcaption className="text-xs leading-snug text-steel-400">
          Schematic, not to scale: pad clearance and pedal travel are exaggerated, and the fluid and disc colours are a conceptual pressure and heat map. Select a
          part to see what it does.
        </figcaption>
      </figure>
      <dl className="grid grid-cols-3 gap-x-3 gap-y-2 text-sm">
        {readouts.map(([k, v]) => (
          <div key={k}>
            <dt className="eyebrow">{k}</dt>
            <dd className="font-mono tabular-nums text-paper">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-steel-300">
        <span className="font-medium text-paper">ABS valves:</span> {VALVE_LABEL[st.absValve]}
      </p>
      {selected && (
        <p className="rounded-lg border border-cyan/30 bg-cyan/[0.05] p-3 text-sm leading-relaxed text-steel-300">
          <span className="font-medium text-cyan">{selected.name}.</span> {selected.description}
        </p>
      )}
    </div>
  )
}
