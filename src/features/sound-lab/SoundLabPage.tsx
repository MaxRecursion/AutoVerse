import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react'
import { ExternalLink, Gauge, Play, RotateCcw, Square, Volume2, Wand2 } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { Breadcrumbs } from '@/components/layout/Breadcrumbs'
import { useDocumentTitle } from '@/components/learning/useDocumentTitle'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery'
import { cn } from '@/lib/utils'
import { bankOf, cylinderGroups, DEFAULT_ENGINE_ID, engines, getEngine, soundLabReference, soundLabSources, type EngineSpec } from './engines'
import { createFrameBus, rotationSense, VISUAL_SLOWDOWN, type EngineFrame } from './animation'
import { bankGaps, describeIntervals, evenFiringSplit, firingEvents, firingFrequency, isEvenFiring, pairedVIntervals } from './firing'
import { FiringRing } from './FiringRing'
import { CylinderLayout } from './CylinderLayout'
import { LiveText } from './LiveText'
import { Oscilloscope } from './Oscilloscope'
import { audioSupported, buildSynthConfig, EngineSound } from './synth'
import { Tachometer } from './Tachometer'
import { useEngineFrames } from './useEngineFrames'

export const SOUND_LAB_TITLE = 'Engine Sound Lab: Inline-3 to V10 Simulator'

/** Range of the bank-angle experiment. */
const BANK_MIN = 45
const BANK_MAX = 120
const EngineCutaway = lazy(() => import('./EngineCutaway'))

const LAYOUT_LABEL = { inline: 'Inline', flat: 'Flat (boxer)', v: 'V' } as const

/**
 * /sound-lab — hear production engines from three to ten cylinders, built
 * from their real firing gaps, firing orders and bank layouts. Audio is
 * created only after the reader presses play.
 */
export default function SoundLabPage() {
  useDocumentTitle(SOUND_LAB_TITLE)
  const [params, setParams] = useSearchParams()
  const spec = getEngine(params.get('engine') ?? '') ?? getEngine(DEFAULT_ENGINE_ID)!
  // Owned here so switching engines keeps the audio running.
  const sound = useSoundEngine()

  return <SoundLab key={spec.id} spec={spec} sound={sound} onPick={(id) => setParams({ engine: id }, { replace: true, preventScrollReset: true })} />
}

type SoundEngineHandle = ReturnType<typeof useSoundEngine>

function SoundLab({ spec, sound, onPick }: { spec: EngineSpec; sound: SoundEngineHandle; onPick: (id: string) => void }) {
  const reduced = usePrefersReducedMotion()
  const [rpm, setRpm] = useState(Math.round(spec.idleRpm * 1.5))
  const [throttle, setThrottle] = useState(0.35)
  const [revving, setRevving] = useState(false)
  const [bankAngle, setBankAngle] = useState(spec.pairedV?.bankAngle ?? spec.bankAngle)
  const [split, setSplit] = useState(spec.pairedV?.split ?? 0)

  const modified = !!spec.pairedV && (bankAngle !== spec.pairedV.bankAngle || split !== spec.pairedV.split)
  const intervals = useMemo(
    () => (spec.pairedV ? pairedVIntervals(spec.cylinders, bankAngle, split, spec.pairedV.startWithPair) : spec.intervals),
    [spec, bankAngle, split],
  )
  const events = useMemo(() => firingEvents(intervals, spec.order, bankOf(spec)), [intervals, spec])
  const config = useMemo(() => buildSynthConfig(spec, intervals), [spec, intervals])
  // The crank turns the same way in every drawing of this engine, set by its production firing order.
  const sense = useMemo(() => rotationSense(spec, firingEvents(spec.intervals, spec.order, bankOf(spec))), [spec])
  const drawnBank = spec.layout === 'inline' ? 0 : spec.layout === 'flat' ? 180 : bankAngle
  // One frame loop moves every diagram, at the engine speed the synthesiser reports.
  const bus = useMemo(() => createFrameBus(), [])
  const animating = sound.running && !reduced
  useEngineFrames(bus, { running: sound.running, reduced, events, bank: drawnBank, telemetry: sound.telemetry })
  const pulsesText = useCallback((frame: EngineFrame) => `${Math.round(firingFrequency(spec.cylinders, frame.rpm))} per second`, [spec.cylinders])
  const targetRpm = revving ? Math.round(spec.redlineRpm * 1.03) : rpm
  const targetThrottle = revving ? 1 : throttle

  // Keep the running synth in step with the controls.
  useEffect(() => {
    sound.configure(config)
  }, [sound, config])
  useEffect(() => {
    sound.setRpm(targetRpm)
  }, [sound, targetRpm])
  useEffect(() => {
    sound.setThrottle(targetThrottle)
  }, [sound, targetThrottle])

  const toggle = () => (sound.running ? sound.stop() : sound.start(config, targetRpm, targetThrottle))
  const revKey = (down: boolean) => (e: KeyboardEvent) => {
    if (e.key !== ' ' && e.key !== 'Enter') return
    e.preventDefault()
    if (!e.repeat) setRevving(down)
  }

  const evenSplit = spec.pairedV ? evenFiringSplit(spec.cylinders, bankAngle) : 0
  // Wide enough that "Make it fire evenly" lands inside the slider at every bank angle it offers.
  const splitMin = Math.min(-45, evenFiringSplit(spec.cylinders, BANK_MAX))
  const splitMax = Math.max(45, evenFiringSplit(spec.cylinders, BANK_MIN))
  const pattern = describeIntervals(intervals)

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-20 pt-6 sm:px-6 lg:pt-10">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Engine Sound Lab' }]} />
      <header className="max-w-3xl">
        <p className="eyebrow flex items-center gap-2">
          <span aria-hidden className="h-px w-6 bg-amber" />
          Signature lab · Sound
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-paper sm:text-5xl">Engine Sound Lab</h1>
        <p className="mt-4 text-base leading-relaxed text-steel-300 sm:text-[17px]">
          Why does a V8 burble, a flat-plane V8 shriek, and a 90° V10 bark while a 72° V10 howls? It comes down to when each cylinder fires,
          and into which pipe. Pick one of {engines.length} engines from real production cars, from three cylinders to ten, and hear its
          firing rhythm, including all nine V10 families featured in the reference video. Then bend a V engine’s bank angle and crankpins and hear the rhythm change.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-steel-400">
          <strong className="text-steel-300">Synthesised, not recorded.</strong> The timing of every firing, the firing order and which bank’s
          exhaust each pulse goes to come from the real engines. The tone (exhaust length, brightness, rasp) is tuned by ear, so treat it as
          a faithful rhythm with an illustrative voice. RPM ranges are representative simulation settings. Headphones help: presets with separate bank exhausts play across the left and right channels.
        </p>
      </header>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
        <EnginePicker current={spec.id} onPick={onPick} />

        <section aria-labelledby="engine-heading" className="panel flex min-w-0 flex-col gap-6 p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="eyebrow">
                {spec.cylinders} cylinders · {LAYOUT_LABEL[spec.layout]}
                {spec.layout === 'v' ? ` · ${spec.bankAngle}°` : ''}
              </p>
              <h2 id="engine-heading" className="mt-1 text-2xl font-semibold text-paper sm:text-3xl">
                {spec.name}
              </h2>
              <p className="mt-1 text-steel-300">{spec.engine}</p>
              <p className="mt-1 text-sm text-steel-400">{spec.cars.join(' · ')}</p>
            </div>
            <div role="group" aria-label="Engine playback controls" className="grid w-full max-w-[320px] shrink-0 grid-cols-[minmax(0,96px)_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
              <Tachometer bus={bus} redlineRpm={spec.redlineRpm} reduced={reduced} />
              <div className="flex min-w-0 flex-col gap-2">
                <Button size="lg" className="h-11 w-full min-w-0 px-2 text-sm sm:h-12 sm:px-4 sm:text-[15px]" onClick={toggle} disabled={!sound.supported || sound.loading} data-testid="sound-lab-start" aria-pressed={sound.running}>
                  {sound.running ? <Square aria-hidden /> : <Play aria-hidden />}
                  {sound.loading ? 'Starting…' : sound.running ? 'Stop engine' : 'Start engine'}
                </Button>
                <Button
                  variant="outline"
                  className={cn('h-11 w-full min-w-0 select-none touch-none px-2 text-sm sm:px-4', revving && 'border-amber/60 text-amber')}
                  aria-pressed={revving}
                  onPointerDown={() => setRevving(true)}
                  onPointerUp={() => setRevving(false)}
                  onPointerLeave={() => setRevving(false)}
                  onPointerCancel={() => setRevving(false)}
                  onKeyDown={revKey(true)}
                  onKeyUp={revKey(false)}
                  onBlur={() => setRevving(false)}
                >
                  <Gauge aria-hidden /> Hold to rev
                </Button>
              </div>
            </div>
          </div>
          {!sound.supported && <p className="rounded-md border border-amber/30 bg-amber/[0.06] p-3 text-sm text-paper">This browser cannot run the audio synthesiser: it needs Web Audio worklets on a secure (https) page. The diagrams still work.</p>}
          {sound.error && <p className="rounded-md border border-amber/30 bg-amber/[0.06] p-3 text-sm text-paper" role="alert">{sound.error}</p>}

          <p className="leading-relaxed text-paper/90">{spec.character}</p>

          <Suspense fallback={<div className="grid min-h-[420px] place-items-center rounded-xl border border-cyan/20 bg-graphite-950/60 p-5 text-center text-steel-400" role="status">Preparing the 3D mechanical cutaway…</div>}>
            <EngineCutaway spec={spec} events={events} bankAngle={bankAngle} sense={sense} bus={bus} running={sound.running} reduced={reduced} />
          </Suspense>

          <details className="rounded-xl border border-line/[0.08] p-3">
            <summary className="relative hit-area min-h-9 cursor-pointer py-2 text-sm font-medium text-steel-300">Piston timing diagram</summary>
            <div className="mt-3"><CylinderLayout spec={spec} events={events} bankAngle={bankAngle} sense={sense} bus={bus} animating={animating} /></div>
          </details>

          <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-[300px_minmax(0,1fr)]">
            <div className="mx-auto w-full max-w-[300px]">
              <FiringRing events={events} bus={bus} reduced={reduced} />
              <p className="mt-1 text-center text-xs text-steel-500">
                {animating ? `Slowed ${VISUAL_SLOWDOWN}× so you can follow it` : sound.running ? 'Still view (reduced motion)' : 'Press Start to watch it turn'}
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <Fact label="Firing order" value={spec.order ? spec.order.join('-') : 'Not published here'} mono />
              <Fact label="Firing gaps" value={pattern} testId="sound-lab-intervals" />
              {spec.layout !== 'inline' && (
                <>
                  <Fact label={spec.separateBanks ? 'Left exhaust hears' : 'Bank A fires at gaps of'} value={`${bankGaps(events, 'A').join(', ')}°`} mono />
                  <Fact label={spec.separateBanks ? 'Right exhaust hears' : 'Bank B fires at gaps of'} value={`${bankGaps(events, 'B').join(', ')}°`} mono />
                </>
              )}
              <Fact label="Firing pulses" mono>
                <LiveText bus={bus} fallback={`${Math.round(firingFrequency(spec.cylinders, targetRpm))} per second`} format={pulsesText} />
              </Fact>
              <Fact label="Exhaust" value={spec.separateBanks ? 'One per bank (left / right)' : 'Shared'} />
              <Fact label="Simulation RPM range" value={`${spec.idleRpm.toLocaleString('en-GB')}–${spec.redlineRpm.toLocaleString('en-GB')} rpm`} mono />
            </dl>
          </div>

          <figure className="flex flex-col gap-2">
            <Oscilloscope bus={bus} events={events} config={config} reduced={reduced} />
            <figcaption className="text-xs leading-relaxed text-steel-500">
              {sound.running
                ? `Exhaust pressure over one 720° cycle, held still on the first firing${reduced ? ' and refreshed once a second' : ''}. Faint lines mark each firing.`
                : 'Idealised exhaust pulses over one 720° cycle, one per firing. Start the engine to see the synthesised pressure, pipe resonance included.'}
            </figcaption>
          </figure>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Control label="Engine speed" value={`${rpm.toLocaleString('en-GB')} rpm`}>
              <Slider value={[rpm]} min={spec.idleRpm} max={spec.redlineRpm} step={50} onValueChange={([v]) => setRpm(v!)} aria-label="Engine speed in rpm" data-testid="sound-lab-rpm" />
            </Control>
            <Control label="Throttle" value={`${Math.round(throttle * 100)}%`}>
              <Slider value={[throttle * 100]} min={0} max={100} step={1} onValueChange={([v]) => setThrottle(v! / 100)} aria-label="Throttle opening in percent" />
            </Control>
          </div>

          {spec.pairedV && (
            <section aria-labelledby="experiment-heading" className="rounded-lg border border-line/[0.08] bg-graphite-950/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 id="experiment-heading" className="flex items-center gap-2 font-semibold text-paper">
                  <Wand2 aria-hidden className="size-4 text-amber" /> Bend the V: bank angle and crankpins
                </h3>
                {modified && <span className="rounded-full border border-amber/40 px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider text-amber">Experiment · not production</span>}
              </div>
              <p className="mt-2 text-sm leading-relaxed text-steel-400">
                Opposite cylinders share a crankpin, so they fire the bank angle apart, then wait for the next pin. Even firing needs a{' '}
                {Math.round(720 / spec.cylinders)}° gap; with {bankAngle}° banks that takes a crankpin split of{' '}
                <span className="font-mono text-steel-300">{evenSplit > 0 ? '+' : ''}{evenSplit}°</span>.
              </p>
              <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2">
                <Control label="Bank angle" value={`${bankAngle}°`}>
                  <Slider value={[bankAngle]} min={BANK_MIN} max={BANK_MAX} step={1} onValueChange={([v]) => setBankAngle(v!)} aria-label="Bank angle in degrees" />
                </Control>
                <Control label="Crankpin split" value={`${split > 0 ? '+' : ''}${split}°`}>
                  <Slider value={[split]} min={splitMin} max={splitMax} step={1} onValueChange={([v]) => setSplit(v!)} aria-label="Crankpin split in degrees" />
                </Control>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="h-9" onClick={() => setSplit(evenSplit)} disabled={isEvenFiring(intervals)}>
                  Make it fire evenly
                </Button>
                <Button variant="ghost" size="sm" className="h-9" onClick={() => { setBankAngle(spec.pairedV!.bankAngle); setSplit(spec.pairedV!.split) }} disabled={!modified}>
                  <RotateCcw aria-hidden /> Back to production
                </Button>
              </div>
            </section>
          )}
          <p className="sr-only" role="status" aria-live="polite">
            {spec.name}: firing {pattern}.{modified ? ' Experimental settings.' : ''}
          </p>
        </section>
      </div>

      <section aria-labelledby="listen-heading" className="mt-12 max-w-3xl">
        <h2 id="listen-heading" className="text-2xl font-semibold text-paper">Three comparisons worth hearing</h2>
        <ul className="mt-4 flex flex-col gap-3 text-steel-300">
          <Compare a="v8-cross" b="v8-flat" onPick={onPick}>
            Same cylinders, same 90° banks, same even overall firing. Only the crank changes, and with it what each exhaust pipe hears.
          </Compare>
          <Compare a="v10-gallardo-even" b="v10-audi-52" onPick={onPick}>
            The Gallardo’s 5.0 split its crankpins to fire evenly; the 5.2 that replaced it went back to shared pins and 54°/90° gaps.
          </Compare>
          <Compare a="v10-lfa" b="v10-viper" onPick={onPick}>
            72° banks fire a V10 evenly with no tricks; 90° banks with shared pins cannot.
          </Compare>
        </ul>
      </section>

      <section aria-labelledby="sources-heading" className="mt-12 max-w-3xl">
        <h2 id="sources-heading" className="text-2xl font-semibold text-paper">Sources</h2>
        <p className="mt-2 text-sm text-steel-400">
          Firing orders use each maker’s own cylinder numbering. Where we could not confirm a firing order, the lab labels firings by bank
          rather than guessing. Inspired by{' '}
          <a href={soundLabReference.url} className="text-cyan underline-offset-4 hover:underline" target="_blank" rel="noreferrer">
            {soundLabReference.label}
          </a>
          ; no audio or footage from it is used.
        </p>
        <ul className="mt-3 flex flex-col gap-1.5 text-sm">
          {soundLabSources.map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-start gap-1.5 text-steel-300 hover:text-cyan">
                <ExternalLink aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="understand-heading" className="mt-12 max-w-3xl rounded-xl border border-cyan/20 bg-cyan/[0.03] p-5">
        <h2 id="understand-heading" className="text-xl font-semibold text-paper">Go inside the sound</h2>
        <p className="mt-2 leading-relaxed text-steel-300">Follow a piston through intake, compression, power and exhaust, then see how arranging more cylinders changes the engine.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild variant="outline" className="h-auto min-h-10 whitespace-normal text-left"><Link to="/labs/engine">Explore the four-stroke cutaway</Link></Button>
          <Button asChild variant="outline" className="h-auto min-h-10 whitespace-normal text-left"><Link to="/topics/engine-layouts">Read about engine layouts</Link></Button>
        </div>
      </section>
    </div>
  )
}

function EnginePicker({ current, onPick }: { current: string; onPick: (id: string) => void }) {
  const strip = useRef<HTMLDivElement>(null)
  // On the swipeable strip, bring the chosen engine into view (scrolls the strip only, never the page).
  useEffect(() => {
    const el = strip.current
    const chosen = el?.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (!el || !chosen || el.scrollWidth <= el.clientWidth) return
    const offset = chosen.getBoundingClientRect().left - el.getBoundingClientRect().left
    el.scrollLeft += offset - 8
  }, [current])
  return (
    <nav aria-label="Engines" className="panel h-fit min-w-0 p-3 sm:p-4">
      <p className="flex items-center gap-2 px-1 font-semibold text-paper">
        <Volume2 aria-hidden className="size-4 text-cyan" /> Pick an engine
      </p>
      <p className="mt-1 px-1 text-xs text-steel-500 lg:hidden">Swipe for more engines</p>
      {/* Phones and tablets: one swipeable strip, so the player stays near the top. Wide screens: a list. */}
      <div ref={strip} className="-mx-1 mt-3 flex snap-x gap-4 overflow-x-auto px-1 pb-2 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
        {cylinderGroups.map((n) => (
          <div key={n} className="shrink-0 snap-start">
            <p className="eyebrow px-1">{n} cyl</p>
            <ul className="mt-1.5 flex gap-1 lg:flex-col">
              {engines
                .filter((e) => e.cylinders === n)
                .map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => onPick(e.id)}
                      aria-pressed={e.id === current}
                      data-testid={`sound-lab-engine-${e.id}`}
                      className={cn(
                        'relative hit-area flex w-full flex-col items-start whitespace-nowrap rounded-md border px-3 py-2 text-left transition-colors lg:whitespace-normal',
                        e.id === current ? 'border-cyan/50 bg-cyan/[0.08]' : 'border-transparent hover:border-line/10 hover:bg-tint/[0.03]',
                      )}
                    >
                      <span className={cn('text-sm font-medium', e.id === current ? 'text-cyan' : 'text-paper')}>{e.name}</span>
                      <span className="hidden text-xs text-steel-400 lg:block">{e.cars[0]}</span>
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  )
}

function Compare({ a, b, onPick, children }: { a: string; b: string; onPick: (id: string) => void; children: React.ReactNode }) {
  const ea = getEngine(a)!
  const eb = getEngine(b)!
  return (
    <li className="rounded-lg border border-line/[0.06] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" className="h-auto min-h-9 max-w-full whitespace-normal py-1.5 text-left" onClick={() => onPick(a)}>
          {ea.name} · {ea.cars[0]}
        </Button>
        <span className="text-steel-500">vs</span>
        <Button variant="outline" size="sm" className="h-auto min-h-9 max-w-full whitespace-normal py-1.5 text-left" onClick={() => onPick(b)}>
          {eb.name} · {eb.cars[0]}
        </Button>
      </div>
      <p className="mt-2 text-sm leading-relaxed">{children}</p>
    </li>
  )
}

function Fact({ label, value, mono, testId, children }: { label: string; value?: string; mono?: boolean; testId?: string; children?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">{label}</dt>
      <dd className={cn('break-words text-paper', mono && 'font-mono text-[13px]')} data-testid={testId}>
        {children ?? value}
      </dd>
    </div>
  )
}

function Control({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-steel-300">{label}</span>
        <span className="font-mono text-paper">{value}</span>
      </div>
      {children}
    </div>
  )
}

const noSubscribe = () => () => {}

/** Owns one EngineSound for the page; stops it on unmount. */
function useSoundEngine() {
  const ref = useRef<EngineSound | null>(null)
  const [running, setRunning] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Assume support while prerendering; the browser answers on hydration.
  const supported = useSyncExternalStore(noSubscribe, audioSupported, () => true)

  useEffect(() => () => void ref.current?.stop(), [])

  const start = useCallback(async (config: Parameters<EngineSound['start']>[0], rpm: number, throttle: number) => {
    ref.current ??= new EngineSound()
    setLoading(true)
    setError(null)
    try {
      await ref.current.start(config, rpm, throttle)
      if (!ref.current.running) return // stopped while the worklet was loading
      setRunning(true)
    } catch {
      setRunning(false)
      setError('The audio could not start. Check that sound is allowed for this site and try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  const stop = useCallback(async () => {
    setRunning(false)
    await ref.current?.stop()
  }, [])

  // A backgrounded tab should not keep an engine running.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden' && ref.current?.running) void stop()
    }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [stop])

  const configure = useCallback((c: Parameters<EngineSound['configure']>[0]) => ref.current?.configure(c), [])
  const setRpm = useCallback((v: number) => ref.current?.setRpm(v), [])
  const setThrottle = useCallback((v: number) => ref.current?.setThrottle(v), [])
  /** What the worklet last reported (engine speed, limiter, one-cycle waveform), read by the frame loop. */
  const telemetry = useCallback(() => ref.current?.telemetry ?? null, [])

  return useMemo(
    () => ({ running, loading, error, supported, start, stop, configure, setRpm, setThrottle, telemetry }),
    [running, loading, error, supported, start, stop, configure, setRpm, setThrottle, telemetry],
  )
}
