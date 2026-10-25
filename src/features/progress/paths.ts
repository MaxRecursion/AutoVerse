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
