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
    expect(describeExhaust(viper, { v10: true, view: 'engine', running: true, reduced: true }).gas).toMatch(/hidden in the still view/)
    expect(describeExhaust(viper, { v10: true, view: 'engine', running: false, reduced: false }).note).toBe('Start the engine to fill the exhaust with gas.')
    expect(describeExhaust(viper, { v10: true, view: 'detail', running: true, reduced: true }).note).toMatch(/^Still view/)
  })

  it('explains the column, the plume and what is illustrative, in both views', () => {
    const engine = describeExhaust(spec('inline-6'), { v10: false, view: 'engine', ...running }).note
    expect(engine).toMatch(/surges into its header/)
    expect(engine).toMatch(/cooling plume/)
    expect(engine).toMatch(/pressure waves/)
    expect(engine).toMatch(/Slowed 40×/)
    expect(engine).toMatch(/illustrative/)
    const detail = describeExhaust(spec('inline-6'), { v10: false, view: 'detail', ...running }).note
    expect(detail).toMatch(/surges into the header/)
    expect(detail).not.toMatch(/plume/)
  })

  it('adds the boxer’s unequal headers and the diesel’s cooler, sootier gas', () => {
    expect(describeExhaust(spec('flat-4'), { v10: false, view: 'engine', ...running }).note).toMatch(/Bank B's pipes are longer/)
    expect(describeExhaust(spec('flat-6'), { v10: false, view: 'engine', ...running }).note).not.toMatch(/longer/)
    expect(describeExhaust(spec('v10-tdi'), { v10: true, view: 'engine', ...running }).note).toMatch(/diesel runs lean/)
    expect(describeExhaust(spec('v10-tdi'), { v10: true, view: 'engine', running: false, reduced: false }).note).not.toMatch(/diesel/)
    expect(describeExhaust(spec('v10-viper'), { v10: true, view: 'engine', ...running }).note).not.toMatch(/diesel/)
  })
})
