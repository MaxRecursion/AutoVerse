import type { GroupId } from './systemMapModel'

/** Accent colour per node group: SVG fill in the diagram, background in the legend. */
export const GROUP_FILL: Readonly<Record<GroupId, string>> = {
  power: 'fill-amber',
  driveline: 'fill-amber/55',
  wheels: 'fill-paper',
  chassis: 'fill-ok',
  electrical: 'fill-cyan',
  support: 'fill-steel-400',
}

export const GROUP_BG: Readonly<Record<GroupId, string>> = {
  power: 'bg-amber',
  driveline: 'bg-amber/55',
  wheels: 'bg-paper',
  chassis: 'bg-ok',
  electrical: 'bg-cyan',
  support: 'bg-steel-400',
}
