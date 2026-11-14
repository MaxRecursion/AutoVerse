import { useEffect, useMemo, useRef } from 'react'
import { ease, type EngineFrame, type FrameBus } from './animation'
import type { FiringEvent } from './firing'
import { CYCLE_BINS, idealTrace, type SynthConfig } from './synth'

interface OscilloscopeProps {
  bus: FrameBus
  events: FiringEvent[]
  config: SynthConfig
  reduced: boolean
}

const FALLBACK = { cyan: '#38d7f2', amber: '#f6a63a', paper: '#f3efe6', steel: '#8a93a0' }
/** How quickly the drawn trace follows a new snapshot (seconds). */
const TRACE_TAU = 0.07
/** With reduced motion, the live trace refreshes at most this often (ms). */
const REDUCED_REFRESH_MS = 1000

function readColors() {
  const css = typeof document !== 'undefined' ? getComputedStyle(document.documentElement) : null
  const pick = (name: string, fallback: string) => css?.getPropertyValue(name).trim() || fallback
  return { cyan: pick('--cyan', FALLBACK.cyan), amber: pick('--amber', FALLBACK.amber), paper: pick('--paper', FALLBACK.paper), steel: pick('--steel-400', FALLBACK.steel) }
}

const peakOf = (...lanes: Float32Array[]) => lanes.reduce((m, lane) => lane.reduce((n, v) => Math.max(n, Math.abs(v)), m), 0)

/**
 * Exhaust pressure over one whole 720° cycle, one lane per exhaust. Before the
 * engine starts it shows idealised pulses at each firing; while it runs it
 * shows the synthesiser's own output, binned by crank angle in the worklet, so
 * the picture holds still on cylinder 1’s firing instead of scrolling. Faint
 * lines mark each firing; a cursor follows the slowed crank.
 */
export function Oscilloscope({ bus, events, config, reduced }: OscilloscopeProps) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const ideal = useMemo(() => idealTrace(config), [config])
  const lanes = config.separateBanks ? 2 : 1

  useEffect(() => {
    const el = canvas.current
    const g = el?.getContext('2d') ?? null
    if (!el || !g) return
    const colors = readColors()
    const shown = { a: Float32Array.from(ideal.a), b: Float32Array.from(ideal.b), peak: peakOf(ideal.a, ideal.b) || 1, live: false, seq: -1, lastDraw: -Infinity }
    let target: { a: Float32Array; b: Float32Array } | null = null
    let size = { w: 0, h: 0 }

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const w = el.clientWidth
      const h = el.clientHeight
      if (!w || !h) return
      el.width = Math.round(w * dpr)
      el.height = Math.round(h * dpr)
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      size = { w, h }
    }

    const draw = (frame: EngineFrame | null) => {
      const { w, h } = size
      if (!w) return
      g.clearRect(0, 0, w, h)
      const laneH = h / lanes
      g.lineWidth = 1
      g.setLineDash([])
      // Quarter-cycle grid.
      g.strokeStyle = 'rgba(255,255,255,0.05)'
      g.beginPath()
      for (let deg = 90; deg < 720; deg += 90) {
        const x = Math.round((deg / 720) * w) + 0.5
        g.moveTo(x, 0)
        g.lineTo(x, h)
      }
      g.stroke()
      g.font = '10px "JetBrains Mono Variable", ui-monospace, monospace'
      g.textBaseline = 'top'
      const spacing = w / Math.max(1, events.length)
      for (let lane = 0; lane < lanes; lane++) {
        const top = lane * laneH
        const base = top + laneH * 0.56
        const color = lane === 1 ? colors.amber : colors.cyan
        // Baseline.
        g.strokeStyle = 'rgba(255,255,255,0.08)'
        g.beginPath()
        g.moveTo(0, Math.round(base) + 0.5)
        g.lineTo(w, Math.round(base) + 0.5)
        g.stroke()
        // Firing marks for this lane.
        g.textAlign = 'center'
        for (const e of events) {
          const onLane = lanes === 1 || (lane === 1) === (e.bank === 'B')
          if (!onLane) continue
          const x = Math.round((e.angle / 720) * w) + 0.5
          g.strokeStyle = e.bank === 'B' ? colors.amber : colors.cyan
          g.globalAlpha = 0.28
          g.beginPath()
          g.moveTo(x, top + 4)
          g.lineTo(x, top + laneH - 3)
          g.stroke()
          g.globalAlpha = 1
          if (spacing >= 18 && e.cylinder !== null) {
            g.fillStyle = e.bank === 'B' ? colors.amber : colors.cyan
            g.fillText(String(e.cylinder), Math.min(w - 8, Math.max(8, x + 7)), top + 4)
          }
        }
        // The trace.
        const data = lane === 1 ? shown.b : shown.a
        const scale = (laneH * 0.4) / Math.max(1e-6, shown.peak)
        g.strokeStyle = color
        g.lineWidth = shown.live ? 1.75 : 1.5
        g.globalAlpha = shown.live ? 1 : 0.6
        g.shadowColor = color
        g.shadowBlur = shown.live && !reduced ? 6 : 0
        g.beginPath()
        for (let i = 0; i < CYCLE_BINS; i++) {
          const x = ((i + 0.5) / CYCLE_BINS) * w
          const y = Math.min(top + laneH - 2, Math.max(top + 2, base - data[i]! * scale))
          if (i === 0) g.moveTo(x, y)
          else g.lineTo(x, y)
        }
        g.stroke()
        g.shadowBlur = 0
        g.globalAlpha = 1
        // Lane label last, bottom right on a dark backing, clear of the cylinder numbers along the top.
        const laneLabel = lanes === 2 ? (lane === 0 ? 'LEFT · BANK A' : 'RIGHT · BANK B') : 'EXHAUST'
        const labelWidth = g.measureText(laneLabel).width
        g.fillStyle = 'rgba(11,12,15,0.85)'
        g.fillRect(w - labelWidth - 10, top + laneH - 16, labelWidth + 8, 14)
        g.fillStyle = colors.steel
        g.textAlign = 'right'
        g.textBaseline = 'bottom'
        g.fillText(laneLabel, w - 6, top + laneH - 3)
        g.textBaseline = 'top'
      }
      // Cursor at the slowed crank angle.
      if (frame?.animate) {
        const x = Math.round((frame.playhead / 720) * w) + 0.5
        g.strokeStyle = colors.paper
        g.globalAlpha = 0.55
        g.lineWidth = 1
        g.beginPath()
        g.moveTo(x, 0)
        g.lineTo(x, h)
        g.stroke()
        g.globalAlpha = 1
      }
      shown.lastDraw = frame?.now ?? 0
    }

    const onFrame = (frame: EngineFrame) => {
      if (frame.running && frame.cycle) {
        if (frame.cycle.seq !== shown.seq) {
          shown.seq = frame.cycle.seq
          target = frame.cycle
        }
        if (target) {
          if (!shown.live || reduced) {
            if (reduced && shown.live && frame.now - shown.lastDraw < REDUCED_REFRESH_MS) return
            shown.a.set(target.a)
            shown.b.set(target.b)
            shown.peak = peakOf(target.a, target.b) || 1
          } else {
            const k = 1 - Math.exp(-frame.dt / TRACE_TAU)
            for (let i = 0; i < CYCLE_BINS; i++) {
              shown.a[i]! += (target.a[i]! - shown.a[i]!) * k
              shown.b[i]! += (target.b[i]! - shown.b[i]!) * k
            }
            shown.peak = ease(shown.peak, peakOf(target.a, target.b) || shown.peak, frame.dt, 0.4)
          }
          shown.live = true
        }
      } else if (!frame.running && shown.live) {
        shown.a.set(ideal.a)
        shown.b.set(ideal.b)
        shown.peak = peakOf(ideal.a, ideal.b) || 1
        shown.live = false
        target = null
      } else if (!frame.animate && !shown.live && frame.now - shown.lastDraw < 250) {
        return
      }
      draw(frame)
    }

    resize()
    draw(bus.last)
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
      resize()
      draw(bus.last)
    }) : null
    observer?.observe(el)
    const unsubscribe = bus.subscribe(onFrame)
    return () => {
      unsubscribe()
      observer?.disconnect()
    }
  }, [bus, ideal, events, lanes, reduced])

  return <canvas ref={canvas} aria-hidden className={`${lanes === 2 ? 'h-[132px]' : 'h-[96px]'} w-full rounded-md border border-white/[0.06] bg-graphite-950/70`} />
}
