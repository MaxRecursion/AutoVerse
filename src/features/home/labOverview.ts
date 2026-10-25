import { labs } from '@/features/labs/registry'
import type { LabDefinition } from '@/features/labs/types'
import { categories, getTopic, sceneComponents, topics } from '@/lib/content'
import type { Category, SceneComponent, Topic } from '@/lib/schemas'

/**
 * What the labs index and the homepage say about each registered lab:
 * its lesson, the vehicle system it covers and the parts documented for that
 * system. Everything is derived from the registry and the content bundle, so
 * a newly registered lab appears without touching these pages.
 */
export interface LabOverview {
  lab: LabDefinition
  /** Primary lesson (registry `topicId`), or another lesson that embeds the lab; absent until written. */
  lesson?: Topic
  /** First category (by order) mapped to the lab's vehicle system. */
  system?: Category
  /** Documented components of the lab's vehicle system. */
  parts: SceneComponent[]
  /** Further lessons that embed this lab (excluding `lesson`), by title. */
  lessons: Topic[]
}

export interface LabContentSources {
  getTopic: (id: string) => Topic | undefined
  categories: readonly Category[]
  topics: readonly Topic[]
  components: readonly SceneComponent[]
}

export const LAB_STATUS_LABEL: Record<LabDefinition['status'], string> = {
  complete: 'Complete',
  beta: 'Beta',
}

export const sortLabs = (list: readonly LabDefinition[]): LabDefinition[] => [...list].sort((a, b) => a.order - b.order)

export const labPath = (lab: Pick<LabDefinition, 'id'>) => `/labs/${lab.id}`

export function systemCategory(systemId: string, list: readonly Category[]): Category | undefined {
  return [...list].sort((a, b) => a.order - b.order).find((c) => c.systemId === systemId)
}

/** The lesson a lab links to: its registry topic when written, else any lesson that embeds the lab. */
export function primaryLesson(lab: Pick<LabDefinition, 'id' | 'topicId'>, src: Pick<LabContentSources, 'getTopic' | 'topics'>): Topic | undefined {
  return src.getTopic(lab.topicId) ?? src.topics.find((t) => t.labId === lab.id)
}

export function buildLabOverview(lab: LabDefinition, src: LabContentSources): LabOverview {
  const lesson = primaryLesson(lab, src)
  return {
    lab,
    lesson,
    system: systemCategory(lab.systemId, src.categories),
    parts: src.components.filter((c) => c.systemId === lab.systemId),
    lessons: src.topics.filter((t) => t.labId === lab.id && t.id !== lesson?.id).sort((a, b) => a.title.localeCompare(b.title)),
  }
}

const bundled: LabContentSources = { getTopic, categories, topics, components: sceneComponents }
let cached: LabOverview[] | null = null

/** Overviews of every registered lab, in registry order (memoised; content is static). */
export function getLabOverviews(): LabOverview[] {
  cached ??= sortLabs(labs).map((lab) => buildLabOverview(lab, bundled))
  return cached
}
