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

/** Where the gas goes after the headers, in the note: one collector, one per bank, or banks joining. */
function outflow(spec: Spec): string {
  if (spec.layout === 'inline') return 'The collector carries it on, losing heat to the pipe walls, and out of the tailpipe as a cooling plume.'
  if (spec.separateBanks) return "Each bank's collector carries it on, losing heat to the pipe walls, and out of that bank's own tailpipe as a cooling plume."
  return "The banks' collectors carry it on, losing heat to the pipe walls, into one tailpipe behind the engine and out as a cooling plume."
}

function pipework(spec: Spec, v10: boolean): string {
  if (v10) return spec.separateBanks ? "each bank's headers, collector and tailpipe" : "both banks' headers and collectors joining one tailpipe behind the engine"
  if (spec.layout === 'inline') return 'an exhaust manifold and tailpipe'
  return spec.separateBanks ? 'an exhaust manifold and tailpipe for each bank' : 'an exhaust manifold for each bank, joining one tailpipe behind the engine'
}

export function describeExhaust(spec: Spec, state: ExhaustState): ExhaustWords {
  const { view, running, reduced } = state
  const moving = running && !reduced
  // Reduced motion never draws the gas, running or not, so it is checked first.
  const gas = moving
    ? 'hot exhaust gas surges from each port as its valve opens, cools along the pipes and leaves as a fading plume'
    : reduced
      ? 'exhaust gas is not drawn while motion is reduced'
      : 'the pipes fill with exhaust gas once the engine runs'
  let note: string
  if (reduced) note = running ? 'Still view: the exhaust gas is hidden while motion is reduced.' : 'Still view: exhaust gas is not drawn while motion is reduced.'
  else if (!running) note = 'Start the engine to fill the exhaust with gas.'
  else if (view === 'detail') {
    note = `When the exhaust valve opens, a hot burst of gas surges into the header; the rising piston pushes out the rest, then the gas waits until the valve opens again. Slowed ${VISUAL_SLOWDOWN}× with the mechanism; heat colours and haze are illustrative.`
  } else {
    const longBank = longHeaderSide(spec)
    note = [
      'When an exhaust valve opens, a hot burst of gas surges into its header; the rising piston pushes out the rest, then the gas waits there until the valve opens again.',
      outflow(spec),
      longBank ? `Bank ${longBank}'s pipes are longer, so its gas reaches the shared pipe later: the boxer's unequal-length headers.` : '',
      // Arrival spacing always differs (routes differ in length); the order sometimes does too, so only spacing is claimed.
      'Sound travels through the exhaust as pressure waves, many times faster than the gas itself, so puffs of gas reach the tailpipe with different spacing from the rhythm you hear.',
      `Slowed ${VISUAL_SLOWDOWN}× with the mechanism; heat colours, haze and pipe glow are illustrative, and the pipework is simplified (no catalytic converters, silencers or turbochargers).`,
    ]
      .filter(Boolean)
      .join(' ')
  }
  if (moving && spec.ignition === 'compression') note += ' A diesel runs lean, so its exhaust is cooler and its pipes rarely glow; under load its gas carries soot.'
  return { pipes: pipework(spec, state.v10), gas, note }
}
