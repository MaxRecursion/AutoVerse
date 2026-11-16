import { useEffect, useRef } from 'react'
import { crossedEvents, ease, mod, visualStep, type FrameBus } from './animation'
import type { FiringEvent } from './firing'
import type { EngineTelemetry } from './synth'

export interface FrameInputs {
  running: boolean
  reduced: boolean
  events: FiringEvent[]
  /** Bank angle the diagrams should settle on. */
  bank: number
  telemetry: () => EngineTelemetry | null
}

/** Smoothing for the drawn engine speed: quick while running, a gentle spin-down after Stop. */
const RPM_TAU_RUNNING = 0.05
const RPM_TAU_STOPPING = 0.35
const BANK_TAU = 0.09

/**
 * The one animation loop behind the ring, the cylinder sections, the scope
 * and the rev counter. It reads the synthesiser's own engine speed, turns a
 * slowed visual crank at that speed, notes the firings it passes and eases the
 * drawn bank angle, then publishes a frame. Subscribers write to the DOM
 * through refs, so React does not re-render for every frame. The loop sleeps
 * whenever nothing is running or settling, and reduced motion keeps the crank
 * still and makes every change immediate.
 */
export function useEngineFrames(bus: FrameBus, inputs: FrameInputs) {
  const latest = useRef(inputs)
  const wake = useRef<() => void>(() => {})

  // Every render: hand the loop the newest inputs and make sure it is awake.
  useEffect(() => {
    latest.current = inputs
    wake.current()
  })

  useEffect(() => {
    if (typeof requestAnimationFrame !== 'function') return
    let frame = 0
    const state = { playhead: 0, rpm: latest.current.telemetry()?.rpm ?? 0, bank: latest.current.bank, last: 0 }

    const tick = (now: number) => {
      frame = 0
      const { running, reduced, events, bank, telemetry } = latest.current
      const dt = state.last ? Math.min(0.1, (now - state.last) / 1000) : 1 / 60
      state.last = now

      const report = running ? telemetry() : null
      const rpmTarget = running ? (report?.rpm ?? state.rpm) : 0
      state.rpm = reduced ? rpmTarget : ease(state.rpm, rpmTarget, dt, running ? RPM_TAU_RUNNING : RPM_TAU_STOPPING)
      if (Math.abs(state.rpm - rpmTarget) < 1) state.rpm = rpmTarget

      const animate = running && !reduced
      const step = animate ? visualStep(state.rpm, dt) : 0
      const fired = crossedEvents(events, state.playhead, step)
      state.playhead = mod(state.playhead + step, 720)

      state.bank = reduced ? bank : ease(state.bank, bank, dt, BANK_TAU)
      if (Math.abs(state.bank - bank) < 0.05) state.bank = bank

      bus.publish({
        playhead: state.playhead,
        running,
        animate,
        rpm: state.rpm,
        throttle: running ? (report?.throttle ?? 0) : 0,
        limiting: report?.limiting ?? false,
        bank: state.bank,
        fired,
        cycle: report?.cycle ?? null,
        dt,
        now,
      })

      if (running || state.bank !== bank || state.rpm !== rpmTarget) frame = requestAnimationFrame(tick)
      else state.last = 0
    }

    wake.current = () => {
      if (!frame) frame = requestAnimationFrame(tick)
    }
    wake.current()
    return () => {
      cancelAnimationFrame(frame)
      frame = 0
      wake.current = () => {}
    }
  }, [bus])
}
