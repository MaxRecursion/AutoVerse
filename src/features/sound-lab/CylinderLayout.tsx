import { useEffect, useId, useMemo, useRef } from 'react'
import {
  bankAxis,
  combustionGlow,
  CRANK_RADIUS,
  crankSections,
  DEG,
  exhaustPuff,
  localPinAngle,
  mod,
  ignitionFlash,
  pistonPinDistance,
  VISUAL_SLOWDOWN,
  type FrameBus,
  type Side,
} from './animation'
import type { EngineSpec } from './engines'
import type { FiringEvent } from './firing'

interface CylinderLayoutProps {
  spec: EngineSpec
  events: FiringEvent[]
  /** The chosen bank angle; the drawing eases towards it. */
  bankAngle: number
  /** Which way the crank turns in the drawing (from the production firing order). */
  sense: 1 | -1
  bus: FrameBus
  /** Running with motion allowed (for the caption). */
  animating: boolean
  /** Allows the WebGL fallback and optional timing diagram to coexist. */
  testId?: string
}

/* Each bore is drawn in its own frame: crank centre at the origin, bore axis straight up. */
const HEAD_Y = -82
const LINER_BOTTOM = -30
const CROWN_ABOVE_PIN = 9
const LABEL_R = 112

/** Where every section sits, and how big it can be drawn without touching its neighbours, for a bank angle. */
function geometry(spec: EngineSpec, bankAngle: number) {
  const inline = spec.layout === 'inline'
  const slots = inline ? spec.cylinders : spec.cylinders / 2
  const pitch = 532 / slots
  const h = (inline ? 0 : bankAngle / 2) * DEG
  const halfWidth = inline ? 24 : Math.max(19 * Math.cos(h) + 100 * Math.sin(h), (LABEL_R + 8) * Math.sin(h) + 8)
  return {
    pitch,
    slots,
    scale: Math.min(1.05, pitch / (2 * halfWidth + 8)),
    crankY: spec.layout === 'flat' ? 132 : 176,
    x: (slot: number) => 34 + pitch * (slot + 0.5),
  }
}

/** Piston, rod, crank and combustion cues for one cylinder at a crank angle. */
function pose(event: FiringEvent, sense: 1 | -1, playhead: number, live: boolean) {
  const pin = localPinAngle(sense, playhead, event.angle)
  const phase = mod(playhead - event.angle, 720)
  return {
    pin,
    distance: pistonPinDistance(pin),
    glow: live ? combustionGlow(phase) : 0,
    spark: live ? ignitionFlash(phase) : 0,
    puff: live ? exhaustPuff(phase) : { strength: 0, travel: 0 },
  }
}

type Pose = ReturnType<typeof pose>

const rodPath = (p: Pose) =>
  `M0 ${(-p.distance).toFixed(2)}L${(CRANK_RADIUS * Math.sin(p.pin * DEG)).toFixed(2)} ${(-CRANK_RADIUS * Math.cos(p.pin * DEG)).toFixed(2)}`
const flameHeight = (p: Pose) => Math.max(0, -p.distance - CROWN_ABOVE_PIN - HEAD_Y)
const outwardOf = (side: Side) => (side === 'A' ? -1 : 1)
const puffTransform = (side: Side, p: Pose) => `translate(${(outwardOf(side) * (20 + 22 * p.puff.travel)).toFixed(2)} ${(-88 - 5 * p.puff.travel).toFixed(2)})`
const cylinderTransform = (x: number, crankY: number, axis: number, scale: number) => `translate(${x.toFixed(2)} ${crankY}) rotate(${axis.toFixed(2)}) scale(${scale.toFixed(4)})`
const labelTransform = (axis: number, scale: number) => `translate(0 ${-LABEL_R}) rotate(${(-axis).toFixed(2)}) scale(${(1 / scale).toFixed(4)})`

function angleArc(x: number, crankY: number, halfAngle: number): string {
  const r = 22
  const dx = r * Math.sin(halfAngle * DEG)
  const y = crankY - r * Math.cos(halfAngle * DEG)
  return `M${(x - dx).toFixed(2)} ${y.toFixed(2)}A${r} ${r} 0 ${halfAngle > 90 ? 1 : 0} 1 ${(x + dx).toFixed(2)} ${y.toFixed(2)}`
}

interface CylinderRefs {
  group: SVGGElement | null
  label: SVGTextElement | null
  piston: SVGGElement | null
  rod: SVGPathElement | null
  crank: SVGGElement | null
  flame: SVGRectElement | null
  /** Spark at the plug tip, or a diesel's fuel spray. */
  spark: SVGElement | null
  puff: SVGGElement | null
}

/**
 * Original teaching schematic: one cross-section per crank position, each
 * bore leaning at its bank's angle. Pistons follow a true slider-crank (rod
 * length constant). Each throw is drawn where it really points, so cylinders
 * on a shared crankpin show one pin carrying both rods, while split pins,
 * boxer throws and the 60° V6 show separate pins. A flame fills the chamber
 * after each firing, the spark flashes and the exhaust pulse leaves on the
 * outer side. Moved by the shared frame loop through refs.
 */
export function CylinderLayout({ spec, events, bankAngle, sense, bus, animating, testId = 'cylinder-layout' }: CylinderLayoutProps) {
  const id = useId()
  const inline = spec.layout === 'inline'
  // Diesels have no spark plug: an injector sprays fuel into air hot enough from compression to light it.
  const diesel = spec.ignition === 'compression'
  const angle = inline ? 0 : spec.layout === 'flat' ? 180 : bankAngle
  const geo = geometry(spec, angle)
  const sections = useMemo(() => crankSections(spec, events), [spec, events])
  const parts = useRef(new Map<number, CylinderRefs>())
  const arcs = useRef<(SVGPathElement | null)[]>([])
  const angleLabels = useRef<(SVGTextElement | null)[]>([])
  /** Ref callback for one part of one cylinder (runs at commit, never during render). */
  const part = (index: number, key: keyof CylinderRefs) => (el: SVGElement | null) => {
    let found = parts.current.get(index)
    if (!found) {
      found = { group: null, label: null, piston: null, rod: null, crank: null, flame: null, spark: null, puff: null }
      parts.current.set(index, found)
    }
    ;(found as unknown as Record<keyof CylinderRefs, SVGElement | null>)[key] = el
  }
  const sectionLabel = inline ? `${spec.cylinders} vertical cylinders in one row` : `${geo.slots} pairs of cylinders with ${angle}° between the banks`

  useEffect(() => {
    let drawnBank = Number.NaN
    let wasLive = false
    let first = true
    return bus.subscribe((frame) => {
      // Bank angle: lean the bores, resize to fit, redraw the angle marks.
      if (!inline && frame.bank !== drawnBank) {
        drawnBank = frame.bank
        const g = geometry(spec, spec.layout === 'flat' ? 180 : frame.bank)
        for (const section of sections) {
          const x = g.x(section.slot)
          for (const { event, side } of section.cylinders) {
            const r = parts.current.get(event.index)
            const axis = bankAxis(side, spec.layout === 'flat' ? 180 : frame.bank)
            r?.group?.setAttribute('transform', cylinderTransform(x, g.crankY, axis, g.scale))
            r?.label?.setAttribute('transform', labelTransform(axis, g.scale))
          }
          if (spec.layout !== 'flat') {
            arcs.current[section.slot]?.setAttribute('d', angleArc(x, g.crankY, frame.bank / 2))
            const text = angleLabels.current[section.slot]?.firstChild
            if (text) text.nodeValue = `${Math.round(frame.bank)}°`
          }
        }
      }
      // Motion: every frame while animating, plus once on subscribing and once after stopping.
      const live = frame.animate
      if (!live && !wasLive && !first) return
      wasLive = live
      first = false
      for (const section of sections) {
        for (const { event, side } of section.cylinders) {
          const r = parts.current.get(event.index)
          if (!r) continue
          const p = pose(event, sense, frame.playhead, live)
          r.piston?.setAttribute('transform', `translate(0 ${(-p.distance).toFixed(2)})`)
          r.rod?.setAttribute('d', rodPath(p))
          r.crank?.setAttribute('transform', `rotate(${p.pin.toFixed(2)})`)
          r.flame?.setAttribute('height', flameHeight(p).toFixed(2))
          r.flame?.setAttribute('opacity', (0.85 * p.glow).toFixed(3))
          r.spark?.setAttribute('opacity', p.spark.toFixed(3))
          r.puff?.setAttribute('opacity', (0.9 * p.puff.strength).toFixed(3))
          r.puff?.setAttribute('transform', puffTransform(side, p))
          if (r.group) r.group.dataset.firing = p.glow > 0 ? 'true' : 'false'
        }
      }
    })
  }, [bus, spec, sections, sense, inline])

  return (
    <figure className="min-w-0 rounded-xl border border-white/[0.08] bg-graphite-950/60 p-4" data-testid={testId} data-bank-angle={angle}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h3 className="text-sm font-semibold text-paper">Cylinder layout</h3>
        <p className="flex flex-wrap gap-3 font-mono text-[10px] text-steel-400">
          {inline ? (
            <span className="inline-flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-full bg-cyan" />One cylinder row</span>
          ) : (
            <>
              <span className="inline-flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-full bg-cyan" />Bank A</span>
              <span className="inline-flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-full bg-amber" />Bank B</span>
            </>
          )}
          <span className="inline-flex items-center gap-1.5"><span aria-hidden className="size-2 rotate-45 bg-paper" />{diesel ? 'Injection and flame (diesel)' : 'Spark and flame'}</span>
        </p>
      </div>
      <div className="mt-3 overflow-x-auto rounded-lg bg-blueprint" tabIndex={0} role="region" aria-label="Cylinder schematic; scroll horizontally on a small screen to inspect every cylinder">
        <svg viewBox="0 0 600 248" role="img" aria-labelledby={`${id}-title ${id}-description`} className="h-auto w-full min-w-[480px]">
          <title id={`${id}-title`}>{`${spec.name}: ${sectionLabel}.`}</title>
          <desc id={`${id}-description`}>
            Separate cross-sections are arranged along the crankshaft. Each piston is driven by a connecting rod of fixed length and reaches the top
            every 360°; its chamber fires once per 720°. Cylinders that share a crankpin are drawn on one pin. Cylinder numbers follow the
            preset’s manufacturer numbering.
            {spec.order === null ? ' This preset has no published cylinder numbering here, so the cylinders carry their bank letters.' : ''}
            {diesel ? ' This is a diesel: each chamber lights when fuel is injected into air heated by compression, so it shows an injector and its spray rather than a spark plug.' : ''}
            {' '}Proportions are illustrative.
          </desc>
          <text x="28" y="24" className="fill-steel-400 font-mono text-[11px]">
            {inline ? 'INLINE · ONE ROW' : spec.layout === 'flat' ? 'BOXER · OPPOSED BANKS' : `V LAYOUT · ${angle}° BANK ANGLE`}
          </text>
          <path d={`M24 ${geo.crankY}H576`} stroke="var(--color-steel-500)" strokeWidth="2" strokeDasharray="4 5" />
          {sections.map((section) => {
            const x = geo.x(section.slot)
            return (
              <g key={section.slot}>
                {section.cylinders.map(({ event, side }) => {
                  const p = pose(event, sense, 0, false)
                  const axis = bankAxis(side, angle)
                  const label = event.cylinder === null ? event.bank : String(event.cylinder)
                  return (
                    <g
                      key={event.index}
                      ref={part(event.index, 'group')}
                      transform={cylinderTransform(x, geo.crankY, axis, geo.scale)}
                      className={side === 'B' ? 'text-amber' : 'text-cyan'}
                      data-cylinder={label}
                      data-firing="false"
                    >
                      <rect x={-15} y={HEAD_Y} width={30} height={LINER_BOTTOM - HEAD_Y} fill="var(--color-graphite-900)" />
                      <rect
                        ref={part(event.index, 'flame')}
                        x={-14}
                        y={HEAD_Y}
                        width={28}
                        height={flameHeight(p)}
                        fill="currentColor"
                        opacity={0}
                      />
                      <g
                        ref={part(event.index, 'crank')}
                        transform={`rotate(${p.pin.toFixed(2)})`}
                      >
                        <path d="M-13 3A13 13 0 0 0 13 3Z" fill="var(--color-graphite-800)" stroke="currentColor" strokeOpacity={0.45} strokeWidth={1.25} />
                        <path d={`M0 0V${-CRANK_RADIUS}`} stroke="currentColor" strokeWidth={5} strokeLinecap="round" />
                        <circle cx={0} cy={-CRANK_RADIUS} r={3.5} fill="var(--color-graphite-850)" stroke="currentColor" strokeWidth={1.5} />
                      </g>
                      <path
                        ref={part(event.index, 'rod')}
                        d={rodPath(p)}
                        stroke="var(--color-steel-300)"
                        strokeWidth={3.5}
                        strokeLinecap="round"
                      />
                      <g
                        ref={part(event.index, 'piston')}
                        transform={`translate(0 ${(-p.distance).toFixed(2)})`}
                      >
                        <rect x={-11} y={-CROWN_ABOVE_PIN} width={22} height={15} rx={1.5} fill="var(--color-steel-300)" stroke="var(--color-paper)" strokeWidth={1} />
                        <path d="M-10 -6H10M-10 -3H10" stroke="var(--color-graphite-700)" strokeWidth={1} />
                        <circle r={2} fill="var(--color-graphite-700)" />
                      </g>
                      <path d={`M-15 ${HEAD_Y}V${LINER_BOTTOM}M15 ${HEAD_Y}V${LINER_BOTTOM}`} stroke="currentColor" strokeOpacity={0.55} strokeWidth={1.5} />
                      <path d={`M-19 ${HEAD_Y}H19V-94H-19Z`} fill="var(--color-graphite-850)" stroke="currentColor" strokeWidth={1.5} />
                      {diesel ? (
                        <>
                          <path d="M-3 -105H3V-94H-3Z" fill="var(--color-steel-400)" />
                          <path d="M-1.5 -94H1.5V-90H-1.5Z" fill="var(--color-steel-300)" />
                          <path ref={part(event.index, 'spark')} d={`M0 ${HEAD_Y - 1}L-9 ${HEAD_Y + 9}H9Z`} fill="var(--color-paper)" opacity={0} />
                        </>
                      ) : (
                        <>
                          <path d="M0 -103V-90" stroke="var(--color-steel-400)" strokeWidth={2.5} strokeLinecap="round" />
                          <circle ref={part(event.index, 'spark')} cx={0} cy={HEAD_Y - 2} r={4} fill="var(--color-paper)" opacity={0} />
                        </>
                      )}
                      <g
                        ref={part(event.index, 'puff')}
                        opacity={0}
                        transform={puffTransform(side, p)}
                      >
                        <circle r={3.2} fill="currentColor" />
                        <circle cx={outwardOf(side) * 6} cy={-3} r={2.2} fill="currentColor" opacity={0.7} />
                      </g>
                      <text
                        ref={part(event.index, 'label')}
                        transform={labelTransform(axis, geo.scale)}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill="currentColor"
                        className="font-mono text-[14px] font-semibold"
                      >
                        {label}
                      </text>
                    </g>
                  )
                })}
                <circle cx={x} cy={geo.crankY} r={5} fill="var(--color-graphite-850)" stroke="var(--color-steel-400)" strokeWidth="1.5" />
                {!inline && spec.layout !== 'flat' && (
                  <>
                    <path
                      ref={(el) => {
                        arcs.current[section.slot] = el
                      }}
                      d={angleArc(x, geo.crankY, angle / 2)}
                      fill="none"
                      stroke="var(--color-steel-400)"
                      strokeWidth="1"
                    />
                    <text
                      ref={(el) => {
                        angleLabels.current[section.slot] = el
                      }}
                      x={x}
                      y={geo.crankY + 30}
                      textAnchor="middle"
                      className="fill-steel-300 font-mono text-[12px]"
                    >
                      {/* One text node, so the frame loop can rewrite it while the angle eases. */}
                      {`${angle}°`}
                    </text>
                  </>
                )}
              </g>
            )
          })}
          <path d="M204 230h192m-6-4 6 4-6 4" fill="none" stroke="var(--color-steel-500)" strokeWidth="1.25" />
          <text x="300" y="220" textAnchor="middle" className="fill-steel-400 font-mono text-[10px]">
            SECTIONS ALONG THE CRANKSHAFT
          </text>
        </svg>
      </div>
      <figcaption className="mt-3 text-xs leading-relaxed text-steel-400">
        {animating ? `Slowed ${VISUAL_SLOWDOWN}×, turning at the engine speed you hear.` : 'Still view.'} Each piston reaches the top every 360° and
        fires once every 720°. Cylinders sharing a crankpin ride on one pin; split pins and boxer throws show as separate pins.
      </figcaption>
    </figure>
  )
}
