import { categories, pioneers, sceneComponents, topics } from '@/lib/content'
import { buildSearchIndex, search, type SearchIndex, type SearchOptions, type SearchResult } from '@/lib/search'
import { labs } from '@/features/labs/registry'

let cached: SearchIndex | null = null

/** The site-wide index over bundled content + the labs registry. Built lazily on first use, then memoised. */
export function getSiteSearchIndex(): SearchIndex {
  cached ??= buildSearchIndex({
    topics,
    categories,
    components: sceneComponents,
    pioneers,
    labs: labs.map(({ id, title, shortTitle, summary, systemId, topicId }) => ({ id, title, shortTitle, summary, systemId, topicId })),
  })
  return cached
}

export function searchSite(query: string, opts?: SearchOptions): SearchResult[] {
  return search(getSiteSearchIndex(), query, opts)
}
