// @vitest-environment node
import { renderGraphSvg } from './exportSvg'
import type { PositionedEdge, PositionedNode } from './transform'

describe('renderGraphSvg', () => {
  it('exports graph nodes, relationship labels, and escaped source names', () => {
    const nodes: PositionedNode[] = [
      { id: 'project', label: 'demo & app', kind: 'project', x: 10, y: 20 },
      { id: 'file', label: 'index.ts', kind: 'file', path: 'src/index.ts', x: 340, y: 20 },
    ]
    const edges: PositionedEdge[] = [{ source: 'project', target: 'file', label: 'Contains' }]
    const svg = renderGraphSvg(nodes, edges)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('demo &amp; app')
    expect(svg).toContain('src/index.ts')
    expect(svg).toContain('>Contains</text>')
    expect(svg).toContain('<path d=')
  })
})
