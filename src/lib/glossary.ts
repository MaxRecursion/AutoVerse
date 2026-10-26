import type { Topic } from './schemas'

/**
 * The glossary is built from every lesson's key concepts: one entry per term
 * (case-insensitive), the first lesson's definition, and links to every lesson
 * that defines it. Pure — shared by the /glossary page and the static build.
 */

export interface GlossaryEntry {
  term: string
  /** Anchor-safe id ("compression-ratio"). */
  slug: string
  definition: string
  equation?: string
  topics: { id: string; slug: string; title: string }[]
}

export const glossarySlug = (term: string) =>
  term
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

export function buildGlossary(topics: readonly Topic[]): GlossaryEntry[] {
  const bySlug = new Map<string, GlossaryEntry>()
  const ordered = [...topics].sort((a, b) => a.title.localeCompare(b.title))
  for (const topic of ordered) {
    for (const concept of topic.keyConcepts) {
      const slug = glossarySlug(concept.term)
      if (!slug) continue
      const ref = { id: topic.id, slug: topic.slug, title: topic.title }
      const existing = bySlug.get(slug)
      if (existing) {
        if (!existing.topics.some((t) => t.id === topic.id)) existing.topics.push(ref)
        continue
      }
      bySlug.set(slug, { term: concept.term, slug, definition: concept.definition, equation: concept.equation, topics: [ref] })
    }
  }
  return [...bySlug.values()].sort((a, b) => a.term.localeCompare(b.term, 'en', { sensitivity: 'base' }))
}

/** Entries grouped under their initial letter ("#" for terms starting with a digit or symbol). */
export function groupByLetter(entries: readonly GlossaryEntry[]): { letter: string; entries: GlossaryEntry[] }[] {
  const groups = new Map<string, GlossaryEntry[]>()
  for (const e of entries) {
    const first = e.term.normalize('NFKD').charAt(0).toUpperCase()
    const letter = /[A-Z]/.test(first) ? first : '#'
    groups.set(letter, [...(groups.get(letter) ?? []), e])
  }
  return [...groups.entries()].sort(([a], [b]) => (a === '#' ? -1 : b === '#' ? 1 : a.localeCompare(b))).map(([letter, list]) => ({ letter, entries: list }))
}
