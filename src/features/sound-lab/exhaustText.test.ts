import { describe, expect, it } from 'vitest'
import { getEngine } from './engines'
import { describeExhaust } from './exhaustText'

const spec = (id: string) => getEngine(id)!
const running = { running: true, reduced: false }

describe('exhaust words', () => {
  it('names each layout’s pipework, and joins shared exhausts behind the engine', () => {
    expect(describeExhaust(spec('inline-4'), { v10: false, view: 'engine', ...running }).pipes).toBe('an exhaust manifold and tailpipe')
    expect(describeExhaust(spec('v8-cross'), { v10: false, view: 'engine', ...running }).pipes).toBe('an exhaust manifold and tailpipe for each bank')
    expect(describeExhaust(spec('flat-4'), { v10: false, view: 'engine', ...running }).pipes).toMatch(/joining one tailpipe behind the engine/)
    expect(describeExhaust(spec('v10-viper'), { v10: true, view: 'engine', ...running }).pipes).toBe("each bank's headers, collector and tailpipe")
    // The shared-exhaust trucks no longer claim a tailpipe per bank.
    expect(describeExhaust(spec('v10-magnum'), { v10: true, view: 'engine', ...running }).pipes).toBe("both banks' headers and collectors joining one tailpipe behind the engine")
  })

  it('describes the gas as it is: flowing, waiting for a start, or hidden by reduced motion', () => {
    const viper = spec('v10-viper')
    expect(describeExhaust(viper, { v10: true, view: 'engine', running: true, reduced: false }).gas).toMatch(/surges from each port as its valve opens/)
    expect(describeExhaust(viper, { v10: true, view: 'engine', running: false, reduced: false }).gas).toMatch(/once the engine runs/)
    expect(describeExhaust(viper, { v10: true, view: 'engine', running: true, reduced: true }).gas).toMatch(/not drawn while motion is reduced/)
    expect(describeExhaust(viper, { v10: true, view: 'engine', running: false, reduced: false }).note).toBe('Start the engine to fill the exhaust with gas.')
    expect(describeExhaust(viper, { v10: true, view: 'detail', running: true, reduced: true }).note).toMatch(/^Still view/)
    // With reduced motion the gas is never drawn, so a stopped engine must not promise it.
    const stillStopped = describeExhaust(viper, { v10: true, view: 'engine', running: false, reduced: true })
    expect(stillStopped.note).toMatch(/^Still view/)
    expect(stillStopped.note).not.toMatch(/Start the engine/)
    expect(stillStopped.gas).not.toMatch(/fill with exhaust gas/)
  })

  it('explains the column, the plume and what is illustrative, in both views', () => {
    const engine = describeExhaust(spec('inline-6'), { v10: false, view: 'engine', ...running }).note
    expect(engine).toMatch(/surges into its header/)
    expect(engine).toMatch(/cooling plume/)
    expect(engine).toMatch(/pressure waves/)
    // Arrival order sometimes matches the firing order; spacing always differs, so only spacing is claimed.
    expect(engine).toMatch(/different spacing/)
    expect(engine).not.toMatch(/different order/)
    expect(engine).toMatch(/Slowed 40×/)
    expect(engine).toMatch(/illustrative/)
    const detail = describeExhaust(spec('inline-6'), { v10: false, view: 'detail', ...running }).note
    expect(detail).toMatch(/surges into the header/)
    expect(detail).not.toMatch(/plume/)
  })

  it('follows the gas out of the pipework actually drawn', () => {
    const note = (id: string, v10 = false) => describeExhaust(spec(id), { v10, view: 'engine', ...running }).note
    expect(note('inline-4')).toMatch(/The collector carries it on, losing heat to the pipe walls, and out of the tailpipe as a cooling plume\./)
    expect(note('v8-cross')).toMatch(/Each bank's collector carries it on, losing heat to the pipe walls, and out of that bank's own tailpipe as a cooling plume\./)
    expect(note('v10-viper', true)).toMatch(/Each bank's collector/)
    expect(note('v6-90-odd')).toMatch(/The banks' collectors carry it on, losing heat to the pipe walls, into one tailpipe behind the engine and out as a cooling plume\./)
    expect(note('v10-magnum', true)).toMatch(/into one tailpipe behind the engine/)
    // The note says "cooling" once, not twice in one breath.
    for (const id of ['inline-4', 'v8-cross', 'v6-90-odd']) expect(note(id).match(/cooling/g)).toHaveLength(1)
  })

  it('adds the boxer’s unequal headers and the diesel’s cooler, sootier gas', () => {
    expect(describeExhaust(spec('flat-4'), { v10: false, view: 'engine', ...running }).note).toMatch(/Bank B's pipes are longer/)
    expect(describeExhaust(spec('flat-6'), { v10: false, view: 'engine', ...running }).note).not.toMatch(/longer/)
    expect(describeExhaust(spec('v10-tdi'), { v10: true, view: 'engine', ...running }).note).toMatch(/diesel runs lean/)
    expect(describeExhaust(spec('v10-tdi'), { v10: true, view: 'engine', running: false, reduced: false }).note).not.toMatch(/diesel/)
    expect(describeExhaust(spec('v10-viper'), { v10: true, view: 'engine', ...running }).note).not.toMatch(/diesel/)
  })
})
