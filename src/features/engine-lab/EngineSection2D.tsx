import { useId, useRef, type KeyboardEvent, type PointerEvent, type ReactNode, type SVGProps } from 'react'
import { useLab, useLabStoreApi } from '@/components/three/LabContext'
import { cn } from '@/lib/utils'
import {
  SPARK_ANGLE,
  STROKES,
  VALVE_TIMING,
  engineStateAt,
  illustrativePressure,
  progressFromCrankAngle,
  strokeAt,
  strokeLabel,
  valveLift,
  type EngineState,
  type StrokeId,
  type ValveId,
} from './kinematics'
import { CRANK, CRANK_R, MM, SPARK_GAP, gasAppearance, portGasAppearance, visualLift, type RGB, type Vec2 } from './engineModel'
import {
  CRANK_WEB_POINTS,
  SECTION_VIEWBOX,
  SVG_SCALE,
  buildStaticSection,
  camLobeOutline,
  crankSvgRotation,
  gasRegion,
  pistonDrawing,
  points,
  rodDrawing,
  toSvg,
  valveOutline,
  valvetrainDrawing,
} from './section2d'
import { STROKE_SUMMARY, describeEngineState, formatDegrees, valveStateLabel } from './engineText'

/* ------------------------------------------------------------------ */
/* Shared bits                                                          */
/* ------------------------------------------------------------------ */

const STATIC = buildStaticSection()

const INK = {
  casting: '#262b33',
  castingStroke: '#5b6472',
  hatch: '#46505c',
  linerFill: '#30363f',
  coolant: 'rgba(56, 215, 242, 0.07)',
  metal: '#c3c8ce',
  metalDark: '#8c939c',
  metalStroke: '#101216',
  spring: '#7fa6c2',
  behind: '#5b6472',
  intake: '#38d7f2',
  exhaust: '#f6a63a',
  spark: '#fff3c9',
  text: '#8a93a0',
} as const

const rgba = (c: RGB, a: number) => `rgba(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)}, ${a.toFixed(3)})`

/** SVG-safe id (React's useId may contain characters not allowed in url(#…)). */
const useSvgId = (suffix: string) => `${useId().replace(/[^a-zA-Z0-9_-]/g, '')}-${suffix}`

function Circle({ c, r, ...rest }: { c: Vec2; r: number } & SVGProps<SVGCircleElement>) {
  const [x, y] = toSvg(c)
  return <circle cx={x} cy={y} r={r * SVG_SCALE} {...rest} />
}

/** Selection / visibility of a part, mirrored from the lab store (same state as the 3D scene and Parts tab). */
function usePartView() {
  const store = useLabStoreApi()
  const selectedId = useLab((s) => s.selectedId)
  const hidden = useLab((s) => s.hidden)
  const isolatedId = useLab((s) => s.isolatedId)
  return (id: string, children: ReactNode, key: string = id) => {
    if (hidden[id]) return null
    const selected = selectedId === id
    return (
      <g
        key={key}
        data-part={id}
        opacity={isolatedId !== null && isolatedId !== id ? 0.14 : 1}
        className={cn('cursor-pointer', selected && '[&_*]:stroke-cyan')}
        strokeWidth={selected ? 2.2 : undefined}
        onClick={() => store.getState().select(selected ? null : id)}
      >
        {children}
      </g>
    )
  }
}

/* ------------------------------------------------------------------ */
/* Cross-section                                                        */
/* ------------------------------------------------------------------ */

function SectionDrawing({ state, className }: { state: EngineState; className?: string }) {
  const part = usePartView()
  const hatch = useSvgId('hatch')
  const hatchLiner = useSvgId('hatch-liner')
  const glowId = useSvgId('glow')
  const titleId = useSvgId('title')
  const descId = useSvgId('desc')
  const deg = state.crankDeg
  const vb = SECTION_VIEWBOX

  const pinY = state.pinHeight * MM
  const piston = pistonDrawing(pinY)
  const rod = rodDrawing(state.pinHeight, state.crankPin)
  const gas = gasAppearance(deg)
  const lift: Record<ValveId, number> = { intake: visualLift('intake', deg), exhaust: visualLift('exhaust', deg) }
  const [sparkX, sparkY] = toSvg(SPARK_GAP)
  const crown = toSvg({ z: 0, y: piston.crownY })

  const valvetrain = (['intake', 'exhaust'] as const).map((v) => ({ v, d: valvetrainDrawing(v, lift[v]) }))

  return (
    <svg
      viewBox={`${vb.x} ${vb.y} ${vb.width} ${vb.height}`}
      className={cn('block select-none', className)}
      role="img"
      aria-labelledby={`${titleId} ${descId}`}
      strokeLinejoin="round"
    >
      <title id={titleId}>Engine cross-section</title>
      <desc id={descId}>
        Section through a single-cylinder twin-cam engine, intake side on the left and exhaust side on the right: piston, connecting rod and crankshaft below; valves,
        springs, roller followers and cam lobes in the head above; spark plug in the centre of the combustion chamber. Gas colours are conceptual.
      </desc>
      <defs>
        <pattern id={hatch} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="5" height="5" fill={INK.casting} />
          <line x1="0" y1="0" x2="0" y2="5" stroke={INK.hatch} strokeWidth="1.1" />
        </pattern>
        <pattern id={hatchLiner} width="3.5" height="3.5" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
          <rect width="3.5" height="3.5" fill={INK.linerFill} />
          <line x1="0" y1="0" x2="0" y2="3.5" stroke="#5f6874" strokeWidth="0.8" />
        </pattern>
        <radialGradient id={glowId}>
          <stop offset="0%" stopColor="#ffd28a" stopOpacity="0.95" />
          <stop offset="55%" stopColor={INK.exhaust} stopOpacity="0.55" />
          <stop offset="100%" stopColor={INK.exhaust} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Behind the section plane */}
      <g fill="none" stroke={INK.behind} strokeWidth={0.8} strokeDasharray="3 3" opacity={0.6}>
        <polygon points={points(STATIC.headBehind)} fill="rgba(255,255,255,0.025)" strokeDasharray="none" />
        {part('flywheel', <Circle c={STATIC.flywheel.c} r={STATIC.flywheel.r} fill="none" />)}
        {part('timing-belt', <polygon points={points(STATIC.belt)} fill="none" />)}
      </g>

      {/* Block, liner and coolant */}
      {part(
        'engine-block',
        <g stroke={INK.castingStroke} strokeWidth={0.9}>
          {STATIC.coolant.map((p, i) => (
            <polygon key={`c${i}`} points={points(p)} fill={INK.coolant} stroke="none" />
          ))}
          {STATIC.block.map((p, i) => (
            <polygon key={i} points={points(p)} fill={`url(#${hatch})`} />
          ))}
          <Circle c={STATIC.mainBearing.c} r={STATIC.mainBearing.r} fill="none" strokeDasharray="2 2" />
        </g>,
      )}
      {part(
        'oil-sump',
        <g>
          <polygon points={points(STATIC.sump.oil)} fill="rgba(124, 79, 18, 0.55)" />
          <polyline points={points(STATIC.sump.pan)} fill="none" stroke={INK.castingStroke} strokeWidth={2.4} />
        </g>,
      )}

      {/* Conceptual gas */}
      {part(
        'combustion-chamber',
        <g>
          <polygon points={points(gasRegion(piston.crownY))} fill={rgba(gas.color, Math.min(0.8, gas.opacity * 1.5))} stroke="none" />
          {state.combustion > 0.01 && (
            <ellipse
              cx={crown[0]}
              cy={(crown[1] + sparkY) / 2}
              rx={46}
              ry={Math.max(8, (crown[1] - sparkY) / 2 + 8)}
              fill={`url(#${glowId})`}
              opacity={state.combustion}
            />
          )}
        </g>,
      )}
      {(['intake', 'exhaust'] as const).map((v) => {
        const a = portGasAppearance(v, deg)
        return a.opacity > 0.005
          ? part(v === 'intake' ? 'intake-port' : 'exhaust-port', <polygon points={points(STATIC.ports[v])} fill={rgba(a.color, Math.min(0.75, a.opacity * 1.5))} />)
          : null
      })}

      {part(
        'cylinder',
        <g stroke={INK.castingStroke} strokeWidth={0.8}>
          {STATIC.liner.map((p, i) => (
            <polygon key={i} points={points(p)} fill={`url(#${hatchLiner})`} />
          ))}
        </g>,
      )}

      {/* Bottom end */}
      {part(
        'crankshaft',
        <g transform={`rotate(${crankSvgRotation(deg)})`} stroke={INK.metalStroke} strokeWidth={0.8}>
          <polygon points={CRANK_WEB_POINTS} fill={INK.metalDark} />
          <circle cx={0} cy={0} r={CRANK.journalR * SVG_SCALE} fill={INK.metal} />
          <line x1={0} y1={-6} x2={0} y2={-CRANK.counterweightR * SVG_SCALE + 6} stroke={INK.exhaust} strokeWidth={1.4} opacity={0.7} />
        </g>,
      )}
      {part(
        'connecting-rod',
        <g fill={INK.metalDark} stroke={INK.metalStroke} strokeWidth={0.8}>
          <polygon points={points(rod.shank)} />
          <Circle c={rod.small.c} r={rod.small.r} />
          <Circle c={rod.big.c} r={rod.big.r} />
        </g>,
      )}
      {part(
        'crankshaft',
        <g transform={`rotate(${crankSvgRotation(deg)})`}>
          <circle cx={0} cy={-CRANK_R * SVG_SCALE} r={CRANK.pinR * SVG_SCALE} fill={INK.metal} stroke={INK.metalStroke} strokeWidth={0.8} />
        </g>,
        'crankshaft-pin',
      )}
      {part('piston', <polygon points={points(piston.body)} fill={INK.metal} stroke={INK.metalStroke} strokeWidth={0.9} />)}
      {part(
        'piston-rings',
        <g stroke="#3a3f47" strokeWidth={2.2}>
          {piston.rings.map((r) => {
            const [x0, y] = toSvg({ z: r.z0, y: r.y })
            const [x1] = toSvg({ z: r.z1, y: r.y })
            return <line key={r.y} x1={x0} y1={y} x2={x1} y2={y} />
          })}
        </g>,
      )}
      {part('wrist-pin', <Circle c={piston.pin.c} r={piston.pin.r} fill="#e3e6ea" stroke={INK.metalStroke} strokeWidth={0.8} />)}

      {/* Head */}
      {part(
        'cylinder-head',
        <g stroke={INK.castingStroke} strokeWidth={0.9}>
          {STATIC.head.map((p, i) => (
            <polygon key={i} points={points(p)} fill={`url(#${hatch})`} />
          ))}
          {STATIC.camBores.map((b, i) => (
            <Circle key={`b${i}`} c={b.c} r={b.r} fill="none" strokeDasharray="2 2" />
          ))}
        </g>,
      )}
      {(['intake', 'exhaust'] as const).map((v) =>
        part(v === 'intake' ? 'intake-valve' : 'exhaust-valve', <polygon points={points(valveOutline(v, lift[v]))} fill={v === 'intake' ? '#c4c9cf' : '#aa9b8b'} stroke={INK.metalStroke} strokeWidth={0.8} />),
      )}
      {part(
        'valve-spring',
        <g>
          {valvetrain.map(({ v, d }) => (
            <g key={v}>
              <polygon points={points(d.springSeat)} fill={INK.metalDark} />
              <polyline points={points(d.spring)} fill="none" stroke={INK.spring} strokeWidth={2.4} />
              <polygon points={points(d.retainer)} fill={INK.metalDark} stroke={INK.metalStroke} strokeWidth={0.6} />
            </g>
          ))}
        </g>,
      )}
      {part(
        'cam-follower',
        <g stroke={INK.metalStroke} strokeWidth={0.7}>
          {valvetrain.map(({ v, d }) => (
            <g key={v}>
              <polygon points={points(d.follower)} fill="#7d848d" />
              <Circle c={d.roller.c} r={d.roller.r} fill="#e3e6ea" />
            </g>
          ))}
        </g>,
      )}
      {(['intake', 'exhaust'] as const).map((v) =>
        part(
          v === 'intake' ? 'intake-camshaft' : 'exhaust-camshaft',
          <polygon points={points(camLobeOutline(v, deg))} fill="#b7bdc5" stroke={v === 'intake' ? INK.intake : INK.exhaust} strokeWidth={1} />,
        ),
      )}
      {part(
        'spark-plug',
        <g stroke={INK.metalStroke} strokeWidth={0.7}>
          {STATIC.plug.shell.map((p, i) => (
            <polygon key={i} points={points(p)} fill="#aeb3b9" />
          ))}
          {STATIC.plug.insulator.map((p, i) => (
            <polygon key={`i${i}`} points={points(p)} fill="#ece8df" />
          ))}
        </g>,
      )}
      {state.spark > 0 && <circle cx={sparkX} cy={sparkY} r={3 + 10 * state.spark} fill={INK.spark} opacity={state.spark} />}

      <g fontFamily="var(--font-mono)" fontSize={9} fill={INK.text} letterSpacing="0.08em">
        <text x={vb.x + 6} y={vb.y + 14}>
          INTAKE
        </text>
        <text x={vb.x + vb.width - 6} y={vb.y + 14} textAnchor="end">
          EXHAUST
        </text>
      </g>
    </svg>
  )
}

/** Live caption: changes every frame, so it is not a live region (the stroke summary is). */
function SectionCaption({ state }: { state: EngineState }) {
  return (
    <p className="annotation text-center tabular-nums" aria-live="off">
      {formatDegrees(state.crankDeg)} · {strokeLabel(state.stroke)} · intake {valveStateLabel(state.intakeOpen).toLowerCase()} · exhaust{' '}
      {valveStateLabel(state.exhaustOpen).toLowerCase()}
    </p>
  )
}

/* ------------------------------------------------------------------ */
/* Charts                                                               */
/* ------------------------------------------------------------------ */

const CHART = { w: 360, left: 30, right: 352 } as const
const cx = (deg: number) => CHART.left + (deg / 720) * (CHART.right - CHART.left)

function samplePath(f: (deg: number) => number, y: (v: number) => number, step = 2): string {
  let d = ''
  for (let t = 0; t <= 720; t += step) d += `${t === 0 ? 'M' : 'L'}${cx(t).toFixed(1)},${y(f(t)).toFixed(1)}`
  return d
}

const LIFT_CHART = { h: 150, top: 22, base: 118, maxLift: 10 } as const
const liftY = (mm: number) => LIFT_CHART.base - (mm / LIFT_CHART.maxLift) * (LIFT_CHART.base - LIFT_CHART.top)
const LIFT_PATHS: Record<ValveId, string> = {
  intake: samplePath((t) => valveLift('intake', t), liftY),
  exhaust: samplePath((t) => valveLift('exhaust', t), liftY),
}

const PRESSURE_CHART = { h: 112, top: 14, base: 92, maxBar: 45 } as const
const pressureY = (bar: number) => PRESSURE_CHART.base - (bar / PRESSURE_CHART.maxBar) * (PRESSURE_CHART.base - PRESSURE_CHART.top)
const PRESSURE_PATH = samplePath(illustrativePressure, pressureY, 1)

/** Stroke bands, dead-centre ticks and the moving cursor shared by both charts. */
function ChartFrame({ deg, top, base, showStrokeNames }: { deg: number; top: number; base: number; showStrokeNames: boolean }) {
  return (
    <>
      {STROKES.map((s, i) => (
        <g key={s.id}>
          <rect x={cx(s.start)} y={top} width={cx(s.end) - cx(s.start)} height={base - top} fill={i % 2 ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.05)'} />
          {showStrokeNames && (
            <text x={(cx(s.start) + cx(s.end)) / 2} y={top - 6} textAnchor="middle" fontSize={7.5} fill={strokeAt(deg) === s.id ? '#f6a63a' : INK.text} letterSpacing="0.1em">
              {s.label.toUpperCase()}
            </text>
          )}
        </g>
      ))}
      <line x1={CHART.left} y1={base} x2={CHART.right} y2={base} stroke={INK.castingStroke} strokeWidth={0.8} />
      {[0, 180, 360, 540, 720].map((t) => (
        <g key={t}>
          <line x1={cx(t)} y1={base} x2={cx(t)} y2={base + 4} stroke={INK.castingStroke} strokeWidth={0.8} />
          <text x={cx(t)} y={base + 13} textAnchor="middle" fontSize={7} fill={INK.text}>
            {t % 360 === 0 ? 'TDC' : 'BDC'}
          </text>
        </g>
      ))}
      <line x1={cx(deg)} y1={top - 2} x2={cx(deg)} y2={base} stroke="#f3efe6" strokeWidth={1} />
    </>
  )
}

/**
 * Chart that doubles as a crank-angle scrubber: drag (pointer) or use the
 * arrow keys while it has focus. Everything goes through the lab store.
 */
function ScrubbableChart({ label, deg, height, children }: { label: string; deg: number; height: number; children: ReactNode }) {
  const store = useLabStoreApi()
  const svgRef = useRef<SVGSVGElement>(null)
  const dragging = useRef(false)

  const seekFromPointer = (e: PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    if (rect.width === 0) return
    const x = ((e.clientX - rect.left) / rect.width) * CHART.w
    const t = Math.min(719.9, Math.max(0, ((x - CHART.left) / (CHART.right - CHART.left)) * 720))
    store.getState().seek(progressFromCrankAngle(t))
  }
  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    const s = store.getState()
    const steps: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 18, PageDown: -18 }
    if (e.key in steps) s.stepBy(steps[e.key])
    else if (e.key === 'Home') s.seek(0)
    else if (e.key === 'End') s.seek(1 - s.config.stepSize)
    else return
    e.preventDefault()
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${CHART.w} ${height}`}
      className="block w-full cursor-ew-resize touch-pan-y select-none rounded-lg focus-visible:outline-2 focus-visible:outline-cyan"
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={720}
      aria-valuenow={Math.floor(deg)}
      aria-valuetext={`${formatDegrees(deg)} crank, ${strokeLabel(strokeAt(deg))} stroke`}
      fontFamily="var(--font-mono)"
      onKeyDown={onKeyDown}
      onPointerDown={(e) => {
        dragging.current = true
        e.currentTarget.setPointerCapture?.(e.pointerId)
        store.getState().pause()
        seekFromPointer(e)
      }}
      onPointerMove={(e) => dragging.current && seekFromPointer(e)}
      onPointerUp={() => {
        dragging.current = false
      }}
      onPointerCancel={() => {
        dragging.current = false
      }}
    >
      {children}
    </svg>
  )
}

function ValveTimingChart({ state }: { state: EngineState }) {
  const deg = state.crankDeg
  const { top, base } = LIFT_CHART
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="eyebrow">Valve timing</span>
        <span className="annotation text-steel-400">lift vs crank angle · drag to scrub</span>
      </figcaption>
      <ScrubbableChart label="Valve-timing chart: crank angle" deg={deg} height={LIFT_CHART.h}>
        <ChartFrame deg={deg} top={top} base={base} showStrokeNames />
        {/* Overlap: both valves off their seats around exhaust/intake TDC */}
        {[
          [VALVE_TIMING.intake.opens, 720],
          [0, VALVE_TIMING.exhaust.closes],
        ].map(([a, b]) => (
          <rect key={a} x={cx(a)} y={top} width={cx(b) - cx(a)} height={base - top} fill="rgba(56,215,242,0.12)" />
        ))}
        <line x1={cx(SPARK_ANGLE)} y1={top} x2={cx(SPARK_ANGLE)} y2={base} stroke={INK.spark} strokeWidth={1} strokeDasharray="2 2" />
        <text x={cx(SPARK_ANGLE) - 3} y={top + 9} textAnchor="end" fontSize={7} fill={INK.spark}>
          spark
        </text>
        <path d={LIFT_PATHS.intake} fill="none" stroke={INK.intake} strokeWidth={1.8} />
        <path d={LIFT_PATHS.exhaust} fill="none" stroke={INK.exhaust} strokeWidth={1.8} />
        <text x={4} y={liftY(10) + 3} fontSize={7} fill={INK.text}>
          10
        </text>
        <text x={4} y={liftY(0) + 3} fontSize={7} fill={INK.text}>
          0
        </text>
        <text x={4} y={top - 6} fontSize={7} fill={INK.text}>
          mm
        </text>
        <circle cx={cx(deg)} cy={liftY(state.intakeLift)} r={3} fill={INK.intake} />
        <circle cx={cx(deg)} cy={liftY(state.exhaustLift)} r={3} fill={INK.exhaust} />
      </ScrubbableChart>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-steel-300">
        <Legend swatch="bg-cyan">Intake valve</Legend>
        <Legend swatch="bg-amber">Exhaust valve</Legend>
        <Legend swatch="bg-cyan/30">Overlap</Legend>
        <Legend swatch="bg-paper">Spark (15° before TDC)</Legend>
      </ul>
    </figure>
  )
}

function PressureChart({ state }: { state: EngineState }) {
  const deg = state.crankDeg
  const { top, base } = PRESSURE_CHART
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="eyebrow">Cylinder pressure</span>
        <span className="annotation text-amber">illustrative model · not measured data</span>
      </figcaption>
      <ScrubbableChart label="Illustrative cylinder-pressure chart: crank angle" deg={deg} height={PRESSURE_CHART.h}>
        <ChartFrame deg={deg} top={top} base={base} showStrokeNames={false} />
        <path d={PRESSURE_PATH} fill="none" stroke="#f3efe6" strokeWidth={1.5} strokeOpacity={0.85} />
        {[0, 20, 40].map((bar) => (
          <text key={bar} x={4} y={pressureY(bar) + 3} fontSize={7} fill={INK.text}>
            {bar}
          </text>
        ))}
        <text x={4} y={top - 4} fontSize={7} fill={INK.text}>
          bar
        </text>
        <circle cx={cx(deg)} cy={pressureY(state.pressureBar)} r={3} fill={INK.exhaust} />
      </ScrubbableChart>
      <p className="text-xs leading-snug text-steel-400">
        A simple compression-and-burn model drawn to show the shape of the curve: pressure climbs as the charge is squeezed, jumps after the spark, peaks a little after TDC
        and falls as the piston descends. Real engines vary widely.
      </p>
    </figure>
  )
}

function Legend({ swatch, children }: { swatch: string; children: ReactNode }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className={cn('inline-block h-2 w-3 rounded-sm', swatch)} aria-hidden />
      {children}
    </li>
  )
}

/* ------------------------------------------------------------------ */
/* Public component                                                     */
/* ------------------------------------------------------------------ */

export interface EngineSection2DProps {
  /**
   * `panel`: section + timing and pressure charts, for the lab's side tab.
   * `fallback`: section only, sized to fill a lab's scene area (clear of its overlays) when WebGL is unavailable.
   * `hero`: section only, compact padding (homepage hero fallback).
   */
  variant?: 'panel' | 'fallback' | 'hero'
}

/**
 * 2D engine cross-section and valve-timing diagram, driven by the same lab
 * store and kinematics as the 3D scene. Serves as the WebGL fallback and as
 * an extra "Section" tab next to the 3D view.
 */
export function EngineSection2D({ variant = 'panel' }: EngineSection2DProps) {
  const progress = useLab((s) => s.progress)
  const cue = useLab((s) => s.cue) as StrokeId | null
  const state = engineStateAt(progress)
  const summary = cue ? STROKE_SUMMARY[cue] : describeEngineState(state)

  if (variant !== 'panel')
    return (
      <div
        className={cn(
          'flex h-full w-full flex-col items-center justify-center gap-2 px-4',
          // The drawing is tall and narrow, so it clears the corner overlays; only the transport bar needs room.
          variant === 'fallback' ? 'pb-32 pt-14' : 'py-4',
        )}
      >
        <SectionDrawing state={state} className="min-h-0 w-full max-w-[420px] flex-1" />
        {variant === 'fallback' && <SectionCaption state={state} />}
        <p className="sr-only" aria-live="polite">
          {summary}
        </p>
      </div>
    )

  return (
    <div className="flex flex-col gap-5">
      <figure className="flex flex-col gap-2">
        <div className="rounded-lg border border-white/[0.06] bg-graphite-950 bg-blueprint p-2">
          <SectionDrawing state={state} className="mx-auto h-[min(520px,62dvh)] w-auto max-w-full" />
        </div>
        <figcaption>
          <SectionCaption state={state} />
        </figcaption>
        <p className="sr-only" aria-live="polite">
          {summary}
        </p>
      </figure>
      <ValveTimingChart state={state} />
      <PressureChart state={state} />
    </div>
  )
}
