import { useId, useMemo, useRef, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { ArrowRight, Gauge } from 'lucide-react'
import { useLab, useLabStoreApi } from '@/components/three/LabContext'
import { selectActiveStepId } from '@/components/learning/labSync'
import { getTopic } from '@/lib/content'
import type { Topic } from '@/lib/schemas'
import { cn } from '@/lib/utils'
import { usePreferences } from '@/stores/preferences'
import { planFor, summarizeStop, type BrakingPhase } from './braking'
import { paramsMatch, runScenario } from './brakingActions'
import {
  PHASE_LABEL,
  PHASE_SUMMARY,
  VALVE_LABEL,
  formatDecel,
  formatEnergy,
  formatMetres,
  formatPressure,
  formatSeconds,
  formatSlip,
  modeText,
} from './brakingText'
import { SCENARIOS, type ScenarioId } from './config'
import { StopChart } from './StopChart'
import { useBrakingFrame } from './useBrakingFrame'

/** Lessons whose steps are the single source of truth for this panel's text (disc brake first, then ABS). */
const STEP_TOPIC_IDS = ['disc-brakes', 'anti-lock-braking'] as const
/** Deeper lessons linked from the lab, in reading order. */
const DEEPER_TOPIC_IDS = ['brake-hydraulics', 'disc-brakes', 'anti-lock-braking', 'tyres-and-grip'] as const
/** Event cues offered as jump buttons (ids defined in config.ts). */
const EVENT_CUES = ['clamp', 'heat', 'grip-limit', 'abs-release', 'abs-reapply'] as const

const SCENARIO_BUTTONS: { id: ScenarioId; label: string; detail: string }[] = [
  { id: 'firmStop', label: 'Firm stop', detail: 'Dry · within grip' },
  { id: 'wetLock', label: 'Hard stop, no ABS', detail: 'Wet · wheel locks' },
  { id: 'wetAbs', label: 'Hard stop, ABS', detail: 'Wet · ABS cycles' },
]

const ALL_STEPS = () => STEP_TOPIC_IDS.flatMap((id) => getTopic(id)?.steps ?? [])

/**
 * Cue-synchronised explanation for the braking lab: the current phase (text
 * from the disc-brake and ABS lesson steps at the reader's level), scenario
 * and event buttons that drive the animation, the stop chart and summary, a
 * live state table and links to the deeper lessons.
 */
export function BrakingExplanation() {
  const steps = useMemo(() => ALL_STEPS(), [])
  const stepId = useLab((s) => selectActiveStepId(steps, s))
  const phase = (useLab((s) => s.cue) ?? 'rolling') as BrakingPhase
  const level = usePreferences((p) => p.level)
  const step = steps.find((st) => st.id === stepId)
  const titleId = useId()

  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby={titleId} data-testid="braking-phase-card">
        <p className="eyebrow">Now · {PHASE_LABEL[phase]}</p>
        <h3 id={titleId} className="mt-1 text-xl font-semibold text-paper" aria-live="polite">
          {step?.title ?? PHASE_LABEL[phase]}
        </h3>
        <StopProgress />
        <p className="mt-3 text-sm leading-relaxed text-steel-300">{step ? (level === 'technical' ? step.technical : step.beginner) : PHASE_SUMMARY[phase]}</p>
      </section>

      <ScenarioButtons />
      <StopSummaryCard />
      <LiveStateTable />
      <EventButtons />
      <DeeperTopics />
    </div>
  )
}

/** Thin bar: how far through the braking event the timeline is (written per frame, no re-render). */
function StopProgress() {
  const bar = useRef<HTMLDivElement>(null)
  useBrakingFrame((st, plan) => {
    if (bar.current) bar.current.style.transform = `scaleX(${(st.t / plan.duration).toFixed(4)})`
  })
  return (
    <div className="mt-2 h-0.5 overflow-hidden rounded bg-white/[0.07]" aria-hidden>
      <div ref={bar} className="h-full origin-left scale-x-0 bg-amber" />
    </div>
  )
}

function ScenarioButtons() {
  const store = useLabStoreApi()
  const params = useLab((s) => s.params)
  return (
    <div role="group" aria-label="Try a scenario" className="grid grid-cols-3 gap-1.5">
      {SCENARIO_BUTTONS.map((b) => {
        const active = paramsMatch(params, SCENARIOS[b.id])
        return (
          <button
            key={b.id}
            type="button"
            onClick={() => runScenario(store, SCENARIOS[b.id])}
            aria-pressed={active}
            className={cn(
              'flex min-h-12 flex-col items-start justify-center rounded-lg border px-2.5 py-1.5 text-left transition-colors',
              active ? 'border-amber/60 bg-amber/10 text-paper' : 'border-white/[0.08] text-steel-300 hover:border-cyan/40 hover:text-paper',
            )}
          >
            <span className="text-[13px] leading-tight font-medium">{b.label}</span>
            <span className="mt-0.5 font-mono text-[10px] leading-tight text-steel-400">{b.detail}</span>
          </button>
        )
      })}
    </div>
  )
}

function StopSummaryCard() {
  const params = useLab((s) => s.params)
  const plan = planFor(params)
  const summary = useMemo(() => summarizeStop(plan), [plan])
  const stats: [string, string][] = [
    ['Stop time', formatSeconds(summary.stopTime)],
    ['Distance', formatMetres(summary.stopDistance)],
    ['Peak decel.', formatDecel(summary.peakDecel)],
    ['Disc rise', `+${Math.round(summary.discRiseK)} K`],
  ]
  return (
    <section aria-label="This stop" className="flex flex-col gap-3 rounded-lg border border-white/[0.06] bg-graphite-950/40 p-3" data-testid="stop-summary">
      <p className="eyebrow flex items-center gap-1.5">
        <Gauge className="size-3.5" aria-hidden />
        This stop
      </p>
      <dl className="grid grid-cols-4 gap-2">
        {stats.map(([k, v]) => (
          <div key={k}>
            <dt className="font-mono text-[10px] text-steel-400">{k}</dt>
            <dd className="font-mono text-sm tabular-nums text-paper">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs leading-snug text-steel-300">{modeText(plan)}</p>
      <StopChart />
    </section>
  )
}

type Cell = 'wheel' | 'valves' | 'master' | 'caliper' | 'brake' | 'tyre'

/** Live numbers, written straight to the DOM on every progress change (no React re-render per frame). */
function LiveStateTable() {
  const root = useRef<HTMLTableElement>(null)
  useBrakingFrame((st) => {
    const table = root.current
    if (!table) return
    const set = (k: Cell, text: string) => {
      const el = table.querySelector<HTMLElement>(`[data-cell="${k}"]`)
      if (el && el.textContent !== text) el.textContent = text
    }
    set('wheel', st.vehicleSpeed <= 1e-3 ? 'At rest' : st.wheelLocked ? 'Locked — sliding' : `Rolling · slip ${formatSlip(st.slip)}`)
    set('valves', VALVE_LABEL[st.absValve])
    set('master', formatPressure(st.masterPressurePa))
    set('caliper', formatPressure(st.caliperPressurePa))
    set('brake', formatEnergy(st.energyBrake))
    set('tyre', formatEnergy(st.energyTyre))
  })
  return (
    <table ref={root} className="w-full text-sm" data-testid="braking-live-state">
      <caption className="eyebrow mb-1.5 text-left">Live state</caption>
      <tbody className="divide-y divide-white/[0.05]">
        <Row label="Wheel">
          <span data-cell="wheel" />
        </Row>
        <Row label="ABS valves" hint="conceptual">
          <span data-cell="valves" />
        </Row>
        <Row label="Master cylinder">
          <span data-cell="master" className="font-mono tabular-nums" />
        </Row>
        <Row label="Caliper">
          <span data-cell="caliper" className="font-mono tabular-nums" />
        </Row>
        <Row label="Heat in brake" hint="disc and pads">
          <span data-cell="brake" className="font-mono tabular-nums" />
        </Row>
        <Row label="Heat in tyre" hint="sliding on the road">
          <span data-cell="tyre" className="font-mono tabular-nums" />
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

function EventButtons() {
  const store = useLabStoreApi()
  const cues = useLab((s) => s.config.cues)
  return (
    <div role="group" aria-label="Jump to a moment" className="flex flex-wrap gap-1.5">
      {EVENT_CUES.map((id) => {
        const c = cues.find((x) => x.id === id)
        return c ? (
          <button
            key={id}
            type="button"
            onClick={() => store.getState().seekCue(id)}
            className="min-h-9 rounded-md border border-white/[0.08] px-2.5 text-xs text-steel-300 transition-colors hover:border-cyan/40 hover:text-paper"
          >
            {c.label}
          </button>
        ) : null
      })}
    </div>
  )
}

function DeeperTopics() {
  const { pathname } = useLocation()
  const topics = DEEPER_TOPIC_IDS.map((id) => getTopic(id)).filter((t): t is Topic => t !== undefined && pathname !== `/topics/${t.slug}`)
  if (topics.length === 0) return null
  return (
    <nav aria-label="Deeper lessons">
      <p className="eyebrow mb-1.5">Go deeper</p>
      <ul className="flex flex-col gap-1">
        {topics.map((t) => (
          <li key={t.id}>
            <Link
              to={`/topics/${t.slug}`}
              className="group flex min-h-10 items-center justify-between gap-2 rounded-md border border-white/[0.06] px-3 text-sm text-steel-300 transition-colors hover:border-cyan/40 hover:text-paper"
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
