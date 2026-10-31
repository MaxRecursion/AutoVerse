import { topics } from './content'
import { buildGlossary, glossarySlug, type GlossaryEntry } from './glossary'

/** The glossary built once from the bundled lessons: shared by the glossary page, flashcards and the progress page. */
export const glossary: readonly GlossaryEntry[] = buildGlossary(topics)
const bySlug = new Map(glossary.map((e) => [e.slug, e]))

/** The glossary entries for these key-concept terms (terms with no entry are skipped). */
export function glossaryEntriesFor(terms: readonly string[]): GlossaryEntry[] {
  const seen = new Set<string>()
  const out: GlossaryEntry[] = []
  for (const term of terms) {
    const entry = bySlug.get(glossarySlug(term))
    if (entry && !seen.has(entry.slug)) {
      seen.add(entry.slug)
      out.push(entry)
    }
  }
  return out
}
