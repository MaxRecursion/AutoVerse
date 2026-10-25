import type { LearningPath, Topic } from '@/lib/schemas'

export interface PathProgress {
  path: LearningPath
  /** Topics in path order that exist in the content bundle (unwritten ids are skipped). */
  topics: Topic[]
  /** How many path ids do not resolve to a topic yet. */
  missing: number
  completed: number
  total: number
  /** 0–100, of the available topics. */
  percent: number
  /** First available topic not yet completed. */
  next?: Topic
}

const LEVEL_ORDER = { beginner: 0, intermediate: 1, advanced: 2 } as const

/** The best ordered path for a lesson; overlapping topics favor the beginner route. */
export function resolveTopicPathProgress(
  topicId: string,
  paths: readonly LearningPath[],
  getTopic: (id: string) => Topic | undefined,
  completed: Readonly<Record<string, string>>,
): PathProgress | undefined {
  return paths
    .filter((path) => path.topicIds.includes(topicId))
    .map((path) => resolvePathProgress(path, getTopic, completed))
    .filter((progress) => progress.topics.some((topic) => topic.id === topicId))
    .sort((a, b) => LEVEL_ORDER[a.path.level] - LEVEL_ORDER[b.path.level] || a.path.order - b.path.order)[0]
}

/** Current route follows the latest visited path lesson, then saved progress, then the beginner path. */
export function resolveCurrentPathProgress(
  paths: readonly LearningPath[],
  recentTopicIds: readonly string[],
  getTopic: (id: string) => Topic | undefined,
  completed: Readonly<Record<string, string>>,
): PathProgress | undefined {
  for (const topicId of recentTopicIds) {
    const progress = resolveTopicPathProgress(topicId, paths, getTopic, completed)
    if (progress) return progress
  }
  const ordered = [...paths].sort((a, b) => a.order - b.order)
  const started = ordered
    .map((path) => resolvePathProgress(path, getTopic, completed))
    .filter((progress) => progress.completed > 0)
    .sort((a, b) => b.completed - a.completed || LEVEL_ORDER[a.path.level] - LEVEL_ORDER[b.path.level] || a.path.order - b.path.order)[0]
  if (started) return started
  const fallback = ordered.find((path) => path.level === 'beginner') ?? ordered[0]
  return fallback ? resolvePathProgress(fallback, getTopic, completed) : undefined
}

/** First unfinished path after the current path, wrapping to earlier paths if needed. */
export function resolveNextPathProgress(
  paths: readonly LearningPath[],
  currentPathId: string,
  getTopic: (id: string) => Topic | undefined,
  completed: Readonly<Record<string, string>>,
): PathProgress | undefined {
  const ordered = [...paths].sort((a, b) => a.order - b.order)
  const currentIndex = ordered.findIndex((path) => path.id === currentPathId)
  const candidates = [...ordered.slice(currentIndex + 1), ...ordered.slice(0, currentIndex + 1)]
  for (const path of candidates) {
    if (path.id === currentPathId) continue
    const progress = resolvePathProgress(path, getTopic, completed)
    if (progress.next) return progress
  }
  return undefined
}

export function resolvePathProgress(
  path: LearningPath,
  getTopic: (id: string) => Topic | undefined,
  completed: Readonly<Record<string, string>>,
): PathProgress {
  const seen = new Set<string>()
  const topics: Topic[] = []
  let missing = 0
  for (const id of path.topicIds) {
    if (seen.has(id)) continue
    seen.add(id)
    const t = getTopic(id)
    if (t) topics.push(t)
    else missing++
  }
  const done = topics.filter((t) => completed[t.id]).length
  return {
    path,
    topics,
    missing,
    completed: done,
    total: topics.length,
    percent: topics.length ? Math.round((done / topics.length) * 100) : 0,
    next: topics.find((t) => !completed[t.id]),
  }
}
