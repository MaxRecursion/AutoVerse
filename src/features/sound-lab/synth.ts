/**
 * The Engine Sound Lab's synthesiser: Web Audio, built on demand (never during
 * render). An AudioWorklet turns the crank sample by sample and, each time it
 * passes a firing angle, launches an exhaust pulse into that bank's pipe. Each
 * pipe is a feedback delay (its resonant length), a body resonance, a low-pass
 * that opens with throttle and revs, and a little saturation for rasp.
 *
 * The rhythm is the engine's own (firing gaps, order, which bank, header
 * delays); the tone is tuned, not recorded.
 *
 * When the page asks (`{ type: 'telemetry', on: true }`), the worklet also
 * reports what it is actually doing, so the diagrams move with the sound: its
 * smoothed engine speed about 60 times a second, and the exhaust pressure of
 * each bank over one whole 720° cycle (binned, locked to the first firing)
 * up to 30 times a second. Without that message it posts nothing.
 */
import { bankOf, type EngineSpec, type EngineVoice } from './engines'
import { firingEvents } from './firing'

export interface SynthEvent {
  /** Crank angle in the 720° cycle. */
  angle: number
  /** 0 = bank A (or the single exhaust), 1 = bank B. */
  ch: 0 | 1
  /** Extra travel time before the pulse reaches the pipe (header length). */
  delayMs: number
  /** Relative pulse strength at the collector, 0–1. */
  gain: number
}

export interface SynthConfig {
  events: SynthEvent[]
  separateBanks: boolean
  voice: EngineVoice
  idleRpm: number
  redlineRpm: number
}

/** Pure: what the worklet needs to play this engine with these firing gaps. */
export function buildSynthConfig(spec: EngineSpec, intervals: number[] = spec.intervals): SynthConfig {
  const spread = spec.voice.runnerSpreadMs ?? DEFAULT_RUNNER_SPREAD_MS
  const events = firingEvents(intervals, spec.order, bankOf(spec)).map((e) => {
    const reach = runnerReach(spec, e.cylinder, e.index)
    const header = e.cylinder !== null ? spec.voice.headerDelayMs?.[e.cylinder] : undefined
    return {
      angle: e.angle,
      ch: (spec.separateBanks && e.bank === 'B' ? 1 : 0) as 0 | 1,
      delayMs: (header ?? 0) + spread * reach,
      gain: 1 - 0.18 * reach * Math.min(1, spread),
    }
  })
  return { events, separateBanks: spec.separateBanks, voice: spec.voice, idleRpm: spec.idleRpm, redlineRpm: spec.redlineRpm }
}

/** Bins per 720° cycle in the worklet's waveform snapshots (3° each). Must match the worklet source. */
export const CYCLE_BINS = 240

/** One cycle of exhaust pressure per bank, as averaged by the worklet. */
export interface CycleSnapshot {
  a: Float32Array
  b: Float32Array
  /** Increases with every snapshot received. */
  seq: number
}

/** What the running worklet last reported. */
export interface EngineTelemetry {
  rpm: number
  throttle: number
  /** At or over the redline, where the limiter cuts fuel. */
  limiting: boolean
  cycle: CycleSnapshot | null
}

/**
 * Idealised exhaust pulses over one 720° cycle, binned like the worklet's
 * snapshots: the same pulse shape at every firing angle, before any pipe
 * resonance. Shown before the engine starts.
 */
export function idealTrace(config: SynthConfig, bins = CYCLE_BINS): { a: Float32Array; b: Float32Array } {
  const a = new Float32Array(bins)
  const b = new Float32Array(bins)
  const width = Math.max(1, config.voice.pulseDeg)
  for (const e of config.events) {
    const lane = e.ch === 1 ? b : a
    for (let i = 0; i < bins; i++) {
      const u = ((((i + 0.5) * 720) / bins - e.angle + 720) % 720) / width
      if (u >= 1) continue
      const s = Math.sin(Math.PI * u)
      lane[i]! += e.gain * s * s * Math.exp(-2.5 * u)
    }
  }
  return { a, b }
}

/** Illustrative runner spread for engines without their own value. */
export const DEFAULT_RUNNER_SPREAD_MS = 0.5

/**
 * How far a cylinder sits from its bank's collector, 0 (nearest) to 1
 * (furthest), assuming the collector is at the middle of the bank. Engines
 * without a published order fall back to the firing position.
 */
export function runnerReach(spec: EngineSpec, cylinder: number | null, index: number): number {
  const bank = spec.layout === 'inline' ? Array.from({ length: spec.cylinders }, (_, i) => i + 1) : spec.bankA.includes(cylinder ?? -1) ? spec.bankA : spec.bankB
  const perBank = spec.layout === 'inline' ? spec.cylinders : spec.cylinders / 2
  const pos = cylinder !== null && bank.includes(cylinder) ? bank.indexOf(cylinder) : Math.floor(index / (spec.layout === 'inline' ? 1 : 2)) % perBank
  const centre = (perBank - 1) / 2
  return centre === 0 ? 0 : Math.abs(pos - centre) / centre
}

/* The worklet runs in its own global scope, so it is shipped as source text. */
const PROCESSOR = /* js */ `
const TAU = Math.PI * 2;
function biquad(type, f, q, gainDb, sr) {
  const w = TAU * Math.min(f, sr * 0.45) / sr, c = Math.cos(w), s = Math.sin(w), a = s / (2 * q);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a; }
  else if (type === 'bp') { b0 = a; b1 = 0; b2 = -a; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a; }
  else { const A = Math.pow(10, gainDb / 40); b0 = 1 + a * A; b1 = -2 * c; b2 = 1 - a * A; a0 = 1 + a / A; a1 = -2 * c; a2 = 1 - a / A; }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}
function run(k, st, x) {
  const y = k[0] * x + k[1] * st[0] + k[2] * st[1] - k[3] * st[2] - k[4] * st[3];
  st[1] = st[0]; st[0] = x; st[3] = st[2]; st[2] = y; return y;
}
class Pipe {
  constructor(sr) { this.buf = new Float32Array(Math.ceil(sr * 0.06)); this.i = 0; this.d = 100; this.damp = 0; this.lp = [0,0,0,0]; this.pk = [0,0,0,0]; this.hp = 0; this.hpx = 0; }
}
class EngineProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sr = sampleRate; this.theta = 0; this.rpm = 800; this.rpmTarget = 800; this.throttle = 0.15; this.throttleTarget = 0.15;
    this.cfg = null; this.pulses = []; this.pipes = [new Pipe(sampleRate), new Pipe(sampleRate)];
    this.intake = [0,0,0,0]; this.kIntake = biquad('bp', 1400, 1.2, 0, sampleRate); this.block = 0;
    // Telemetry for the page's diagrams: off until asked for.
    this.telemetry = false; this.sinceState = 0; this.sinceCycle = 0;
    this.snapA = new Float32Array(240); this.snapB = new Float32Array(240); this.snapN = new Uint32Array(240);
    this.port.onmessage = (e) => this.message(e.data);
  }
  message(m) {
    if (m.type === 'config') {
      this.cfg = m.config; const v = m.config.voice;
      this.pipes.forEach((p, n) => { p.d = Math.max(8, Math.min(p.buf.length - 2, Math.round(this.sr * 2 * v.pipeLength * (1 + n * 0.035) / 480))); });
      this.kPeak = biquad('peak', v.bodyHz, v.bodyQ, 9, this.sr);
      if (m.reset) { this.rpm = m.config.idleRpm; this.rpmTarget = m.config.idleRpm; }
    } else if (m.type === 'rpm') this.rpmTarget = m.value;
    else if (m.type === 'throttle') this.throttleTarget = m.value;
    else if (m.type === 'telemetry') this.telemetry = !!m.on;
  }
  process(_in, outputs) {
    const out = outputs[0], L = out[0], R = out[1] || out[0], cfg = this.cfg;
    if (!cfg) { L.fill(0); if (R !== L) R.fill(0); return true; }
    const v = cfg.voice, sr = this.sr, red = cfg.redlineRpm;
    // Coefficients once per block: brightness opens with throttle and revs.
    const open = (0.3 + 0.7 * this.throttle) * (0.55 + 0.45 * Math.min(1, this.rpm / red));
    const kLp = biquad('lp', 500 + (v.brightness - 500) * open, 0.8, 0, sr);
    const drive = 1 + v.grit * 5, norm = 1 / Math.tanh(drive);
    const events = cfg.events, n = events.length;
    for (let i = 0; i < L.length; i++) {
      // Revs rise faster under throttle than they fall when it is lifted.
      const up = this.rpmTarget > this.rpm;
      this.rpm += (this.rpmTarget - this.rpm) * (up ? 3.2 + 3 * this.throttle : 1.6) / sr;
      this.throttle += (this.throttleTarget - this.throttle) * 12 / sr;
      const prev = this.theta;
      this.theta += this.rpm * 6 / sr;
      const wrapped = this.theta >= 720;
      if (wrapped) this.theta -= 720;
      for (let k = 0; k < n; k++) {
        const a = events[k].angle;
        const crossed = wrapped ? (a > prev || a <= this.theta) : (a > prev && a <= this.theta);
        if (!crossed) continue;
        // Hard rev limiter: fuel cut at the redline.
        if (this.rpm >= red && Math.random() < 0.7) continue;
        const len = Math.max(sr * 0.0008, Math.min(sr * 0.03, v.pulseDeg / (this.rpm * 6) * sr));
        const amp = events[k].gain * (0.3 + 0.7 * this.throttle) * (0.92 + Math.random() * 0.16);
        if (this.pulses.length < 64) this.pulses.push({ ch: events[k].ch, t: -Math.round(events[k].delayMs * sr / 1000), len, amp });
      }
      let x0 = 0, x1 = 0;
      for (let p = this.pulses.length - 1; p >= 0; p--) {
        const q = this.pulses[p];
        q.t++;
        if (q.t < 0) continue;
        const u = q.t / q.len;
        if (u >= 1) { this.pulses.splice(p, 1); continue; }
        const s = Math.sin(Math.PI * u);
        const val = q.amp * s * s * Math.exp(-2.5 * u) * (0.8 + 0.4 * (Math.random() - 0.5));
        if (q.ch === 0) x0 += val; else x1 += val;
      }
      const noise = (Math.random() * 2 - 1) * this.throttle * 0.05;
      const intake = run(this.kIntake, this.intake, noise);
      const y0 = this.pipe(this.pipes[0], x0, v, kLp, drive, norm);
      const y1 = this.pipe(this.pipes[1], x1, v, kLp, drive, norm);
      if (this.telemetry) {
        // Bin each bank's pressure by crank angle (3° bins), one 720° cycle at a time.
        if (wrapped) this.flushCycle();
        const bin = Math.min(239, Math.floor(this.theta / 3));
        this.snapA[bin] += y0; this.snapB[bin] += y1; this.snapN[bin]++;
      }
      if (cfg.separateBanks) { L[i] = (y0 * 0.85 + y1 * 0.35 + intake) * 0.5; R[i] = (y1 * 0.85 + y0 * 0.35 + intake) * 0.5; }
      else { const m = (y0 + y1) * 0.6 + intake; L[i] = m * 0.5; R[i] = m * 0.5; }
    }
    if (this.telemetry) {
      this.sinceState += L.length; this.sinceCycle += L.length;
      if (this.sinceState >= sr / 60) {
        this.sinceState -= sr / 60;
        this.port.postMessage({ type: 'state', rpm: this.rpm, throttle: this.throttle, limiting: this.rpm >= red });
      }
    }
    return true;
  }
  flushCycle() {
    if (this.sinceCycle >= this.sr / 30) {
      this.sinceCycle = 0;
      const a = new Float32Array(240), b = new Float32Array(240);
      let la = 0, lb = 0;
      for (let i = 0; i < 240; i++) {
        const n = this.snapN[i];
        if (n) { la = this.snapA[i] / n; lb = this.snapB[i] / n; }
        a[i] = la; b[i] = lb;
      }
      this.port.postMessage({ type: 'cycle', a, b }, [a.buffer, b.buffer]);
    }
    this.snapA.fill(0); this.snapB.fill(0); this.snapN.fill(0);
  }
  pipe(p, x, v, kLp, drive, norm) {
    const j = (p.i - p.d + p.buf.length) % p.buf.length;
    const back = p.buf[j];
    p.damp += (back - p.damp) * 0.45;
    const y = x + v.reflection * p.damp;
    p.buf[p.i] = y; p.i = (p.i + 1) % p.buf.length;
    let z = run(this.kPeak, p.pk, y);
    z = run(kLp, p.lp, z);
    z = Math.tanh(z * drive) * norm;
    // DC blocker: the pulses are one-sided pressure.
    const hp = z - p.hpx + 0.995 * p.hp; p.hpx = z; p.hp = hp;
    return hp;
  }
}
registerProcessor('autoverse-engine', EngineProcessor);
`

/** True where the browser can run the synthesiser. Call only from effects, handlers or client snapshots. */
export function audioSupported(): boolean {
  if (typeof window === 'undefined') return false
  if (window.isSecureContext === false) return false
  const Ctx = window.AudioContext
  return typeof Ctx === 'function' && typeof window.AudioWorkletNode === 'function' && 'audioWorklet' in Ctx.prototype
}

/** How long the fade-out lasts before the old audio graph is torn down. */
export const FADE_OUT_MS = 200

interface Graph {
  ctx: AudioContext
  url: string
  node: AudioWorkletNode | null
  gain: GainNode | null
  analyser: AnalyserNode | null
  telemetry: EngineTelemetry | null
  cycleSeq: number
}

/**
 * One playing engine. Create it inside a click handler (browsers only start
 * audio after a gesture). Each start builds a fresh graph; stop detaches it at
 * once and tears down only that graph after the fade, so a quick restart is
 * never disturbed by the previous stop.
 */
export class EngineSound {
  private graph: Graph | null = null

  get running() {
    return this.graph !== null
  }

  /** Live signal for an oscilloscope, while running. */
  get analyser() {
    return this.graph?.analyser ?? null
  }

  /** What the worklet last reported, while running (null before its first report). */
  get telemetry(): EngineTelemetry | null {
    return this.graph?.telemetry ?? null
  }

  async start(config: SynthConfig, rpm: number, throttle: number): Promise<void> {
    if (this.graph) return
    const ctx = new AudioContext({ latencyHint: 'interactive' })
    const url = URL.createObjectURL(new Blob([PROCESSOR], { type: 'text/javascript' }))
    const graph: Graph = { ctx, url, node: null, gain: null, analyser: null, telemetry: null, cycleSeq: 0 }
    this.graph = graph
    try {
      await ctx.audioWorklet.addModule(url)
      if (this.graph !== graph) return // stopped while loading; that stop cleans up
      const node = new AudioWorkletNode(ctx, 'autoverse-engine', { numberOfInputs: 0, outputChannelCount: [2] })
      const gain = ctx.createGain()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 2048
      gain.gain.value = 0
      node.connect(gain).connect(analyser).connect(ctx.destination)
      gain.gain.setTargetAtTime(0.9, ctx.currentTime, 0.08)
      Object.assign(graph, { node, gain, analyser })
      // Reports land on this graph only, so a stopped engine's late messages can never reach its replacement.
      node.port.onmessage = (event: MessageEvent) => receive(graph, event.data)
      this.configure(config, true)
      this.setRpm(rpm)
      this.setThrottle(throttle)
      node.port.postMessage({ type: 'telemetry', on: true })
      if (ctx.state === 'suspended') await ctx.resume()
    } catch (error) {
      if (this.graph === graph) this.graph = null
      teardown(graph)
      throw error
    }
  }

  configure(config: SynthConfig, reset = false) {
    this.graph?.node?.port.postMessage({ type: 'config', config, reset })
  }

  setRpm(value: number) {
    this.graph?.node?.port.postMessage({ type: 'rpm', value })
  }

  setThrottle(value: number) {
    this.graph?.node?.port.postMessage({ type: 'throttle', value })
  }

  async stop(): Promise<void> {
    const graph = this.graph
    if (!graph) return
    this.graph = null
    graph.gain?.gain.setTargetAtTime(0, graph.ctx.currentTime, 0.05)
    await new Promise((r) => setTimeout(r, FADE_OUT_MS))
    teardown(graph)
  }
}

function receive(graph: Graph, data: unknown) {
  if (!data || typeof data !== 'object') return
  const m = data as { type?: unknown; rpm?: unknown; throttle?: unknown; limiting?: unknown; a?: unknown; b?: unknown }
  if (m.type === 'state' && typeof m.rpm === 'number' && Number.isFinite(m.rpm)) {
    const throttle = typeof m.throttle === 'number' && Number.isFinite(m.throttle) ? m.throttle : 0
    graph.telemetry = { rpm: m.rpm, throttle, limiting: m.limiting === true, cycle: graph.telemetry?.cycle ?? null }
  } else if (m.type === 'cycle' && m.a instanceof Float32Array && m.b instanceof Float32Array && m.a.length === CYCLE_BINS && m.b.length === CYCLE_BINS) {
    const cycle = { a: m.a, b: m.b, seq: ++graph.cycleSeq }
    graph.telemetry = { ...(graph.telemetry ?? { rpm: 0, throttle: 0, limiting: false }), cycle }
  }
}

function teardown(graph: Graph) {
  if (graph.node) graph.node.port.onmessage = null
  graph.node?.disconnect()
  graph.gain?.disconnect()
  graph.analyser?.disconnect()
  void graph.ctx.close().catch(() => undefined)
  URL.revokeObjectURL(graph.url)
}
