import type { ComponentType } from 'react'
import type { LabConfig } from '@/lib/simulation/labStore'

export interface LabViewProps {
  variant: 'full' | 'embedded'
}

/**
 * A lab = pure config (timeline, cues, params — eagerly imported, no three.js)
 * + a lazily loaded view (scene + controls + explanation) that reads the lab
 * store from context. Add a lab by creating features/<name>-lab/{config,View}
 * and registering it in registry.ts.
 */
export interface LabDefinition {
  id: string
  title: string
  shortTitle: string
  summary: string
  /** Vehicle system id (matches content components' systemId). */
  systemId: string
  /** Primary lesson topic id. */
  topicId: string
  config: LabConfig
  load: () => Promise<{ default: ComponentType<LabViewProps> }>
  /** Labs are listed in this order; status lets the UI be honest about depth. */
  order: number
  status: 'complete' | 'beta'
}
