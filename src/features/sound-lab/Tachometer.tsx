import { useEffect, useRef } from 'react'
import { dialAngle, DIAL_SWEEP as SWEEP, type FrameBus } from './animation'

const CX = 60
const CY = 58
const R = 46

const point = (deg: number, r: number) => ({ x: CX + r * Math.sin(deg * (Math.PI / 180)), y: CY - r * Math.cos(deg * (Math.PI / 180)) })
function arc(from: number, to: number, r: number) {
  const a = point(from, r)
  const b = point(to, r)
  return `M${a.x.toFixed(2)} ${a.y.toFixed(2)}A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`
}

interface TachometerProps {
  bus: FrameBus
  redlineRpm: number
  reduced: boolean
}

/**
 * Rev counter for the speed the synthesiser is actually turning: it lags the
 * slider as the revs build, drops away after Stop and shivers on the limiter.
 * The drawing is decorative; the quiet numeric output exposes actual engine
 * speed, and limiter entry/exit is announced once when its state changes.
 */
export function Tachometer({ bus, redlineRpm, reduced }: TachometerProps) {
  const max = Math.ceil((redlineRpm * 1.12) / 1000) * 1000
  const needle = useRef<SVGGElement>(null)
  const readout = useRef<HTMLSpanElement>(null)
  const limiter = useRef<HTMLSpanElement>(null)
  const limiterStatus = useRef<HTMLSpanElement>(null)
  const wasLimiting = useRef(false)
  const majors = Array.from({ length: max / 1000 + 1 }, (_, i) => i * 1000)
  const labelEvery = max > 10000 ? 2000 : 1000

  useEffect(() => {
    let lastText = -Infinity
    return bus.subscribe((frame) => {
      const refresh = frame.now - lastText >= (reduced ? 250 : 80) || frame.rpm === 0
      const shiver = !reduced && frame.limiting && frame.animate ? Math.sin(frame.now / 38) * redlineRpm * 0.012 : 0
      // Reduced motion uses discrete needle updates at the numeric cadence.
      if (needle.current && (!reduced || refresh)) needle.current.style.transform = `rotate(${dialAngle(frame.rpm + shiver, max)}deg)`
      const text = readout.current?.firstChild
      if (text && refresh) {
        lastText = frame.now
        text.nodeValue = (Math.round(frame.rpm / 10) * 10).toLocaleString('en-GB')
      }
      if (limiter.current) limiter.current.dataset.on = String(frame.limiting)
      if (frame.limiting !== wasLimiting.current) {
        wasLimiting.current = frame.limiting
        if (limiterStatus.current) limiterStatus.current.textContent = frame.limiting ? 'Rev limiter active.' : 'Rev limiter released.'
      }
    })
  }, [bus, max, redlineRpm, reduced])

  return (
    <div className="relative w-full max-w-[120px] min-w-0 select-none">
      <svg aria-hidden viewBox="0 0 120 92" className="h-auto w-full">
        <path d={arc(-SWEEP / 2, SWEEP / 2, R)} fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth={6} strokeLinecap="round" />
        <path d={arc(dialAngle(redlineRpm, max), SWEEP / 2, R)} fill="none" stroke="var(--color-danger)" strokeOpacity={0.85} strokeWidth={6} />
        {majors.map((rpm) => {
          const deg = dialAngle(rpm, max)
          const a = point(deg, R - 6)
          const b = point(deg, R - 11)
          const t = point(deg, R - 19)
          return (
            <g key={rpm}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={rpm >= redlineRpm ? 'var(--color-danger)' : 'var(--color-steel-400)'} strokeWidth={1.25} />
              {rpm % labelEvery === 0 && (
                <text x={t.x} y={t.y} textAnchor="middle" dominantBaseline="central" className="fill-steel-300 font-mono text-[8px]">
                  {rpm / 1000}
                </text>
              )}
            </g>
          )
        })}
        <g ref={needle} style={{ transform: `rotate(${dialAngle(0, max)}deg)`, transformOrigin: `${CX}px ${CY}px` }}>
          <line x1={CX} y1={CY + 6} x2={CX} y2={CY - R + 7} stroke="var(--color-amber)" strokeWidth={2} strokeLinecap="round" />
        </g>
        <circle cx={CX} cy={CY} r={4} fill="var(--color-graphite-850)" stroke="var(--color-amber)" strokeWidth={1.5} />
        <text x={CX} y={CY + 22} textAnchor="middle" className="fill-steel-500 font-mono text-[6px] uppercase tracking-[0.2em]">
          ×1000 rpm
        </text>
      </svg>
      <output aria-label="Actual engine speed" aria-live="off" className="-mt-1 flex items-baseline justify-center gap-1 font-mono">
        <span ref={readout} data-testid="sound-lab-tach" className="text-base tabular-nums text-paper">
          0
        </span>
        <span className="text-[10px] text-steel-400">rpm</span>
      </output>
      <span
        aria-hidden
        ref={limiter}
        data-testid="sound-lab-limiter"
        data-on="false"
        className="absolute left-1/2 top-[38%] -translate-x-1/2 rounded-sm border border-danger/50 bg-danger/15 px-1 font-mono text-[8px] uppercase tracking-wider text-danger opacity-0 transition-opacity duration-150 data-[on=true]:opacity-100"
      >
        Limiter
      </span>
      <span ref={limiterStatus} role="status" aria-live="polite" aria-atomic="true" className="sr-only" />
    </div>
  )
}
