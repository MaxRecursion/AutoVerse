/**
 * Pure route model for static prerendering: which pages exist, and the
 * title / description / no-JavaScript fallback content for each. All text is
 * escaped here, so callers can drop `bodyHtml` straight into a document.
 */
import type { Category, Pioneer, Topic } from '../../src/lib/schemas'

export const SITE_NAME = 'AutoVerse'
export const HOME_TITLE = 'AutoVerse — Understand Every Moving Part'

export interface LabMeta {
  id: string
  title: string
  summary: string
}

export interface PrerenderRoute {
  /** URL path without trailing slash ("/" for home). */
  path: string
  /** Full document title. */
  title: string
  /** Meta / Open Graph description (plain text, ≤ 160 chars). */
  description: string
  ogType: 'website' | 'article'
  /** Escaped HTML shown inside <noscript>. */
  bodyHtml: string
  /** Sitemap priority hint, 0–1. */
  priority: number
}

export interface RouteInput {
  categories: Category[]
  topics: Topic[]
  labs: LabMeta[]
  pioneers?: Pioneer[]
}

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ENTITIES[c]!)

/** Collapse whitespace and cut at a word boundary, adding an ellipsis when shortened. */
export function truncate(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.–—-]+$/, '')}…`
}

const pageTitle = (title: string) => `${title} · ${SITE_NAME}`
const link = (href: string, text: string) => `<a href="${escapeHtml(href)}">${escapeHtml(text)}</a>`
const list = (items: string[]) => (items.length ? `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>` : '')
const paragraphs = (text: string) =>
  text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join('')

const JS_NOTE =
  '<p><em>AutoVerse’s interactive lessons, quizzes and 3D labs need JavaScript. This is a text-only summary of the page.</em></p>'
const NAV = `<nav aria-label="Site">${list([
  link('/', 'Home'),
  link('/learn', 'All topics'),
  link('/labs', 'Labs'),
  link('/pioneers', 'Pioneers'),
  link('/about', 'About & credits'),
])}</nav>`

const doc = (heading: string, body: string) => `<h1>${escapeHtml(heading)}</h1>${JS_NOTE}${body}${NAV}`

export const categoryPath = (c: Category) => `/learn/${c.slug}`
export const topicPath = (t: Topic) => `/topics/${t.slug}`
export const labPath = (l: LabMeta) => `/labs/${l.id}`

function topicItem(t: Topic): string {
  return `${link(topicPath(t), t.title)} — ${escapeHtml(t.summary)}`
}

const pioneerHtml = (p: Pioneer) =>
  `<h3>${escapeHtml(p.name)} (${escapeHtml(p.year)})</h3><p><strong>${escapeHtml(p.headline)}</strong></p><p>${escapeHtml(p.story)}</p>${
    p.caution ? `<p><em>Worth knowing:</em> ${escapeHtml(p.caution)}</p>` : ''
  }<p>Sources: ${p.sources.map((s) => link(s.url, `${s.publisher ? `${s.publisher}: ` : ''}${s.title}`)).join('; ')}</p>`

function topicRoute(t: Topic, category: Category | undefined, byId: Map<string, Topic>, people: Pioneer[] = []): PrerenderRoute {
  const related = [...new Set([...t.prerequisiteTopicIds, ...t.relatedTopicIds])]
    .map((id) => byId.get(id))
    .filter((x): x is Topic => Boolean(x))
  const status =
    t.contentStatus === 'outline' ? '<p>This lesson is an outline: only its summary and objectives are written so far.</p>' : ''
  const body = [
    category ? `<p>${link(categoryPath(category), category.title)}</p>` : '',
    `<p><strong>${escapeHtml(t.summary)}</strong></p>`,
    status,
    t.learningObjectives.length ? `<h2>Learning objectives</h2>${list(t.learningObjectives.map(escapeHtml))}` : '',
    `<h2>Overview</h2>${paragraphs(t.beginnerExplanation)}`,
    t.steps.length ? `<h2>Step by step</h2><ol>${t.steps.map((s) => `<li><strong>${escapeHtml(s.title)}.</strong> ${escapeHtml(s.beginner)}</li>`).join('')}</ol>` : '',
    related.length ? `<h2>Related topics</h2>${list(related.map((r) => link(topicPath(r), r.title)))}` : '',
    people.length ? `<h2>The story behind it</h2>${people.map(pioneerHtml).join('')}` : '',
  ].join('')
  return {
    path: topicPath(t),
    title: pageTitle(t.title),
    description: truncate(t.summary),
    ogType: 'article',
    bodyHtml: doc(t.title, body),
    priority: 0.8,
  }
}

/** Every prerendered route, in a stable order. */
export function buildRoutes({ categories, topics, labs, pioneers = [] }: RouteInput): PrerenderRoute[] {
  const sortedCategories = [...categories].sort((a, b) => a.order - b.order)
  const sortedTopics = [...topics].sort((a, b) => a.title.localeCompare(b.title))
  const topicsIn = (c: Category) => sortedTopics.filter((t) => t.categoryId === c.id)
  const categoryById = new Map(categories.map((c) => [c.id, c]))
  const topicById = new Map(topics.map((t) => [t.id, t]))
  const categoryItems = sortedCategories.map((c) => `${link(categoryPath(c), c.title)} — ${escapeHtml(c.summary)}`)
  const labItems = labs.map((l) => `${link(labPath(l), l.title)} — ${escapeHtml(l.summary)}`)

  const routes: PrerenderRoute[] = [
    {
      path: '/',
      title: HOME_TITLE,
      description: 'Interactive 3D automotive engineering lessons: engines, gearboxes, brakes, suspension and more.',
      ogType: 'website',
      bodyHtml: doc(
        'AutoVerse — understand every moving part',
        `<p>Original lessons, interactive 3D laboratories and quizzes that explain how cars work, from the four-stroke cycle to tyre grip.</p><h2>Learn by system</h2>${list(categoryItems)}<h2>Laboratories</h2>${list(labItems)}`,
      ),
      priority: 1,
    },
    {
      path: '/learn',
      title: pageTitle('All topics'),
      description: truncate(`Browse ${topics.length} original lessons across ${categories.length} vehicle systems, from basics to driving technique.`),
      ogType: 'website',
      bodyHtml: doc(
        'All topics',
        sortedCategories
          .map((c) => {
            const items = topicsIn(c).map(topicItem)
            return `<h2>${link(categoryPath(c), c.title)}</h2>${items.length ? list(items) : '<p>Lessons for this system are coming soon.</p>'}`
          })
          .join(''),
      ),
      priority: 0.9,
    },
    ...sortedCategories.map((c) => {
      const items = topicsIn(c).map(topicItem)
      return {
        path: categoryPath(c),
        title: pageTitle(c.title),
        description: truncate(c.summary),
        ogType: 'website' as const,
        bodyHtml: doc(c.title, `<p>${escapeHtml(c.summary)}</p>${items.length ? list(items) : '<p>Lessons for this system are coming soon.</p>'}`),
        priority: 0.7,
      }
    }),
    ...sortedTopics.map((t) =>
      topicRoute(
        t,
        categoryById.get(t.categoryId),
        topicById,
        pioneers.filter((p) => p.topicIds.includes(t.id)),
      ),
    ),
    {
      path: '/labs',
      title: pageTitle('Laboratories'),
      description: 'Interactive 3D laboratories: a four-stroke engine, a manual gearbox, disc brakes and suspension, each with synchronised explanations.',
      ogType: 'website',
      bodyHtml: doc('Laboratories', `<p>Each laboratory pairs an interactive 3D model with step-by-step explanations. Simulated values are illustrative.</p>${list(labItems)}`),
      priority: 0.8,
    },
    ...labs.map((l) => ({
      path: labPath(l),
      title: pageTitle(l.title),
      description: truncate(l.summary),
      ogType: 'website' as const,
      bodyHtml: doc(l.title, `<p>${escapeHtml(l.summary)}</p><p>This laboratory is an interactive 3D simulation and needs JavaScript and WebGL. Simulated values are illustrative.</p>`),
      priority: 0.7,
    })),
    {
      path: '/explore',
      title: pageTitle('Explore the car'),
      description: 'Explore vehicle components in 3D: select a part to see what it does and which lessons explain it.',
      ogType: 'website',
      bodyHtml: doc('Explore the car', `<p>An interactive 3D explorer for vehicle components. Browse the lessons instead:</p>${list(categoryItems)}`),
      priority: 0.6,
    },
    {
      path: '/map',
      title: pageTitle('System map'),
      description: 'See how engine, gearbox, driveline, brakes and suspension connect, and how power flows to the wheels in each drivetrain layout.',
      ogType: 'website',
      bodyHtml: doc('System map', `<p>An interactive map of how the car’s systems connect. Browse the lessons instead:</p>${list(categoryItems)}`),
      priority: 0.6,
    },
    {
      path: '/pioneers',
      title: pageTitle('The engineers behind the parts'),
      description: truncate(`${pioneers.length} engineers and the parts they shaped, from the Ackermann steering geometry to the radial tyre, each story retold from a cited source.`),
      ogType: 'website',
      bodyHtml: doc(
        'The engineers behind the parts',
        `<p>Every part in a car was somebody’s problem first. Each story below is retold in our own words from the sources it cites; where credit is disputed, it says so.</p>${[...pioneers]
          .sort((a, b) => a.sortYear - b.sortYear)
          .map(pioneerHtml)
          .join('')}`,
      ),
      priority: 0.6,
    },
    {
      path: '/progress',
      title: pageTitle('Your progress'),
      description: 'Track completed lessons and quiz scores. Progress is stored only in your browser.',
      ogType: 'website',
      bodyHtml: doc('Your progress', '<p>Your lesson progress and quiz scores are stored only in this browser and need JavaScript to display.</p>'),
      priority: 0.3,
    },
    {
      path: '/about',
      title: pageTitle('About, sources & credits'),
      description: 'What AutoVerse is, how its original content is written, how third-party sources are handled, and credits for 3D models.',
      ogType: 'website',
      bodyHtml: doc(
        'About AutoVerse',
        '<p>AutoVerse is an educational project that explains how cars work through original writing, interactive 3D laboratories and quizzes.</p>' +
          '<p>All lesson text is written independently for AutoVerse. Articles on other sites are linked only as further reading; their text and images are not copied.</p>' +
          '<p>Simulations are illustrative and simplified. Nothing here is professional repair advice: follow your vehicle’s handbook and consult a qualified technician.</p>',
      ),
      priority: 0.4,
    },
  ]
  return routes
}
