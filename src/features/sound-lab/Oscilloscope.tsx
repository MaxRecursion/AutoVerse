import { useEffect, useRef } from 'react'

/** A live trace of the synthesised exhaust pressure; draws a flat line when nothing is playing. */
export function Oscilloscope({ analyser, still }: { analyser: AnalyserNode | null; still: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const el = canvas.current
    const g = el?.getContext('2d')
    if (!el || !g) return
    const data = new Float32Array(analyser?.fftSize ?? 1024)
    let frame = 0
    const draw = () => {
      const { width, height } = el
      g.clearRect(0, 0, width, height)
      g.strokeStyle = 'rgb(255 255 255 / 0.07)'
      g.beginPath()
      g.moveTo(0, height / 2)
      g.lineTo(width, height / 2)
      g.stroke()
      if (analyser) analyser.getFloatTimeDomainData(data)
      else data.fill(0)
      g.strokeStyle = '#38d7f2'
      g.lineWidth = 2
      g.beginPath()
      for (let i = 0; i < data.length; i++) {
        const x = (i / (data.length - 1)) * width
        const y = height / 2 - Math.max(-1, Math.min(1, data[i]! * 1.6)) * (height / 2 - 4)
        if (i === 0) g.moveTo(x, y)
        else g.lineTo(x, y)
      }
      g.stroke()
      if (analyser && !still) frame = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(frame)
  }, [analyser, still])

  return <canvas ref={canvas} width={640} height={120} aria-hidden className="h-[90px] w-full rounded-md border border-white/[0.06] bg-graphite-950/70" />
}
