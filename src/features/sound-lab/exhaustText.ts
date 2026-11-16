/**
 * Words for the 3D cutaway's exhaust: the plumbing and gas clauses of the
 * canvas labels, and the note under the canvas. Pure, so every preset and
 * state (running, stopped, reduced motion) can be checked without WebGL. The
 * gas is decorative motion, so these describe the state rather than announce
 * each burst.
 */
import { VISUAL_SLOWDOWN } from './animation'
import type { EngineSpec } from './engines'
import { longHeaderSide } from './exhaust'

export interface ExhaustState {
  /** The dedicated V10 scene, which draws five crank throws. */
  v10: boolean
  view: 'engine' | 'detail'
  running: boolean
  reduced: boolean
}

export interface ExhaustWords {
  /** The pipework drawn in the whole-engine view. */
  pipes: string
  /** What the gas is doing in the whole-engine view. */
  gas: string
  /** The note under the canvas. */
  note: string
}

type Spec = Pick<EngineSpec, 'layout' | 'separateBanks' | 'ignition' | 'voice' | 'bankA' | 'bankB'>

function pipework(spec: Spec, v10: boolean): string {
  if (v10) return spec.separateBanks ? "each bank's headers, collector and tailpipe" : "both banks' headers and collectors joining one tailpipe behind the engine"
  if (spec.layout === 'inline') return 'an exhaust manifold and tailpipe'
  return spec.separateBanks ? 'an exhaust manifold and tailpipe for each bank' : 'an exhaust manifold for each bank, joining one tailpipe behind the engine'
}

export function describeExhaust(spec: Spec, state: ExhaustState): ExhaustWords {
  const { view, running, reduced } = state
  const moving = running && !reduced
  const gas = moving
    ? 'hot exhaust gas surges from each port as its valve opens, cools along the pipes and leaves as a fading plume'
    : running
      ? 'exhaust gas is hidden in the still view'
      : 'the pipes fill with exhaust gas once the engine runs'
  let note: string
  if (!running) note = 'Start the engine to fill the exhaust with gas.'
  else if (reduced) note = 'Still view: the exhaust gas is hidden while motion is reduced.'
  else if (view === 'detail') {
    note = `When the exhaust valve opens, a hot burst of gas surges into the header; the rising piston pushes out the rest, then the gas waits until the valve opens again. Slowed ${VISUAL_SLOWDOWN}× with the mechanism; heat colours and haze are illustrative.`
  } else {
    const longBank = longHeaderSide(spec)
    note = [
      'When an exhaust valve opens, a hot burst of gas surges into its header; the rising piston pushes out the rest, then the gas waits there until the valve opens again.',
      'The collectors carry it, cooling, out of the tailpipe as a cooling plume.',
      longBank ? `Bank ${longBank}'s pipes are longer, so its gas reaches the shared pipe later: the boxer's unequal-length headers.` : '',
      'The sound travels as pressure waves many times faster than the gas, so the gas reaches the tailpipe in a different order from the firing rhythm you hear.',
      `Slowed ${VISUAL_SLOWDOWN}× with the mechanism; heat colours, haze and pipe glow are illustrative, and the pipework is simplified (no catalytic converters, silencers or turbochargers).`,
    ]
      .filter(Boolean)
      .join(' ')
  }
  if (moving && spec.ignition === 'compression') note += ' A diesel runs lean, so its exhaust is cooler and its pipes rarely glow; under load its gas carries soot.'
  return { pipes: pipework(spec, state.v10), gas, note }
}
