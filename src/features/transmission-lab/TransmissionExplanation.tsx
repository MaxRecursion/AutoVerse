import { useId, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { ArrowRight, ChevronRight } from 'lucide-react'
import { useLab, useLabStoreApi } from '@/components/three/LabContext'
import { getComponent, getTopic } from '@/lib/content'
import type { Topic } from '@/lib/schemas'
import { cn } from '@/lib/utils'
import { usePreferences } from '@/stores/preferences'
import { CLUTCH_CUES, PARAM, TRANSMISSION_CUES } from './config'
import { FINAL_DRIVE_RATIO, clutchState, gearKind, type ClutchState } from './gearbox'
import {
  CLUTCH_STATE_LABEL,
  CLUTCH_SUMMARY,
  GEAR_NAME,
  GEAR_SUMMARY,
  formatKw,
  formatMultiplication,
  formatPercent,
  formatRatio,
  formatRoadSpeed,
  formatRpm,
  formatTorque,
  trainExpression,
} from './gearboxText'
import { powerPathParts } from './powerPath'
import { useDriveState, useTransmissionParams } from './useTransmission'

/** Lessons whose steps are the single source of truth for this panel's text. */
const GEARBOX_TOPIC_ID = 'manual-gearbox'
const CLUTCH_TOPIC_ID = 'clutch'
/** Deeper lessons linked from the lab, in reading order. */
const DEEPER_TOPIC_IDS = ['manual-gearbox', 'clutch', 'gear-ratios', 'torque-and-power', 'automatic-transmission', 'differential'] as const

const CLUTCH_CUE_IDS: readonly string[] = Object.values(CLUTCH_CUES)

/** Pedal shortcuts (the clutch cues' pedal positions), offered without changing the selected gear. */
const PEDAL_SHORTCUTS: { state: ClutchState; label: string; cue: string }[] = [
  { state: 'engaged', label: 'Foot off', cue: CLUTCH_CUES.engaged },
  { state: 'slipping', label: 'Slipping', cue: CLUTCH_CUES.slip },
  { state: 'biting', label: 'Bite point', cue: CLUTCH_CUES.bite },
  { state: 'disengaged', label: 'Pedal down', cue: CLUTCH_CUES.down },
]

const cuePedal = (cueId: string): number => {
  const v = TRANSMISSION_CUES.find((c) => c.id === cueId)?.params?.[PARAM.clutch]
  return typeof v === 'number' ? v : 0
}

/**
 * Cue-synchronised explanation for the gearbox lab: the selected gear (text
 * from the manual-gearbox lesson steps) or, while the pedal is down, the
 * clutch state (text from the clutch lesson), the live power path, the tooth
 * arithmetic, pedal shortcuts, a live numbers table and deeper lessons.
 */
export function TransmissionExplanation() {
  const cue = useLab((s) => s.cue)
  const level = usePreferences((p) => p.level)
  const p = useTransmissionParams()
  const d = useDriveState()
  const titleId = useId()

  const clutchCue = cue !== null && CLUTCH_CUE_IDS.includes(cue)
  const topic = getTopic(clutchCue ? CLUTCH_TOPIC_ID : GEARBOX_TOPIC_ID)
  const step = topic?.steps.find((st) => st.cue === cue)
  const state = clutchState(p.clutch)
  const title = step?.title ?? (clutchCue ? CLUTCH_STATE_LABEL[state] : GEAR_NAME[p.gear])
  const text = step ? (level === 'technical' ? step.technical : step.beginner) : clutchCue ? CLUTCH_SUMMARY[state] : GEAR_SUMMARY[p.gear]
  const eyebrow = clutchCue
    ? `Clutch · ${formatPercent(d.torqueFraction)} of engine torque passed on`
    : p.gear === 'N'
      ? 'Neutral · no drive'
      : `${GEAR_NAME[p.gear]} · ${formatRatio(d.ratio)}`

  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby={titleId} data-testid="transmission-cue-card">
        <p className="eyebrow">{eyebrow}</p>
        <h3 id={titleId} className="mt-1 text-xl font-semibold text-paper" aria-live="polite">
          {title}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-steel-300">{text}</p>
        {clutchCue && (
          <p className="mt-2 text-xs leading-relaxed text-steel-400">
            Selected gear: <span className="text-paper">{GEAR_NAME[p.gear]}</span>. {GEAR_SUMMARY[p.gear]}
          </p>
        )}
      </section>

      <PowerPath />
      <ToothArithmetic />
      <PedalShortcuts current={state} />
      <LiveNumbers />
      <DeeperTopics />
    </div>
  )
}

function PowerPath() {
  const store = useLabStoreApi()
  const selectedId = useLab((s) => s.selectedId)
  const p = useTransmissionParams()
  const d = useDriveState()
  const parts = powerPathParts(p.gear)
  // With the clutch released nothing carries torque (as in the 3D glow and the schematic), so every step is greyed.
  const released = d.torqueFraction <= 0

  return (
    <section aria-label="Power path" data-testid="transmission-power-path">
      <p className="eyebrow mb-1.5 flex items-center gap-1.5">
        <span className="inline-block h-2 w-3 rounded-sm bg-amber" aria-hidden />
        Power path
      </p>
      {parts.length === 0 ? (
        <p className="text-sm text-steel-400">No power path: every synchro collar is centred, so no gear is locked to the mainshaft and the output is free.</p>
      ) : (
        <>
          <ol className="flex flex-wrap items-center gap-1">
            {parts.map((id, i) => (
              <li key={id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => store.getState().select(selectedId === id ? null : id)}
                  aria-pressed={selectedId === id}
                  className={cn(
                    'min-h-9 rounded-md border px-2 text-xs transition-colors',
                    !released ? 'border-amber/40 bg-amber/[0.08] text-paper hover:border-amber' : 'border-white/[0.08] text-steel-500 hover:text-steel-300',
                    selectedId === id && 'border-cyan text-cyan',
                  )}
                >
                  {getComponent(id)?.name ?? id}
                </button>
                {i < parts.length - 1 && <ChevronRight className="size-3.5 text-steel-500" aria-hidden />}
              </li>
            ))}
          </ol>
          {released && (
            <p className="mt-1.5 text-xs text-steel-400">
              The clutch is released: the flywheel and pressure plate still spin with the engine, but no torque reaches the disc, so nothing on this path is loaded.
            </p>
          )}
        </>
      )}
    </section>
  )
}

function ToothArithmetic() {
  const p = useTransmissionParams()
  const d = useDriveState()
  const kind = gearKind(p.gear)
  return (
    <section aria-label="Ratio arithmetic" className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
      <p className="eyebrow">Ratio from tooth counts</p>
      <p className="mt-1 font-mono text-sm tabular-nums text-paper" data-testid="transmission-ratio-expression">
        {d.ratio === null ? 'Neutral — no ratio' : `${trainExpression(p.gear)} = ${formatRatio(d.ratio)}`}
      </p>
      {d.overallRatio !== null && (
        <p className="mt-1 font-mono text-xs tabular-nums text-steel-400">
          × final drive {FINAL_DRIVE_RATIO.toFixed(2)} = {formatRatio(d.overallRatio)} overall
        </p>
      )}
      <p className="mt-2 text-xs leading-relaxed text-steel-400">
        {kind === 'indirect' && 'Each pair: driven teeth ÷ driver teeth. Two pairs in a row multiply.'}
        {kind === 'direct' && 'No teeth carry the load: the collar locks the input pinion straight to the mainshaft.'}
        {kind === 'reverse' && 'The idler adds a third mesh, which flips the direction. Its own teeth cancel out of the ratio.'}
        {kind === 'neutral' && 'Select a gear to see how its tooth counts set the ratio.'}
      </p>
    </section>
  )
}

function PedalShortcuts({ current }: { current: ClutchState }) {
  const store = useLabStoreApi()
  return (
    <div role="group" aria-label="Clutch pedal positions" className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-2">
      {PEDAL_SHORTCUTS.map((s) => (
        <button
          key={s.cue}
          type="button"
          aria-pressed={current === s.state}
          onClick={() => store.getState().setParam(PARAM.clutch, cuePedal(s.cue))}
          className={cn(
            'min-h-10 rounded-lg border px-2.5 text-left text-sm transition-colors',
            current === s.state ? 'border-amber/60 bg-amber/10 text-paper' : 'border-white/[0.08] text-steel-300 hover:border-cyan/40 hover:text-paper',
          )}
        >
          {s.label}
          <span className="block font-mono text-[10px] text-steel-400">{CLUTCH_STATE_LABEL[s.state]}</span>
        </button>
      ))}
    </div>
  )
}

function LiveNumbers() {
  const d = useDriveState()
  return (
    <table className="w-full text-sm" data-testid="transmission-live-state">
      <caption className="eyebrow mb-1.5 text-left">Live numbers · illustrative</caption>
      <tbody className="divide-y divide-white/[0.05]">
        <Row label="Engine speed">{formatRpm(d.engineRpm)}</Row>
        <Row label="Gearbox input" hint="after the clutch">
          {formatRpm(d.inputRpm)}
        </Row>
        <Row label="Output shaft">{formatRpm(d.outputRpm)}</Row>
        <Row label="Torque in → out">
          {formatTorque(d.inputTorqueNm)} → {formatTorque(d.outputTorqueNm)}
        </Row>
        <Row label="Torque multiplication">{formatMultiplication(d.torqueMultiplication)}</Row>
        <Row label="Power in → out" hint={d.efficiency > 0 ? `${formatPercent(d.efficiency)} efficient` : undefined}>
          {formatKw(d.inputPowerKw)} → {formatKw(d.outputPowerKw)}
        </Row>
        <Row label="Clutch heat" hint="slip losses">
          {formatKw(d.clutchHeatKw)}
        </Row>
        <Row label="Road speed" hint={`final drive ${FINAL_DRIVE_RATIO}, 0.31 m tyre`}>
          {formatRoadSpeed(d.roadSpeedKmh)}
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
      <td className="py-1.5 text-right align-top font-mono tabular-nums text-paper">{children}</td>
    </tr>
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
