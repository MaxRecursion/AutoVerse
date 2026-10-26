import { matchQuality, queryTokens, tokenize } from '@/lib/search'

/** A page or an action offered by the command menu (pure data, unit-tested). */
export interface Command {
  id: string
  label: string
  /** Other words people type for it. */
  keywords?: string
}

export interface PageCommand extends Command {
  href: string
}

/**
 * Every page with a route of its own. Lessons, labs, categories, parts and
 * engineers come from the search index; this covers the rest, so the menu
 * reaches the whole site from the keyboard.
 */
export const PAGES: readonly PageCommand[] = [
  { id: 'page:home', label: 'Home', href: '/', keywords: 'start front page' },
  { id: 'page:explore', label: 'Explore the car in 3D', href: '/explore', keywords: 'vehicle explorer whole car model systems' },
  { id: 'page:learn', label: 'All lessons', href: '/learn', keywords: 'learn topic index a to z categories courses' },
  { id: 'page:labs', label: 'All labs', href: '/labs', keywords: 'laboratories simulations interactive 3d' },
  { id: 'page:map', label: 'System map', href: '/map', keywords: 'how the systems connect power flow diagram' },
  { id: 'page:glossary', label: 'Glossary', href: '/glossary', keywords: 'terms definitions dictionary words' },
  { id: 'page:pioneers', label: 'Pioneers', href: '/pioneers', keywords: 'engineers history inventors stories people' },
  { id: 'page:progress', label: 'My progress', href: '/progress', keywords: 'bookmarks completed quiz scores certificates' },
  { id: 'page:about', label: 'Sources and credits', href: '/about', keywords: 'about licences licenses models attribution references' },
]

/**
 * Commands matching every meaningful word of the query (prefixes and one-letter
 * typos count, as in site search), best first. An empty query matches none.
 */
export function matchCommands<T extends Command>(commands: readonly T[], query: string): T[] {
  const tokens = queryTokens(query)
  if (!tokens.length) return []
  const scored: { command: T; score: number }[] = []
  for (const command of commands) {
    const terms = tokenize(`${command.label} ${command.keywords ?? ''}`)
    let score = 0
    for (const token of tokens) {
      const best = Math.max(0, ...terms.map((term) => matchQuality(token, term)))
      if (!best) {
        score = 0
        break
      }
      score += best
    }
    if (score) scored.push({ command, score })
  }
  return scored.sort((a, b) => b.score - a.score).map((s) => s.command)
}
