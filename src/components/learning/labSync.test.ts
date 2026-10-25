import { describe, expect, it } from 'vitest'
import { createLabStore, defineLabConfig } from '@/lib/simulation/labStore'
import { labHasCue, selectActiveStepId } from './labSync'

// Strokes are the live cue; "spark" is an event inside the compression stroke.
const timelineLab = () =>
  createLabStore(
    defineLabConfig({
      id: 'sync-test',
      cues: [
        { id: 'intake', label: 'Intake', progress: 0.1 },
        { id: 'compression', label: 'Compression', progress: 0.35 },
        { id: 'spark', label: 'Spark', progress: 0.45 },
        { id: 'power', label: 'Power', progress: 0.6 },
      ],
      deriveCue: (p) => (p < 0.25 ? 'intake' : p < 0.5 ? 'compression' : 'power'),
    }),
  )

const steps = [
  { id: 'step-intake', cue: 'intake' },
  { id: 'step-compression', cue: 'compression' },
  { id: 'step-spark', cue: 'spark' },
  { id: 'step-summary' },
]

describe('selectActiveStepId', () => {
  it('follows the live cue while the lab plays', () => {
    const store = timelineLab()
    store.getState().seek(0.3)
    store.getState().play()
    expect(selectActiveStepId(steps, store.getState())).toBe('step-compression')
    store.getState().advance(0)
    store.getState().seek(0.05)
    expect(selectActiveStepId(steps, store.getState())).toBe('step-intake')
  })

  it('highlights an event step after "Show in 3D", not its enclosing stroke', () => {
    const store = timelineLab()
    store.getState().seekCue('spark')
    expect(store.getState().cue).toBe('compression')
    expect(selectActiveStepId(steps, store.getState())).toBe('step-spark')
    // Resuming playback hands the highlight back to the live stroke.
    store.getState().play()
    expect(selectActiveStepId(steps, store.getState())).toBe('step-compression')
  })

  it('returns null when no step matches what the scene shows', () => {
    const store = timelineLab()
    store.getState().seek(0.7)
    expect(store.getState().cue).toBe('power')
    expect(selectActiveStepId(steps, store.getState())).toBeNull()
  })

  it('matches parameter cues in param-driven labs', () => {
    const store = createLabStore(
      defineLabConfig({
        id: 'gears',
        timeline: false,
        initialParams: { gear: 1 },
        cues: [
          { id: 'first', label: 'First gear', params: { gear: 1 } },
          { id: 'second', label: 'Second gear', params: { gear: 2 } },
        ],
      }),
    )
    const gearSteps = [
      { id: 'a', cue: 'first' },
      { id: 'b', cue: 'second' },
    ]
    expect(selectActiveStepId(gearSteps, store.getState())).toBe('a')
    store.getState().seekCue('second')
    expect(selectActiveStepId(gearSteps, store.getState())).toBe('b')
    store.getState().setParam('gear', 3)
    expect(selectActiveStepId(gearSteps, store.getState())).toBeNull()
  })
})

describe('labHasCue', () => {
  it('only accepts cues the lab defines', () => {
    const store = timelineLab()
    expect(labHasCue(store, 'spark')).toBe(true)
    expect(labHasCue(store, 'exhaust')).toBe(false)
    expect(labHasCue(store, undefined)).toBe(false)
    expect(labHasCue(null, 'spark')).toBe(false)
  })
})
