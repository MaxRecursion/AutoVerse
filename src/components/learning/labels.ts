import type { ContentStatus, Difficulty, Topic } from '@/lib/schemas'

export const DIFFICULTIES: readonly Difficulty[] = ['beginner', 'intermediate', 'advanced']

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
}

export const DIFFICULTY_RANK: Record<Difficulty, number> = { beginner: 1, intermediate: 2, advanced: 3 }

export const STATUS_LABEL: Record<ContentStatus, string> = {
  complete: 'Full lesson',
  draft: 'Draft',
  outline: 'Outline',
}

/** Licence name used for AutoVerse's own writing (see docs/ARCHITECTURE.md › Content rules). */
export const ORIGINAL_LICENCE_NAME = 'AutoVerse original content'

export const isDifficulty = (v: string | null | undefined): v is Difficulty => !!v && (DIFFICULTIES as readonly string[]).includes(v)

/** Learning order: easier first, then alphabetical. */
export function sortForLearning<T extends Pick<Topic, 'difficulty' | 'title'>>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => DIFFICULTY_RANK[a.difficulty] - DIFFICULTY_RANK[b.difficulty] || a.title.localeCompare(b.title))
}

export const topicHref = (t: Pick<Topic, 'slug'>) => `/topics/${t.slug}`

/** Split authored text into paragraphs on blank lines. */
export const paragraphs = (text: string) =>
  text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
