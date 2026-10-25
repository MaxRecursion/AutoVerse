import { DIFFICULTY_LABEL, topicHref } from '@/components/learning/labels'
import type { Category, LearningPath, Topic } from '@/lib/schemas'

/**
 * Pure view-model helpers for the homepage and the 404 page (data in, data
 * out — no React, no bundled-content imports), so they are unit-testable.
 */

/** Document title for `/` — the same site title index.html and the prerendered page use. */
export const HOME_DOCUMENT_TITLE = 'AutoVerse — Understand Every Moving Part'

export interface CategoryTile {
  category: Category
  /** Number of written lessons in the category. */
  count: number
}

/** Categories in display order with their lesson counts. */
export function categoryTiles(categories: readonly Category[], topics: readonly Pick<Topic, 'categoryId'>[]): CategoryTile[] {
  const counts = new Map<string, number>()
  for (const t of topics) counts.set(t.categoryId, (counts.get(t.categoryId) ?? 0) + 1)
  return [...categories].sort((a, b) => a.order - b.order).map((category) => ({ category, count: counts.get(category.id) ?? 0 }))
}

/** The curated beginner path: the first beginner-level path by `order`, else the first path of any level. */
export function pickBeginnerPath(paths: readonly LearningPath[]): LearningPath | undefined {
  const sorted = [...paths].sort((a, b) => a.order - b.order)
  return sorted.find((p) => p.level === 'beginner') ?? sorted[0]
}

/** "Beginner: how a car moves" → "How a car moves" (the level is shown separately). */
export function displayPathTitle(path: Pick<LearningPath, 'title' | 'level'>): string {
  const prefix = new RegExp(`^${DIFFICULTY_LABEL[path.level]}\\s*[:–—-]\\s*`, 'i')
  const rest = path.title.replace(prefix, '').trim()
  return rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : path.title
}

export interface RecentTopic {
  topic: Topic
  /** ISO timestamp of the last visit. */
  at: string
}

/** Most recent visits that still resolve to a lesson, newest first, de-duplicated. */
export function resolveRecent(
  recent: readonly { topicId: string; at: string }[],
  getTopic: (id: string) => Topic | undefined,
  limit = 3,
): RecentTopic[] {
  const out: RecentTopic[] = []
  const seen = new Set<string>()
  for (const r of recent) {
    if (out.length >= limit) break
    if (seen.has(r.topicId)) continue
    seen.add(r.topicId)
    const topic = getTopic(r.topicId)
    if (topic) out.push({ topic, at: r.at })
  }
  return out
}

/** "Start Learning" goes to the next unfinished lesson of the beginner path, or the lesson index. */
export const startLearningHref = (next: Pick<Topic, 'slug'> | undefined): string => (next ? topicHref(next) : '/learn')

/** Sum of lesson durations, in minutes. */
export const totalMinutes = (list: readonly Pick<Topic, 'estimatedDuration'>[]): number =>
  list.reduce((sum, t) => sum + t.estimatedDuration, 0)

/** Example searches offered next to the homepage search entry (each must find something; see tests). */
export const SEARCH_SUGGESTIONS = ['Piston', 'Camshaft', 'Differential', 'Tyre grip', 'Alternator'] as const

/**
 * A search query guessed from a path that did not resolve:
 * "/topics/brake-pads" → "brake pads". Empty for "/" or non-word paths.
 */
export function queryFromPath(pathname: string): string {
  const last = pathname.split(/[/?#]/).filter(Boolean).pop() ?? ''
  let text = last
  try {
    text = decodeURIComponent(last)
  } catch {
    // Malformed escape sequence: fall back to the raw segment.
  }
  return text
    .replace(/\.[a-z0-9]{1,5}$/i, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .slice(0, 60)
    .trim()
}

export interface HeroZone {
  /** Top and bottom of the zone as fractions of the frame height. */
  from: number
  to: number
  label: string
  note: string
}

/**
 * Elevation zones of the hero engine, top to bottom. EngineHero's camera is
 * fixed and its field of view is vertical, so the model always fills the same
 * band of the frame's height whatever the frame's width: fractions of the
 * height stay aligned with the model at every size.
 */
export const HERO_ZONES: readonly HeroZone[] = [
  { from: 0.12, to: 0.3, label: 'Cylinder head', note: 'Camshafts, valves, spark plug' },
  { from: 0.3, to: 0.52, label: 'Cylinder', note: 'Piston, rings, wrist pin' },
  { from: 0.52, to: 0.77, label: 'Crankcase', note: 'Rod, crankshaft, flywheel' },
]
