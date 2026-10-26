import { useId, useRef, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { ArrowRight, Zap } from 'lucide-react'
import { useLab, useLabStoreApi } from '@/components/three/LabContext'
import { getTopic } from '@/lib/content'
import type { Topic } from '@/lib/schemas'
import { cn } from '@/lib/utils'
import { usePreferences } from '@/stores/preferences'
import { STROKES, crankAngleFromProgress, strokeIndex, type StrokeId } from './kinematics'
import {
  EVENT_LABEL,
  STROKE_SUMMARY,
  engineEventAt,
  formatCamDegrees,
  formatDegrees,
  gasStateLabel,
  pistonMotionLabel,
  strokeRange,
  valveStateLabel,
} from './engineText'
import { useEngineFrame } from './useEngineFrame'

/** The lesson whose steps are the single source of truth for this panel's text. */
const CYCLE_TOPIC_ID = 'four-stroke-cycle'
/** Deeper lessons linked from the lab, in reading order. */
const DEEPER_TOPIC_IDS = ['four-stroke-cycle', 'pistons-and-crankshaft', 'valves-and-camshaft', 'spark-ignition'] as const
/** Event cues offered as jump buttons (ids defined in config.ts). */
const EVENT_CUES = ['overlap', 'bdc', 'spark', 'tdc'] as const

/**
 * Cue-synchronised explanation for the engine lab: the current stroke (text
 * from the four-stroke-cycle lesson steps at the reader's level), callouts for
 * the spark and valve overlap, stroke / event jump buttons that drive the
 * animation, a live state table and links to the deeper lessons.
 */
export function EngineExplanation() {
  const cue = useLab((s) => s.cue) as StrokeId | null
  const event = useLab((s) => engineEventAt(crankAngleFromProgress(s.progress)))
  const level = usePreferences((p) => p.level)
  const steps = getTopic(CYCLE_TOPIC_ID)?.steps ?? []
  const stroke: StrokeId = cue ?? 'intake'
  const step = steps.find((st) => st.cue === stroke)
  const eventStep = event ? steps.find((st) => st.cue === event) : undefined
  const textFor = (st: { beginner: string; technical: string }) => (level === 'technical' ? st.technical : st.beginner)
  const titleId = useId()

  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby={titleId} data-testid="engine-stroke-card">
        <p className="eyebrow">
          Stroke {strokeIndex(stroke) + 1} of 4 · {strokeRange(stroke)} crank
        </p>
        <h3 id={titleId} className="mt-1 text-xl font-semibold text-paper" aria-live="polite">
          {step?.title ?? `${STROKES[strokeIndex(stroke)].label} stroke`}
        </h3>
        <StrokeProgress />
        <p className="mt-3 text-sm leading-relaxed text-steel-300">{step ? textFor(step) : STROKE_SUMMARY[stroke]}</p>

        {event && (
          <div className="mt-3 rounded-lg border border-amber/30 bg-amber/[0.06] p-3" data-testid="engine-event">
            <p className="eyebrow flex items-center gap-1.5 text-amber">
              <Zap className="size-3.5" aria-hidden />
              {EVENT_LABEL[event]}
            </p>
            {eventStep && (
              <>
                <p className="mt-1 text-sm font-medium text-paper">{eventStep.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-steel-300">{textFor(eventStep)}</p>
              </>
            )}
          </div>
        )}
      </section>

      <StrokeButtons current={stroke} />
      <LiveStateTable />
      <DeeperTopics />
    </div>
  )
}

/** Thin bar showing how far through the current stroke the piston is (written per frame, no re-render). */
function StrokeProgress() {
  const bar = useRef<HTMLDivElement>(null)
  useEngineFrame((s) => {
    if (bar.current) bar.current.style.transform = `scaleX(${(s.crankDeg % 180) / 180})`
  })
  return (
    <div className="mt-2 h-0.5 overflow-hidden rounded bg-white/[0.07]" aria-hidden>
      <div ref={bar} className="h-full origin-left bg-amber" />
    </div>
  )
}

function StrokeButtons({ current }: { current: StrokeId }) {
  const store = useLabStoreApi()
  const cues = useLab((s) => s.config.cues)
  const seek = (id: string) => store.getState().seekCue(id)
  return (
    <div className="flex flex-col gap-2">
      <div role="group" aria-label="Jump to a stroke" className="grid grid-cols-2 gap-1.5">
        {STROKES.map((s, i) => {
          const active = s.id === current
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => seek(s.id)}
              aria-pressed={active}
              className={cn(
                'flex min-h-12 flex-col items-start justify-center rounded-lg border px-2.5 py-1.5 text-left transition-colors',
                active ? 'border-amber/60 bg-amber/10 text-paper' : 'border-white/[0.08] text-steel-300 hover:border-cyan/40 hover:text-paper',
              )}
            >
              <span className="text-sm font-medium">
                <span className="mr-1 font-mono text-[11px] text-steel-400">{i + 1}</span>
                {s.label}
              </span>
              <span className="font-mono text-[10px] text-steel-400">{strokeRange(s.id)}</span>
            </button>
          )
        })}
      </div>
      <div role="group" aria-label="Jump to an event" className="flex flex-wrap gap-1.5 pointer-coarse:gap-y-3">
        {EVENT_CUES.map((id) => {
          const c = cues.find((x) => x.id === id)
          return c ? (
            <button
              key={id}
              type="button"
              onClick={() => seek(id)}
              className="relative hit-area min-h-9 rounded-md border border-white/[0.08] px-2.5 text-xs text-steel-300 transition-colors hover:border-cyan/40 hover:text-paper"
            >
              {c.label}
            </button>
          ) : null
        })}
      </div>
    </div>
  )
}

type Cell = 'crank' | 'cam' | 'piston' | 'intake' | 'exhaust' | 'spark' | 'gas' | 'pressure'

/** Live numbers, written straight to the DOM on every progress change (no React re-render per frame). */
function LiveStateTable() {
  const root = useRef<HTMLTableElement>(null)
  useEngineFrame((s) => {
    const table = root.current
    if (!table) return
    const set = (k: Cell, text: string) => {
      const el = table.querySelector<HTMLElement>(`[data-cell="${k}"]`)
      if (el && el.textContent !== text) el.textContent = text
    }
    const bar = (k: 'intake' | 'exhaust', fraction: number) => {
      const el = table.querySelector<HTMLElement>(`[data-bar="${k}"]`)
      if (el) el.style.transform = `scaleX(${fraction})`
    }
    set('crank', formatDegrees(s.crankDeg))
    set('cam', formatCamDegrees(s.camDeg))
    set('piston', pistonMotionLabel(s.motion))
    set('intake', valveStateLabel(s.intakeOpen))
    set('exhaust', valveStateLabel(s.exhaustOpen))
    set('spark', s.spark > 0 ? 'Firing' : 'Off')
    set('gas', gasStateLabel(s))
    set('pressure', `${s.pressureBar.toFixed(s.pressureBar < 10 ? 1 : 0)} bar`)
    bar('intake', s.intakeOpen)
    bar('exhaust', s.exhaustOpen)
  })

  return (
    <table ref={root} className="w-full text-sm" data-testid="engine-live-state">
      <caption className="eyebrow mb-1.5 text-left">Live state</caption>
      <tbody className="divide-y divide-white/[0.05]">
        <Row label="Crank angle">
          <span data-cell="crank" className="font-mono tabular-nums text-paper" />
        </Row>
        <Row label="Camshaft angle" hint="half crank speed">
          <span data-cell="cam" className="font-mono tabular-nums text-paper" />
        </Row>
        <Row label="Piston">
          <span data-cell="piston" />
        </Row>
        <Row label="Intake valve">
          <ValueWithBar cell="intake" colour="bg-cyan" />
        </Row>
        <Row label="Exhaust valve">
          <ValueWithBar cell="exhaust" colour="bg-amber" />
        </Row>
        <Row label="Spark">
          <span data-cell="spark" />
        </Row>
        <Row label="Cylinder" hint="conceptual">
          <span data-cell="gas" />
        </Row>
        <Row label="Pressure" hint="illustrative model">
          <span data-cell="pressure" className="font-mono tabular-nums" />
        </Row>
      </tbody>
    </table>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <tr>
      <th scope="row" className="py-1.5 pr-3 text-left align-top font-normal text-steel-400">
        {label}
        {hint && <span className="block font-mono text-[10px] text-steel-500">{hint}</span>}
      </th>
      <td className="py-1.5 text-right align-top text-steel-300">{children}</td>
    </tr>
  )
}

function ValueWithBar({ cell, colour }: { cell: 'intake' | 'exhaust'; colour: string }) {
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <span className="h-1 w-14 overflow-hidden rounded bg-white/[0.07]" aria-hidden>
        <span data-bar={cell} className={cn('block h-full w-full origin-left', colour)} style={{ transform: 'scaleX(0)' }} />
      </span>
      <span data-cell={cell} className="min-w-[5.5rem] font-mono tabular-nums" />
    </span>
  )
}

function DeeperTopics() {
  const { pathname } = useLocation()
  const topics = DEEPER_TOPIC_IDS.map((id) => getTopic(id)).filter((t): t is Topic => t !== undefined && pathname !== `/topics/${t.slug}`)
  if (topics.length === 0) return null
  return (
    <nav aria-label="Deeper lessons">
      <p className="eyebrow mb-1.5">Go deeper</p>
      <ul className="flex flex-col gap-1 pointer-coarse:gap-2">
        {topics.map((t) => (
          <li key={t.id}>
            <Link
              to={`/topics/${t.slug}`}
              className="relative hit-area group flex min-h-10 items-center justify-between gap-2 rounded-md border border-white/[0.06] px-3 text-sm text-steel-300 transition-colors hover:border-cyan/40 hover:text-paper"
            >
              {t.title}
              <ArrowRight className="size-4 text-steel-500 transition-transform group-hover:translate-x-0.5 group-hover:text-cyan" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
