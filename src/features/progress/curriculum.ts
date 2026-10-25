import type { Layer, LearningPath, Topic } from '@/lib/schemas'
import {
  resolveCurrentPathProgress,
  resolveNextPathProgress,
  resolveTopicPathProgress,
  type PathProgress,
} from './paths'

/**
 * The learner's spine. Every system is taught surface → mechanism → engineering;
 * this module owns the ordering and the single "what should I do next?" answer
 * used by the header, lesson, hub and home page. Pure — content is injected.
 */

export interface LayerInfo {
  id: Layer
  order: number
  label: string
  /** Verb phrase shown on rails and buttons. */
  action: string
  description: string
}

export const LAYERS: readonly LayerInfo[] = [
  { id: 'surface', order: 0, label: 'Surface', action: 'Get the idea', description: 'What it is and why it exists, in plain language, with the whole system in view.' },
  { id: 'mechanism', order: 1, label: 'Mechanism', action: 'See it work', description: 'How the parts move and interact, usually with a live 3D laboratory.' },
  { id: 'engineering', order: 2, label: 'Engineering', action: 'Go deeper', description: 'The numbers, trade-offs and variants engineers design with.' },
]

const LAYER_ORDER: Record<Layer, number> = { surface: 0, mechanism: 1, engineering: 2 }
const DIFFICULTY_ORDER = { beginner: 0, intermediate: 1, advanced: 2 } as const

export const getLayerInfo = (layer: Layer) => LAYERS[LAYER_ORDER[layer]]!

/** A lesson's layer, falling back to its difficulty for content that has not been assigned one. */
export function layerOf(topic: Pick<Topic, 'layer' | 'difficulty'>): Layer {
  if (topic.layer) return topic.layer
  return topic.difficulty === 'beginner' ? 'surface' : topic.difficulty === 'intermediate' ? 'mechanism' : 'engineering'
}

/** Learning order inside a system: layer, then fewer prerequisites, then difficulty, duration, title. */
export function ladderOrder(topics: readonly Topic[]): Topic[] {
  return [...topics].sort(
    (a, b) =>
      LAYER_ORDER[layerOf(a)] - LAYER_ORDER[layerOf(b)] ||
      a.prerequisiteTopicIds.length - b.prerequisiteTopicIds.length ||
      DIFFICULTY_ORDER[a.difficulty] - DIFFICULTY_ORDER[b.difficulty] ||
      a.estimatedDuration - b.estimatedDuration ||
      a.title.localeCompare(b.title),
  )
}

export interface LadderRung {
  layer: LayerInfo
  topics: Topic[]
  completed: number
  /** First lesson in the rung that is not completed yet. */
  next?: Topic
}

/** The system ladder: non-empty rungs, each with its own completion count. */
export function buildLadder(topics: readonly Topic[], completed: Readonly<Record<string, string>>): LadderRung[] {
  const ordered = ladderOrder(topics)
  return LAYERS.map((layer) => {
    const inRung = ordered.filter((t) => layerOf(t) === layer.id)
    return {
      layer,
      topics: inRung,
      completed: inRung.filter((t) => completed[t.id]).length,
      next: inRung.find((t) => !completed[t.id]),
    }
  }).filter((r) => r.topics.length > 0)
}

export interface LayerProgress {
  layer: LayerInfo
  total: number
  completed: number
  percent: number
}

/** Completion per layer across a whole set of lessons (the "How you'll learn" strip). */
export function layerProgress(topics: readonly Topic[], completed: Readonly<Record<string, string>>): LayerProgress[] {
  return LAYERS.map((layer) => {
    const inLayer = topics.filter((t) => layerOf(t) === layer.id)
    const done = inLayer.filter((t) => completed[t.id]).length
    return { layer, total: inLayer.length, completed: done, percent: inLayer.length ? Math.round((done / inLayer.length) * 100) : 0 }
  })
}

export interface Route {
  kind: 'path' | 'system'
  title: string
  topics: Topic[]
  /** Set when the route is a learning path. */
  path?: PathProgress
}

export type NextUpKind = 'start' | 'continue' | 'next' | 'revisit' | 'new-route' | 'done'

export interface NextUp {
  kind: NextUpKind
  topic?: Topic
  /** Short, honest label for the action ("Start here", "Next lesson", "Skipped earlier"…). */
  label: string
  route?: Route & { index: number; completed: number }
  /** Earlier, still-incomplete steps of the current route (never mislabelled as "next"). */
  skipped: Topic[]
  /** Prerequisites of the current lesson that are not completed. */
  unmetPrerequisites: Topic[]
}

export interface NextUpContext {
  topics: readonly Topic[]
  paths: readonly LearningPath[]
  completed: Readonly<Record<string, string>>
  recent: readonly { topicId: string }[]
  getTopic: (id: string) => Topic | undefined
  /** Lesson the learner is on right now; omit for the global answer (header, home). */
  currentTopicId?: string
}

/** The route a lesson belongs to: its best learning path, else its system ladder. */
export function resolveRoute(topic: Topic, ctx: NextUpContext): Route {
  const path = resolveTopicPathProgress(topic.id, ctx.paths, ctx.getTopic, ctx.completed)
  if (path) return { kind: 'path', title: path.path.title, topics: path.topics, path }
  const system = ctx.topics.filter((t) => t.categoryId === topic.categoryId)
  return { kind: 'system', title: 'This system, surface to depth', topics: ladderOrder(system) }
}

export function resolveNextUp(ctx: NextUpContext): NextUp {
  const { completed } = ctx
  const current = ctx.currentTopicId ? ctx.getTopic(ctx.currentTopicId) : undefined

  if (current) {
    const route = resolveRoute(current, ctx)
    const index = route.topics.findIndex((t) => t.id === current.id)
    const withMeta = { ...route, index, completed: route.topics.filter((t) => completed[t.id]).length }
    const skipped = route.topics.slice(0, Math.max(index, 0)).filter((t) => !completed[t.id])
    const unmet = current.prerequisiteTopicIds.map(ctx.getTopic).filter((t): t is Topic => !!t && !completed[t.id])
    const base = { route: withMeta, skipped, unmetPrerequisites: unmet }

    const after = route.topics.slice(index + 1).find((t) => !completed[t.id])
    if (after) return { ...base, kind: 'next', topic: after, label: completed[current.id] ? 'Next lesson' : 'After this lesson' }
    if (skipped.length) return { ...base, kind: 'revisit', topic: skipped[0], label: 'Skipped earlier' }
    const other = route.path ? resolveNextPathProgress(ctx.paths, route.path.path.id, ctx.getTopic, completed) : undefined
    if (other?.next) return { ...base, kind: 'new-route', topic: other.next, label: `Start “${other.path.title}”` }
    return { ...base, kind: 'done', label: 'Route complete' }
  }

  const empty = { skipped: [], unmetPrerequisites: [] }
  const anyDone = Object.keys(completed).length > 0
  const lastOpen = ctx.recent.map((r) => ctx.getTopic(r.topicId)).find((t): t is Topic => !!t && !completed[t.id])
  const current_ = resolveCurrentPathProgress(ctx.paths, ctx.recent.map((r) => r.topicId), ctx.getTopic, completed)
  const withRoute = (p?: PathProgress, topic?: Topic) =>
    p ? { route: { kind: 'path' as const, title: p.path.title, topics: p.topics, path: p, index: topic ? p.topics.findIndex((t) => t.id === topic.id) : 0, completed: p.completed } } : {}

  if (!anyDone && !lastOpen) {
    const first = current_?.next ?? ctx.topics.find((t) => layerOf(t) === 'surface')
    return { ...empty, ...withRoute(current_, first), kind: 'start', topic: first, label: 'Start here' }
  }
  if (lastOpen) return { ...empty, ...withRoute(resolveTopicPathProgress(lastOpen.id, ctx.paths, ctx.getTopic, completed), lastOpen), kind: 'continue', topic: lastOpen, label: 'Continue' }
  if (current_?.next) return { ...empty, ...withRoute(current_, current_.next), kind: 'next', topic: current_.next, label: 'Next lesson' }
  const other = current_ ? resolveNextPathProgress(ctx.paths, current_.path.id, ctx.getTopic, completed) : undefined
  if (other?.next) return { ...empty, ...withRoute(other, other.next), kind: 'new-route', topic: other.next, label: `Start “${other.path.title}”` }
  return { ...empty, kind: 'done', label: 'Everything complete' }
}

/** Overall completion for the header pill. */
export function overallProgress(topics: readonly Topic[], completed: Readonly<Record<string, string>>) {
  const done = topics.filter((t) => completed[t.id]).length
  return { completed: done, total: topics.length, percent: topics.length ? Math.round((done / topics.length) * 100) : 0 }
}
