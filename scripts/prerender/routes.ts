/**
 * Pure route model for static prerendering: which pages exist, their search
 * title and description, share image, structured data (JSON-LD) and a
 * no-JavaScript fallback for the few pages that are not statically rendered.
 * All HTML text is escaped here, so callers can drop `bodyHtml` straight into
 * a document.
 */
import { buildGlossary } from '../../src/lib/glossary'
import type { Category, Pioneer, Topic } from '../../src/lib/schemas'

export const SITE_NAME = 'AutoVerse'
export const HOME_TITLE = 'AutoVerse — Learn How Cars Work in Interactive 3D'
export const HOME_DESCRIPTION =
  'Free interactive lessons on how cars work: engines, gearboxes, brakes, suspension and more, with live 3D labs, quizzes and the engineers behind each part.'
export const LANGUAGE = 'en-GB'

export interface LabMeta {
  id: string
  title: string
  summary: string
}

export interface RouteImage {
  /** Path from the site root, e.g. "/og/topics/four-stroke-cycle.png". */
  path: string
  alt: string
  width: number
  height: number
}

export interface PrerenderRoute {
  /** URL path without trailing slash ("/" for home). */
  path: string
  /** Full document title. */
  title: string
  /** Meta / Open Graph description (plain text, ≤ 160 chars). */
  description: string
  ogType: 'website' | 'article'
  /** Escaped HTML shown inside <noscript> when the page is not statically rendered. */
  bodyHtml: string
  /** Sitemap priority hint, 0–1. */
  priority: number
  /** Render the real page at build time (default true). Personal pages opt out. */
  ssr?: boolean
  /** Keep out of search results and the sitemap. */
  noindex?: boolean
  image?: RouteImage
  /** Page-specific JSON-LD nodes; merged with the site-wide nodes into one @graph. */
  jsonLd?: object[]
  /** ISO dates (content history) for article metadata and the sitemap. */
  published?: string
  modified?: string
  section?: string
  /** Markdown twin for AI agents, path from the site root. */
  markdownPath?: string
}

export interface ContentDates {
  published?: string
  modified?: string
}

export interface RouteInput {
  categories: Category[]
  topics: Topic[]
  labs: LabMeta[]
  pioneers?: Pioneer[]
  /** Absolute site URL used for structured-data ids (no trailing slash needed). */
  siteUrl?: string
  /** Content history for a topic id (or "site" for pages without their own file). */
  dates?: (key: string) => ContentDates | undefined
  /** Share image for a route path, when one has been generated. */
  imageFor?: (path: string) => string | undefined
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
  link('/glossary', 'Glossary'),
  link('/about', 'About & credits'),
])}</nav>`

const doc = (heading: string, body: string) => `<h1>${escapeHtml(heading)}</h1>${JS_NOTE}${body}${NAV}`

export const categoryPath = (c: Category) => `/learn/${c.slug}`
export const topicPath = (t: Topic) => `/topics/${t.slug}`
export const labPath = (l: LabMeta) => `/labs/${l.id}`
export const topicMarkdownPath = (t: Topic) => `${topicPath(t)}.md`

const LEVEL: Record<Topic['difficulty'], string> = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' }

/* ------------------------------------------------------------------ JSON-LD */

const join = (siteUrl: string, path: string) => `${siteUrl.replace(/\/+$/, '')}${path === '/' ? '/' : path}`
export const organizationId = (siteUrl: string) => `${join(siteUrl, '/')}#organization`
export const websiteId = (siteUrl: string) => `${join(siteUrl, '/')}#website`

/** Organisation and website nodes, referenced by every page. */
export function buildSiteJsonLd(siteUrl: string, logoPath = '/icons/autoverse-512.png'): object[] {
  return [
    {
      '@type': 'Organization',
      '@id': organizationId(siteUrl),
      name: SITE_NAME,
      url: join(siteUrl, '/'),
      description: 'AutoVerse is a free, interactive guide to how cars work, written from the surface down with live 3D laboratories.',
      logo: { '@type': 'ImageObject', url: join(siteUrl, logoPath), width: 512, height: 512 },
      // Credited in the footer of every page, so the markup names the same person.
      founder: { '@type': 'Person', name: 'Akshay Kulkarni', url: 'https://maxrecursion.dev' },
    },
    {
      '@type': 'WebSite',
      '@id': websiteId(siteUrl),
      name: SITE_NAME,
      url: join(siteUrl, '/'),
      description: HOME_DESCRIPTION,
      inLanguage: LANGUAGE,
      publisher: { '@id': organizationId(siteUrl) },
    },
  ]
}

interface Crumb {
  name: string
  path: string
}

function breadcrumbNode(siteUrl: string, url: string, crumbs: Crumb[]) {
  return {
    '@type': 'BreadcrumbList',
    '@id': `${url}#breadcrumb`,
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: join(siteUrl, c.path) })),
  }
}

function webPageNode(
  siteUrl: string,
  route: Pick<PrerenderRoute, 'path' | 'title' | 'description' | 'published' | 'modified'>,
  options: { type?: string; imageUrl?: string; crumbs?: Crumb[]; mainEntity?: string; about?: object[] } = {},
) {
  const url = join(siteUrl, route.path)
  return {
    '@type': options.type ?? 'WebPage',
    '@id': `${url}#webpage`,
    url,
    name: route.title,
    description: route.description,
    inLanguage: LANGUAGE,
    isPartOf: { '@id': websiteId(siteUrl) },
    ...(options.crumbs ? { breadcrumb: { '@id': `${url}#breadcrumb` } } : {}),
    ...(options.imageUrl ? { primaryImageOfPage: { '@type': 'ImageObject', url: options.imageUrl } } : {}),
    ...(options.mainEntity ? { mainEntity: { '@id': options.mainEntity } } : {}),
    ...(options.about ? { about: options.about } : {}),
    ...(route.published ? { datePublished: route.published } : {}),
    ...(route.modified ? { dateModified: route.modified } : {}),
  }
}

/** A Wikipedia page is used as `sameAs` for a person only when it is that person's own article. */
function personSameAs(p: Pioneer): string[] {
  const key = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '')
  return p.sources
    .filter((s) => /wikipedia\.org\/wiki\//.test(s.url))
    .filter((s) => {
      const title = decodeURIComponent(s.url.split('/wiki/')[1] ?? '').replace(/_/g, ' ')
      return key(title) === key(p.name)
    })
    .map((s) => s.url)
}

/* ------------------------------------------------------------------ routes */

function topicItem(t: Topic): string {
  return `${link(topicPath(t), t.title)} — ${escapeHtml(t.summary)}`
}

/** Every prerendered route, in a stable order. */
export function buildRoutes({ categories, topics, labs, pioneers = [], siteUrl = 'https://autoverse.invalid', dates = () => undefined, imageFor = () => undefined }: RouteInput): PrerenderRoute[] {
  const sortedCategories = [...categories].sort((a, b) => a.order - b.order)
  const sortedTopics = [...topics].sort((a, b) => a.title.localeCompare(b.title))
  const topicsIn = (c: Category) => sortedTopics.filter((t) => t.categoryId === c.id)
  const categoryById = new Map(categories.map((c) => [c.id, c]))
  const topicById = new Map(topics.map((t) => [t.id, t]))
  const categoryItems = sortedCategories.map((c) => `${link(categoryPath(c), c.title)} — ${escapeHtml(c.summary)}`)
  const labItems = labs.map((l) => `${link(labPath(l), l.title)} — ${escapeHtml(l.summary)}`)
  const url = (path: string) => join(siteUrl, path)
  const siteDates = dates('site') ?? {}
  const newest = (list: Topic[]) => list.map((t) => dates(t.id)?.modified).filter((d): d is string => !!d).sort().at(-1) ?? siteDates.modified

  const pioneerHtml = (p: Pioneer) =>
    `<h3>${escapeHtml(p.name)} (${escapeHtml(p.year)})</h3><p><strong>${escapeHtml(p.headline)}</strong></p><p>${escapeHtml(p.story)}</p>${
      p.caution ? `<p><em>Worth knowing:</em> ${escapeHtml(p.caution)}</p>` : ''
    }<p>Sources: ${p.sources.map((s) => link(s.url, `${s.publisher ? `${s.publisher}: ` : ''}${s.title}`)).join('; ')}</p>`

  const image = (path: string, alt: string): RouteImage | undefined => {
    const found = imageFor(path) ?? imageFor('default')
    return found ? { path: found, alt, width: 1200, height: 630 } : undefined
  }
  const finish = (route: PrerenderRoute, build: (imageUrl: string | undefined) => object[]): PrerenderRoute => {
    const imageUrl = route.image ? url(route.image.path) : undefined
    return { ...route, jsonLd: route.noindex ? [] : build(imageUrl) }
  }

  const home = finish(
    {
      path: '/',
      title: HOME_TITLE,
      description: HOME_DESCRIPTION,
      ogType: 'website',
      bodyHtml: doc(
        'AutoVerse — understand every moving part',
        `<p>Original lessons, interactive 3D laboratories and quizzes that explain how cars work, from the four-stroke cycle to tyre grip.</p><h2>Learn by system</h2>${list(categoryItems)}<h2>Laboratories</h2>${list(labItems)}`,
      ),
      priority: 1,
      image: image('/', 'AutoVerse — learn how cars work in interactive 3D'),
      modified: newest(sortedTopics),
    },
    (imageUrl) => [
      webPageNode(siteUrl, { path: '/', title: HOME_TITLE, description: HOME_DESCRIPTION, modified: newest(sortedTopics) }, {
        imageUrl,
        about: [{ '@type': 'Thing', name: 'Automotive engineering', sameAs: 'https://en.wikipedia.org/wiki/Automotive_engineering' }],
      }),
    ],
  )

  const learnTitle = pageTitle('How Cars Work: Every Lesson by System')
  const learnDescription = truncate(
    `Browse ${topics.length} free lessons on how cars work, from engines, fuel and cooling to gearboxes, brakes, suspension, tyres and electrics.`,
  )
  const learn = finish(
    {
      path: '/learn',
      title: learnTitle,
      description: learnDescription,
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
      image: image('/learn', 'Every AutoVerse lesson, by vehicle system'),
      modified: newest(sortedTopics),
    },
    (imageUrl) => {
      const crumbs = [
        { name: 'Home', path: '/' },
        { name: 'Learn', path: '/learn' },
      ]
      return [
        webPageNode(siteUrl, { path: '/learn', title: learnTitle, description: learnDescription, modified: newest(sortedTopics) }, { type: 'CollectionPage', imageUrl, crumbs, mainEntity: `${url('/learn')}#systems` }),
        breadcrumbNode(siteUrl, url('/learn'), crumbs),
        {
          '@type': 'ItemList',
          '@id': `${url('/learn')}#systems`,
          name: 'Vehicle systems',
          itemListElement: sortedCategories.map((c, i) => ({ '@type': 'ListItem', position: i + 1, url: url(categoryPath(c)), name: c.title })),
        },
      ]
    },
  )

  const categoryRoutes = sortedCategories.map((c) => {
    const inCategory = topicsIn(c)
    const title = pageTitle(`${c.title}: How It Works, Explained`)
    const description = truncate(`${c.summary} ${inCategory.length} free lessons, surface to engineering detail.`)
    const modified = newest(inCategory)
    return finish(
      {
        path: categoryPath(c),
        title,
        description,
        ogType: 'website',
        bodyHtml: doc(c.title, `<p>${escapeHtml(c.summary)}</p>${inCategory.length ? list(inCategory.map(topicItem)) : '<p>Lessons for this system are coming soon.</p>'}`),
        priority: 0.7,
        image: image(categoryPath(c), `${c.title} — AutoVerse lessons`),
        modified,
      },
      (imageUrl) => {
        const crumbs = [
          { name: 'Home', path: '/' },
          { name: 'Learn', path: '/learn' },
          { name: c.title, path: categoryPath(c) },
        ]
        const pageUrl = url(categoryPath(c))
        return [
          webPageNode(siteUrl, { path: categoryPath(c), title, description, modified }, { type: 'CollectionPage', imageUrl, crumbs, mainEntity: `${pageUrl}#lessons` }),
          breadcrumbNode(siteUrl, pageUrl, crumbs),
          {
            '@type': 'ItemList',
            '@id': `${pageUrl}#lessons`,
            name: `${c.title} lessons`,
            itemListElement: inCategory.map((t, i) => ({ '@type': 'ListItem', position: i + 1, url: url(topicPath(t)), name: t.title })),
          },
        ]
      },
    )
  })

  const topicRoutes = sortedTopics.map((t) => {
    const category = categoryById.get(t.categoryId)
    const related = [...new Set([...t.prerequisiteTopicIds, ...t.relatedTopicIds])]
      .map((id) => topicById.get(id))
      .filter((x): x is Topic => Boolean(x))
    const people = pioneers.filter((p) => p.topicIds.includes(t.id))
    const lab = t.labId ? labs.find((l) => l.id === t.labId) : undefined
    const title = pageTitle(t.seo?.title ?? t.title)
    const description = t.seo?.description ?? truncate(t.summary, 155)
    const { published, modified } = dates(t.id) ?? siteDates
    const status = t.contentStatus === 'outline' ? '<p>This lesson is an outline: only its summary and objectives are written so far.</p>' : ''
    const body = [
      category ? `<p>${link(categoryPath(category), category.title)}</p>` : '',
      `<p><strong>${escapeHtml(t.summary)}</strong></p>`,
      status,
      t.learningObjectives.length ? `<h2>Learning objectives</h2>${list(t.learningObjectives.map(escapeHtml))}` : '',
      `<h2>Overview</h2>${paragraphs(t.beginnerExplanation)}`,
      t.steps.length ? `<h2>Step by step</h2><ol>${t.steps.map((s) => `<li><strong>${escapeHtml(s.title)}.</strong> ${escapeHtml(s.beginner)}</li>`).join('')}</ol>` : '',
      related.length ? `<h2>Related topics</h2>${list(related.map((r) => link(topicPath(r), r.title)))}` : '',
      people.length ? `<h2>The story behind it</h2>${people.map((p) => pioneerHtml(p)).join('')}` : '',
    ].join('')

    return finish(
      {
        path: topicPath(t),
        title,
        description,
        ogType: 'article',
        bodyHtml: doc(t.title, body),
        priority: 0.8,
        image: image(topicPath(t), `${t.title} — AutoVerse lesson`),
        published,
        modified,
        section: category?.title,
        markdownPath: topicMarkdownPath(t),
      },
      (imageUrl) => {
        const pageUrl = url(topicPath(t))
        const crumbs = [
          { name: 'Home', path: '/' },
          { name: 'Learn', path: '/learn' },
          ...(category ? [{ name: category.title, path: categoryPath(category) }] : []),
          { name: t.title, path: topicPath(t) },
        ]
        const nodes: object[] = [
          webPageNode(siteUrl, { path: topicPath(t), title, description, published, modified }, { imageUrl, crumbs, mainEntity: `${pageUrl}#lesson` }),
          breadcrumbNode(siteUrl, pageUrl, crumbs),
          {
            '@type': ['TechArticle', 'LearningResource'],
            '@id': `${pageUrl}#lesson`,
            headline: t.title,
            name: t.title,
            description: t.summary,
            url: pageUrl,
            mainEntityOfPage: { '@id': `${pageUrl}#webpage` },
            author: { '@id': organizationId(siteUrl) },
            publisher: { '@id': organizationId(siteUrl) },
            inLanguage: LANGUAGE,
            isAccessibleForFree: true,
            isPartOf: { '@id': websiteId(siteUrl) },
            ...(imageUrl ? { image: imageUrl } : {}),
            ...(published ? { datePublished: published } : {}),
            ...(modified ? { dateModified: modified } : {}),
            ...(category ? { articleSection: category.title } : {}),
            ...(t.tags.length ? { keywords: t.tags.join(', ') } : {}),
            educationalLevel: LEVEL[t.difficulty],
            learningResourceType: 'Lesson',
            interactivityType: lab ? 'mixed' : 'expositive',
            timeRequired: `PT${t.estimatedDuration}M`,
            ...(t.learningObjectives.length ? { teaches: t.learningObjectives } : {}),
            ...(t.about.length ? { about: t.about.map((a) => ({ '@type': 'Thing', name: a.name, sameAs: a.sameAs })) } : {}),
            ...(people.length ? { mentions: people.map((p) => ({ '@type': 'Person', name: p.name, url: `${url('/pioneers')}#pioneer-${p.id}` })) } : {}),
            ...(t.sourceReferences.length ? { citation: t.sourceReferences.map((s) => s.url) } : {}),
            ...(lab
              ? {
                  hasPart: {
                    '@type': 'LearningResource',
                    name: lab.title,
                    url: url(labPath(lab)),
                    learningResourceType: 'Simulation',
                    interactivityType: 'active',
                    isAccessibleForFree: true,
                  },
                }
              : {}),
          },
        ]
        if (t.faq.length) {
          nodes.push({
            '@type': 'FAQPage',
            '@id': `${pageUrl}#faq`,
            isPartOf: { '@id': `${pageUrl}#webpage` },
            mainEntity: t.faq.map((q) => ({ '@type': 'Question', name: q.question, acceptedAnswer: { '@type': 'Answer', text: q.answer } })),
          })
        }
        return nodes
      },
    )
  })

  const labsTitle = pageTitle('Interactive 3D Car Labs: Engine, Gearbox, Brakes')
  const labsDescription =
    'Run a four-stroke engine, a manual gearbox, disc brakes and a suspension corner in your browser: play, slow down, explode and select every part.'
  const labsIndex = finish(
    {
      path: '/labs',
      title: labsTitle,
      description: labsDescription,
      ogType: 'website',
      bodyHtml: doc('Laboratories', `<p>Each laboratory pairs an interactive 3D model with step-by-step explanations. Simulated values are illustrative.</p>${list(labItems)}`),
      priority: 0.8,
      image: image('/labs', 'AutoVerse interactive 3D laboratories'),
      modified: siteDates.modified,
    },
    (imageUrl) => {
      const crumbs = [
        { name: 'Home', path: '/' },
        { name: 'Labs', path: '/labs' },
      ]
      return [
        webPageNode(siteUrl, { path: '/labs', title: labsTitle, description: labsDescription, modified: siteDates.modified }, { type: 'CollectionPage', imageUrl, crumbs, mainEntity: `${url('/labs')}#labs` }),
        breadcrumbNode(siteUrl, url('/labs'), crumbs),
        {
          '@type': 'ItemList',
          '@id': `${url('/labs')}#labs`,
          name: 'Interactive laboratories',
          itemListElement: labs.map((l, i) => ({ '@type': 'ListItem', position: i + 1, url: url(labPath(l)), name: l.title })),
        },
      ]
    },
  )

  const labRoutes = labs.map((l) => {
    const lesson = topics.find((t) => t.labId === l.id)
    const title = pageTitle(`${l.title} (Interactive 3D)`)
    const description = truncate(`${l.summary} Free, in your browser.`)
    return finish(
      {
        path: labPath(l),
        title,
        description,
        ogType: 'website',
        bodyHtml: doc(l.title, `<p>${escapeHtml(l.summary)}</p><p>This laboratory is an interactive 3D simulation and needs JavaScript and WebGL. Simulated values are illustrative.</p>`),
        priority: 0.7,
        image: image(labPath(l), `${l.title} — interactive 3D model`),
        modified: lesson ? dates(lesson.id)?.modified : siteDates.modified,
      },
      (imageUrl) => {
        const pageUrl = url(labPath(l))
        const crumbs = [
          { name: 'Home', path: '/' },
          { name: 'Labs', path: '/labs' },
          { name: l.title, path: labPath(l) },
        ]
        return [
          webPageNode(siteUrl, { path: labPath(l), title, description }, { imageUrl, crumbs, mainEntity: `${pageUrl}#lab` }),
          breadcrumbNode(siteUrl, pageUrl, crumbs),
          {
            '@type': 'LearningResource',
            '@id': `${pageUrl}#lab`,
            name: l.title,
            description: l.summary,
            url: pageUrl,
            learningResourceType: 'Simulation',
            interactivityType: 'active',
            isAccessibleForFree: true,
            inLanguage: LANGUAGE,
            publisher: { '@id': organizationId(siteUrl) },
            ...(imageUrl ? { image: imageUrl } : {}),
            ...(lesson ? { isRelatedTo: { '@type': 'LearningResource', name: lesson.title, url: url(topicPath(lesson)) } } : {}),
          },
        ]
      },
    )
  })

  const simplePage = (
    path: string,
    heading: string,
    title: string,
    description: string,
    bodyHtml: string,
    priority: number,
    extra: { type?: string; extraNodes?: (pageUrl: string, imageUrl?: string) => object[]; mainEntity?: string } = {},
  ) =>
    finish({ path, title, description, ogType: 'website', bodyHtml: doc(heading, bodyHtml), priority, image: image(path, title), modified: siteDates.modified }, (imageUrl) => {
      const crumbs = [
        { name: 'Home', path: '/' },
        { name: heading, path },
      ]
      const pageUrl = url(path)
      return [
        webPageNode(siteUrl, { path, title, description, modified: siteDates.modified }, { type: extra.type, imageUrl, crumbs, mainEntity: extra.mainEntity ? `${pageUrl}${extra.mainEntity}` : undefined }),
        breadcrumbNode(siteUrl, pageUrl, crumbs),
        ...(extra.extraNodes?.(pageUrl, imageUrl) ?? []),
      ]
    })

  const glossary = buildGlossary(topics)
  const sortedPioneers = [...pioneers].sort((a, b) => a.sortYear - b.sortYear)

  return [
    home,
    learn,
    ...categoryRoutes,
    ...topicRoutes,
    labsIndex,
    ...labRoutes,
    simplePage(
      '/explore',
      'Explore the car',
      pageTitle('Explore a Car in 3D: Every System, Labelled'),
      'Explore a car in 3D: light up the engine, gearbox, brakes, suspension, steering and electrics, see where each part sits and open the lesson that explains it.',
      `<p>An interactive 3D explorer for vehicle components. Browse the lessons instead:</p>${list(categoryItems)}`,
      0.6,
    ),
    simplePage(
      '/map',
      'System map',
      pageTitle('How Car Systems Connect: Engine to Wheels'),
      'See how the engine, clutch, gearbox, driveshafts, differential and wheels connect, and how front-, rear- and all-wheel-drive layouts change the power path.',
      `<p>An interactive map of how the car’s systems connect. Browse the lessons instead:</p>${list(categoryItems)}`,
      0.6,
    ),
    simplePage(
      '/pioneers',
      'Pioneers',
      pageTitle('Who Invented Car Parts? The Engineers Behind Them'),
      truncate(
        `${pioneers.length} engineers behind the car's parts, from Ackermann steering to the radial tyre, Otto's engine to ABS: each story retold from a cited source.`,
      ),
      `<p>Every part in a car was somebody’s problem first. Each story below is retold in our own words from the sources it cites; where credit is disputed, it says so.</p>${sortedPioneers.map(pioneerHtml).join('')}`,
      0.6,
      {
        type: 'CollectionPage',
        mainEntity: '#people',
        extraNodes: (pageUrl) => [
          {
            '@type': 'ItemList',
            '@id': `${pageUrl}#people`,
            name: 'Engineers and inventors behind car parts',
            itemListElement: sortedPioneers.map((p, i) => {
              const sameAs = personSameAs(p)
              return {
                '@type': 'ListItem',
                position: i + 1,
                item: {
                  '@type': 'Person',
                  '@id': `${pageUrl}#pioneer-${p.id}`,
                  name: p.name,
                  description: `${p.role}. ${p.headline}`,
                  url: `${pageUrl}#pioneer-${p.id}`,
                  knowsAbout: p.topicIds.map((id) => topicById.get(id)?.title).filter((x): x is string => !!x),
                  ...(sameAs.length ? { sameAs } : {}),
                },
              }
            }),
          },
        ],
      },
    ),
    simplePage(
      '/glossary',
      'Glossary',
      pageTitle('Car Glossary: Automotive Terms Explained'),
      truncate(`Plain-language definitions of ${glossary.length} automotive terms, from compression ratio and torque to slip angle and regenerative braking, each linked to its lesson.`),
      `<p>Definitions of the key terms used across AutoVerse lessons.</p><dl>${glossary
        .map((e) => `<dt id="term-${e.slug}">${escapeHtml(e.term)}</dt><dd>${escapeHtml(e.definition)} ${e.topics.map((t) => link(`/topics/${t.slug}`, t.title)).join(', ')}</dd>`)
        .join('')}</dl>`,
      0.7,
      {
        mainEntity: '#terms',
        extraNodes: (pageUrl) => [
          {
            '@type': 'DefinedTermSet',
            '@id': `${pageUrl}#terms`,
            name: 'AutoVerse automotive glossary',
            hasDefinedTerm: glossary.map((e) => ({
              '@type': 'DefinedTerm',
              '@id': `${pageUrl}#term-${e.slug}`,
              name: e.term,
              description: e.definition,
              url: `${pageUrl}#term-${e.slug}`,
              inDefinedTermSet: { '@id': `${pageUrl}#terms` },
            })),
          },
        ],
      },
    ),
    simplePage(
      '/about',
      'About',
      pageTitle('About AutoVerse: Sources, Methods and Credits'),
      'What AutoVerse is, how its original lessons are written and checked, how third-party sources are handled, and credits for the 3D models it uses.',
      '<p>AutoVerse is an educational project that explains how cars work through original writing, interactive 3D laboratories and quizzes.</p>' +
        '<p>All lesson text is written independently for AutoVerse. Articles on other sites are linked only as further reading; their text and images are not copied.</p>' +
        '<p>Simulations are illustrative and simplified. Nothing here is professional repair advice: follow your vehicle’s handbook and consult a qualified technician.</p>',
      0.4,
      { type: 'AboutPage' },
    ),
    {
      path: '/progress',
      title: pageTitle('Your progress'),
      description: 'Track completed lessons and quiz scores. Progress is stored only in your browser.',
      ogType: 'website',
      bodyHtml: doc('Your progress', '<p>Your lesson progress and quiz scores are stored only in this browser and need JavaScript to display.</p>'),
      priority: 0.1,
      ssr: false,
      noindex: true,
      jsonLd: [],
    },
  ]
}
