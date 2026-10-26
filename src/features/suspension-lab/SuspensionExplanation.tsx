import { useId, useMemo, useRef, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { AlertTriangle, ArrowRight, CircleDot } from 'lucide-react'
import { useLab, useLabStoreApi } from '@/components/three/LabContext'
import { getTopic } from '@/lib/content'
import type { Step, Topic } from '@/lib/schemas'
import type { LabState } from '@/lib/simulation/labStore'
import { cn } from '@/lib/utils'
import { usePreferences } from '@/stores/preferences'
import { PHASE_CUE_IDS, SCENARIO_CUE_IDS, type ScenarioCueId } from './config'
import { endStopForce, type ResponsePhase } from './quarterCar'
import { ResponseChart } from './ResponseChart'
import { PHASE_SUMMARY, formatCamber, formatKn, formatLoad, formatMm, formatTravel, responseVerdict, suspensionMotionLabel, settingsSummary } from './suspensionText'
import { frameOf, useSuspensionFrame, useSuspensionResponse, useSuspensionSettings } from './useSuspensionFrame'

/** Lessons whose steps are the single source of truth for this panel's text (first match wins; the lesson being read goes first). */
const LESSON_TOPIC_IDS = ['suspension-basics', 'springs-and-dampers'] as const
/** Deeper lessons linked from the lab, in reading order. */
const DEEPER_TOPIC_IDS = ['suspension-basics', 'springs-and-dampers', 'tyres-and-grip', 'steering-systems'] as const

/** What each scenario sets up, in a few words (the lesson step carries the full story). */
const SCENARIO_HINT: Record<ScenarioCueId, string> = {
  'full-bump': 'Most compressed moment on the bump',
  airborne: 'Pothole: the tyre drops off the road',
  'soft-float': 'Worn damper: the body floats on',
  'well-damped': 'Balanced damper: settled in one bounce',
  'stiff-skip': 'Over-firm damper: the tyre skips',
  'wheel-hop': 'Ripples set the wheel hopping',
  'soft-spring': 'Soft spring reaches the bump stop',
}

function lessonSteps(pathname: string): Step[] {
  const topics = LESSON_TOPIC_IDS.map((id) => getTopic(id)).filter((t): t is Topic => t !== undefined)
  const reading = topics.findIndex((t) => pathname === `/topics/${t.slug}`)
  if (reading > 0) topics.unshift(...topics.splice(reading, 1))
  return topics.flatMap((t) => t.steps)
}

const stepForCue = (steps: Step[], cue: string) => steps.find((s) => s.cue === cue)

/** Whether the corner is on a rubber end stop right now. */
const onEndStop = (s: LabState) => {
  const f = frameOf(s)
  return endStopForce(f.response.params, f.pose.travel) !== 0
}

/**
 * Cue-synchronised explanation for the suspension lab: the current phase
 * (text from the suspension lessons at the reader's level), live callouts
 * when the tyre leaves the road or the suspension hits its stop, phase and
 * scenario buttons that drive the animation, the body-vs-wheel chart, a live
 * state table and links to the deeper lessons.
 */
export function SuspensionExplanation() {
  const cue = useLab((s) => s.cue) as ResponsePhase | null
  const airborne = useLab((s) => !frameOf(s).pose.contact)
  const stop = useLab(onEndStop)
  const level = usePreferences((p) => p.level)
  const settings = useSuspensionSettings()
  const response = useSuspensionResponse()
  const scenario = useLab(activeScenario)
  const { pathname } = useLocation()
  const steps = useMemo(() => lessonSteps(pathname), [pathname])
  const phase: ResponsePhase = cue ?? 'approach'
  // Paused on a scenario cue (from the list below or a lesson step): tell that scenario's story.
  const step = (scenario ? stepForCue(steps, scenario) : undefined) ?? stepForCue(steps, phase)
  const airborneStep = stepForCue(steps, 'airborne')
  const stopStep = stepForCue(steps, 'soft-spring')
  const textFor = (st: { beginner: string; technical: string }) => (level === 'technical' ? st.technical : st.beginner)
  const titleId = useId()
  // The callouts repeat the airborne / bump-stop steps, so skip them when that step is already the main text.
  const showAirborne = airborne && step !== airborneStep
  const showStop = stop && !airborne && step !== stopStep

  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby={titleId} data-testid="suspension-phase-card">
        <p className="eyebrow">{settingsSummary(settings)}</p>
        <h3 id={titleId} className="mt-1 text-xl font-semibold text-paper" aria-live="polite">
          {step?.title ?? phase}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-steel-300">{step ? textFor(step) : PHASE_SUMMARY[phase]}</p>

        {showAirborne && (
          <Callout tone="danger" testId="suspension-airborne" title="Tyre off the road">
            {airborneStep ? textFor(airborneStep) : 'The tyre has lifted off the road: for this instant it can neither steer nor brake.'}
          </Callout>
        )}
        {showStop && (
          <Callout tone="amber" testId="suspension-stop" title="On the bump stop">
            {stopStep
              ? textFor(stopStep)
              : 'The suspension has used its travel and the rubber bump stop is taking the load — a much stiffer spring for the last few millimetres.'}
          </Callout>
        )}
      </section>

      <PhaseButtons current={phase} />

      <section aria-label="Response over one lap" className="flex flex-col gap-2">
        <p className="eyebrow">Body vs wheel · one lap</p>
        <ResponseChart />
        <p className="text-xs leading-relaxed text-steel-400">{responseVerdict(response)}</p>
      </section>

      <LiveStateTable />
      <ScenarioList />
      <DeeperTopics />
    </div>
  )
}

function Callout({ tone, title, testId, children }: { tone: 'danger' | 'amber'; title: string; testId: string; children: ReactNode }) {
  const Icon = tone === 'danger' ? AlertTriangle : CircleDot
  return (
    <div
      className={cn('mt-3 rounded-lg border p-3', tone === 'danger' ? 'border-danger/35 bg-danger/[0.07]' : 'border-amber/30 bg-amber/[0.06]')}
      data-testid={testId}
    >
      <p className={cn('eyebrow flex items-center gap-1.5', tone === 'danger' ? 'text-danger' : 'text-amber')}>
        <Icon className="size-3.5" aria-hidden />
        {title}
      </p>
      <p className="mt-1 text-sm leading-relaxed text-steel-300">{children}</p>
    </div>
  )
}

function PhaseButtons({ current }: { current: ResponsePhase }) {
  const store = useLabStoreApi()
  const cues = useLab((s) => s.config.cues)
  return (
    <div role="group" aria-label="Jump to a phase" className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
      {PHASE_CUE_IDS.map((id, i) => {
        const c = cues.find((x) => x.id === id)
        const active = id === current
        return (
          <button
            key={id}
            type="button"
            onClick={() => store.getState().seekCue(id)}
            aria-pressed={active}
            className={cn(
              'flex min-h-11 pointer-coarse:min-h-12 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-left text-sm transition-colors',
              active ? 'border-amber/60 bg-amber/10 text-paper' : 'border-white/[0.08] text-steel-300 hover:border-cyan/40 hover:text-paper',
            )}
          >
            <span className="font-mono text-[11px] text-steel-400">{i + 1}</span>
            {c?.label ?? id}
          </button>
        )
      })}
    </div>
  )
}

/** Paused exactly on a scenario cue with its parameters applied. */
function activeScenario(s: LabState): string | null {
  if (s.playing) return null
  for (const id of SCENARIO_CUE_IDS) {
    const c = s.config.cues.find((x) => x.id === id)
    if (!c || c.progress === undefined || Math.abs(s.progress - c.progress) > 1e-6) continue
    if (Object.entries(c.params ?? {}).every(([k, v]) => s.params[k] === v)) return id
  }
  return null
}

function ScenarioList() {
  const store = useLabStoreApi()
  const cues = useLab((s) => s.config.cues)
  const active = useLab(activeScenario)
  return (
    <section aria-label="Try a scenario">
      <p className="eyebrow mb-1.5">Try a scenario</p>
      <ul className="grid gap-1.5">
        {SCENARIO_CUE_IDS.map((id) => {
          const c = cues.find((x) => x.id === id)
          if (!c) return null
          const on = active === id
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => store.getState().seekCue(id)}
                aria-pressed={on}
                className={cn(
                  'flex min-h-11 pointer-coarse:min-h-12 w-full flex-col items-start justify-center rounded-lg border px-3 py-1.5 text-left transition-colors',
                  on ? 'border-cyan/50 bg-cyan/[0.08] text-paper' : 'border-white/[0.08] text-steel-300 hover:border-cyan/40 hover:text-paper',
                )}
              >
                <span className="text-sm font-medium">{c.label}</span>
                <span className="text-xs text-steel-400">{SCENARIO_HINT[id]}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

type Cell = 'body' | 'wheel' | 'travel' | 'load' | 'force' | 'spring' | 'camber' | 'motion'

/** Live numbers, written straight to the DOM on every progress / parameter change (no React re-render per frame). */
function LiveStateTable() {
  const root = useRef<HTMLTableElement>(null)
  useSuspensionFrame((f) => {
    const table = root.current
    if (!table) return
    const set = (k: Cell, text: string) => {
      const el = table.querySelector<HTMLElement>(`[data-cell="${k}"]`)
      if (el && el.textContent !== text) el.textContent = text
    }
    set('body', formatMm(f.pose.body))
    set('wheel', formatMm(f.pose.wheel))
    set('travel', formatTravel(f.pose.travel))
    set('load', formatLoad(f.pose.loadFactor, f.pose.contact))
    set('force', formatKn(f.pose.tyreForce))
    set('spring', `${Math.round(f.link.coiloverLength * 1000)} mm`)
    set('camber', formatCamber(f.link.camberChangeDeg))
    set('motion', suspensionMotionLabel(f.pose.travelVelocity))
  })
  return (
    <table ref={root} className="w-full text-sm" data-testid="suspension-live-state">
      <caption className="eyebrow mb-1.5 text-left">Live state · illustrative model</caption>
      <tbody className="divide-y divide-white/[0.05]">
        <Row label="Body" hint="from ride height">
          <Value cell="body" />
        </Row>
        <Row label="Wheel centre" hint="from ride height">
          <Value cell="wheel" />
        </Row>
        <Row label="Suspension travel" hint="wheel relative to body">
          <Value cell="travel" />
        </Row>
        <Row label="Suspension">
          <Value cell="motion" />
        </Row>
        <Row label="Tyre load">
          <Value cell="load" />
        </Row>
        <Row label="Tyre force">
          <Value cell="force" />
        </Row>
        <Row label="Coil-over length" hint="eye to top mount">
          <Value cell="spring" />
        </Row>
        <Row label="Camber change" hint="− = top of wheel leans in">
          <Value cell="camber" />
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

const Value = ({ cell }: { cell: Cell }) => <span data-cell={cell} className="font-mono tabular-nums text-paper" />

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
