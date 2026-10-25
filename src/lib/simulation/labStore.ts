import { createStore, type StoreApi } from 'zustand/vanilla'
import { clamp, wrap01 } from '@/lib/utils'

/**
 * One store per mounted lab. It owns the single simulation time parameter
 * (`progress`, a normalised position within one cycle) plus all scene UI
 * state. Every animated part derives its transform from `progress` (and lab
 * params) — never from accumulated per-frame deltas — so play, pause, scrub
 * and step always yield the same synchronised pose.
 */

export interface LabCue {
  id: string
  label: string
  /** Normalised cycle position this cue seeks to (timeline labs). */
  progress?: number
  /** Parameter changes applied when the cue is activated (param-driven labs). */
  params?: Record<string, LabParamValue>
}

export type LabParamValue = number | string | boolean

export interface LabConfig {
  id: string
  /** Seconds per full cycle at 1x speed. */
  cycleDuration: number
  /** Step size for manual step forward/back, in normalised cycle units. */
  stepSize: number
  speeds: number[]
  /** false = one-shot timeline that stops at the end. */
  loop: boolean
  /** Whether this lab has a scrubbable timeline (vs. pure parameter controls). */
  timeline: boolean
  cues: LabCue[]
  initialParams: Record<string, LabParamValue>
  /** Derive the active cue id from state (e.g. which stroke the engine is in). */
  deriveCue?: (progress: number, params: Record<string, LabParamValue>) => string | null
  /** Human readout for the timeline, e.g. "127° crank". */
  formatProgress?: (progress: number) => string
}

export interface CameraApi {
  reset: () => void
  lookAt?: (position: [number, number, number], target: [number, number, number]) => void
  /**
   * Move the view "Reset camera" returns to (it starts as the initial view).
   * For labs that refit their framing after a resize or a mode change.
   */
  setHome?: (position: [number, number, number], target: [number, number, number]) => void
}

export interface LabState {
  config: LabConfig
  progress: number
  playing: boolean
  speed: number
  cue: string | null
  params: Record<string, LabParamValue>
  selectedId: string | null
  hoveredId: string | null
  hidden: Record<string, boolean>
  isolatedId: string | null
  exploded: boolean
  showLabels: boolean
  camera: CameraApi | null

  advance: (dt: number) => void
  play: () => void
  pause: () => void
  toggle: () => void
  restart: () => void
  seek: (progress: number) => void
  stepBy: (steps: number) => void
  setSpeed: (speed: number) => void
  seekCue: (cueId: string) => void
  setParam: (key: string, value: LabParamValue) => void
  select: (id: string | null) => void
  hover: (id: string | null) => void
  toggleHidden: (id: string) => void
  showAll: () => void
  isolate: (id: string | null) => void
  setExploded: (v: boolean) => void
  toggleLabels: () => void
  registerCamera: (api: CameraApi | null) => void
  resetCamera: () => void
}

export type LabStore = StoreApi<LabState>

export function defineLabConfig(c: Partial<LabConfig> & Pick<LabConfig, 'id'>): LabConfig {
  return {
    cycleDuration: 4,
    stepSize: 1 / 72,
    speeds: [0.1, 0.25, 0.5, 1, 2],
    loop: true,
    timeline: true,
    cues: [],
    initialParams: {},
    ...c,
  }
}

export function createLabStore(config: LabConfig, opts: { autoplay?: boolean } = {}): LabStore {
  const derive = (progress: number, params: Record<string, LabParamValue>) =>
    config.deriveCue ? config.deriveCue(progress, params) : null

  // Only write `cue` when it actually changes so subscribers re-render on cue boundaries, not every frame.
  const withCue = (s: LabState, progress: number, params = s.params) => {
    const cue = derive(progress, params)
    return cue === s.cue ? { progress, params } : { progress, params, cue }
  }

  return createStore<LabState>()((set, get) => ({
    config,
    progress: 0,
    playing: opts.autoplay ?? false,
    speed: 1,
    cue: derive(0, config.initialParams),
    params: { ...config.initialParams },
    selectedId: null,
    hoveredId: null,
    hidden: {},
    isolatedId: null,
    exploded: false,
    showLabels: false,
    camera: null,

    advance: (dt) => {
      const s = get()
      if (!s.playing || !config.timeline) return
      let next = s.progress + (dt * s.speed) / config.cycleDuration
      if (next >= 1) {
        if (config.loop) next = wrap01(next)
        else {
          set({ ...withCue(s, 1), playing: false })
          return
        }
      }
      set(withCue(s, next))
    },
    play: () => {
      const s = get()
      // One-shot timelines restart when played from the end.
      if (!config.loop && s.progress >= 1) set({ ...withCue(s, 0), playing: true })
      else set({ playing: true })
    },
    pause: () => set({ playing: false }),
    toggle: () => (get().playing ? get().pause() : get().play()),
    restart: () => set({ ...withCue(get(), 0), playing: true }),
    seek: (p) => {
      const s = get()
      set(withCue(s, config.loop ? wrap01(p) : clamp(p, 0, 1)))
    },
    stepBy: (n) => {
      const s = get()
      // Snap to the step grid so repeated steps land on identical poses.
      const steps = Math.round(s.progress / config.stepSize) + n
      set({ ...withCue(s, config.loop ? wrap01(steps * config.stepSize) : clamp(steps * config.stepSize, 0, 1)), playing: false })
    },
    setSpeed: (speed) => set({ speed }),
    seekCue: (cueId) => {
      const cue = config.cues.find((c) => c.id === cueId)
      if (!cue) return
      const s = get()
      const params = cue.params ? { ...s.params, ...cue.params } : s.params
      set({ ...withCue(s, cue.progress ?? s.progress, params), playing: false })
    },
    setParam: (key, value) => {
      const s = get()
      set(withCue(s, s.progress, { ...s.params, [key]: value }))
    },
    select: (id) => set({ selectedId: id }),
    hover: (id) => set({ hoveredId: id }),
    toggleHidden: (id) => {
      const hidden = { ...get().hidden }
      if (hidden[id]) delete hidden[id]
      else hidden[id] = true
      set({ hidden })
    },
    showAll: () => set({ hidden: {}, isolatedId: null }),
    isolate: (id) => set({ isolatedId: id, selectedId: id ?? get().selectedId }),
    setExploded: (exploded) => set({ exploded }),
    toggleLabels: () => set({ showLabels: !get().showLabels }),
    registerCamera: (camera) => set({ camera }),
    resetCamera: () => get().camera?.reset(),
  }))
}
