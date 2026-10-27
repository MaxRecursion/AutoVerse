/**
 * Plain-Markdown versions of the content for AI agents and tools: one file per
 * lesson (linked from the page with rel="alternate"), an `llms.txt` index and
 * an `llms-full.txt` with every lesson. Pure string builders.
 */
import type { Category, Pioneer, Topic } from '../../src/lib/schemas'
import { categoryPath, labPath, topicMarkdownPath, topicPath, type LabMeta } from './routes'

const join = (siteUrl: string, path: string) => `${siteUrl.replace(/\/+$/, '')}${path === '/' ? '/' : path}`
const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim()
const LEVEL: Record<Topic['difficulty'], string> = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' }

export interface MarkdownContext {
  siteUrl: string
  categories: Category[]
  topics: Topic[]
  labs: LabMeta[]
  pioneers: Pioneer[]
}

export function topicMarkdown(t: Topic, ctx: MarkdownContext): string {
  const url = (path: string) => join(ctx.siteUrl, path)
  const category = ctx.categories.find((c) => c.id === t.categoryId)
  const lab = t.labId ? ctx.labs.find((l) => l.id === t.labId) : undefined
  const byId = new Map(ctx.topics.map((x) => [x.id, x]))
  const related = [...new Set([...t.prerequisiteTopicIds, ...t.relatedTopicIds])].map((id) => byId.get(id)).filter((x): x is Topic => !!x)
  const people = ctx.pioneers.filter((p) => p.topicIds.includes(t.id))
  const out: string[] = []

  out.push(`# ${t.title}`, '', `> ${oneLine(t.summary)}`, '')
  out.push(
    `- Level: ${LEVEL[t.difficulty]} · about ${t.estimatedDuration} minutes${category ? ` · ${category.title}` : ''}`,
    `- Lesson page: ${url(topicPath(t))}`,
    ...(lab ? [`- Interactive 3D lab: ${url(labPath(lab))} (${oneLine(lab.summary)})`] : []),
    '',
  )
  if (t.learningObjectives.length) out.push('## What you will learn', '', ...t.learningObjectives.map((o) => `- ${o}`), '')
  out.push('## The idea, in plain language', '', t.beginnerExplanation.trim(), '')
  out.push('## The engineering explanation', '', t.technicalExplanation.trim(), '')
  if (t.steps.length) {
    out.push('## Step by step', '')
    t.steps.forEach((s, i) => out.push(`${i + 1}. **${s.title}.** ${oneLine(s.beginner)} *In engineering terms:* ${oneLine(s.technical)}`))
    out.push('')
  }
  if (t.keyConcepts.length) {
    out.push('## Key concepts', '', ...t.keyConcepts.map((k) => `- **${k.term}**: ${oneLine(k.definition)}${k.equation ? ` (\`${k.equation}\`)` : ''}`), '')
  }
  if (t.misconceptions.length) {
    out.push('## Common misconceptions', '', ...t.misconceptions.map((m) => `- **Myth:** ${oneLine(m.myth)} **Reality:** ${oneLine(m.reality)}`), '')
  }
  if (t.practicalExamples.length) out.push('## In the real world', '', ...t.practicalExamples.map((e) => `- ${oneLine(e)}`), '')
  if (t.faq.length) {
    out.push('## Common questions', '')
    for (const q of t.faq) out.push(`### ${q.question}`, '', oneLine(q.answer), '')
  }
  if (people.length) {
    out.push('## The story behind it', '')
    for (const p of people) {
      out.push(`### ${p.name} (${p.year})`, '', `${p.headline} ${oneLine(p.story)}`)
      if (p.caution) out.push('', `*Worth knowing:* ${oneLine(p.caution)}`)
      out.push('', `Sources: ${p.sources.map((s) => `[${s.publisher ? `${s.publisher}: ` : ''}${s.title}](${s.url})`).join('; ')}`, '')
    }
  }
  if (related.length) out.push('## Related lessons', '', ...related.map((r) => `- [${r.title}](${url(topicPath(r))})`), '')
  if (t.sourceReferences.length) out.push('## Further reading', '', ...t.sourceReferences.map((s) => `- [${s.title}](${s.url})${s.publisher ? ` — ${s.publisher}` : ''}`), '')
  out.push('---', '', `Original AutoVerse lesson (${t.licence.name}). Simulation values in AutoVerse labs are illustrative. Source page: ${url(topicPath(t))}`, '')
  return out.join('\n')
}

const INTRO =
  'Free, interactive lessons on how cars work — engines, fuel and ignition, cooling, transmissions, drivetrains, brakes, suspension and steering, tyres, electrics and more — taught from the surface down, with live 3D laboratories, quizzes and the engineers behind each part.'

/** The llms.txt index (https://llmstxt.org): what the site is and where its content lives, as Markdown links. */
export function buildLlmsTxt(ctx: MarkdownContext): string {
  const url = (path: string) => join(ctx.siteUrl, path)
  const out: string[] = ['# AutoVerse', '', `> ${INTRO}`, '']
  out.push('Made by [Akshay Kulkarni](https://maxrecursion.dev).', '')
  out.push(
    'Every lesson is original writing with a beginner explanation, an engineering explanation, steps, key concepts, common misconceptions and common questions. Each has a plain Markdown version (linked below). Values shown in the interactive labs are illustrative teaching values, not data for a specific vehicle.',
    '',
  )
  for (const c of [...ctx.categories].sort((a, b) => a.order - b.order)) {
    const list = ctx.topics.filter((t) => t.categoryId === c.id).sort((a, b) => a.title.localeCompare(b.title))
    if (!list.length) continue
    out.push(`## ${c.title}`, '', `${oneLine(c.summary)} Overview: ${url(categoryPath(c))}`, '')
    out.push(...list.map((t) => `- [${t.title}](${url(topicMarkdownPath(t))}): ${oneLine(t.seo?.description ?? t.summary)}`), '')
  }
  if (ctx.labs.length) out.push('## Interactive 3D labs', '', ...ctx.labs.map((l) => `- [${l.title}](${url(labPath(l))}): ${oneLine(l.summary)}`), '')
  out.push(
    '## Reference',
    '',
    `- [Glossary](${url('/glossary')}): plain-language definitions of automotive terms, each linked to its lesson.`,
    `- [Pioneers](${url('/pioneers')}): the engineers behind car parts and technologies, each story with its source.`,
    `- [System map](${url('/map')}): how the engine, transmission, driveline and wheels connect in front-, rear- and all-wheel-drive layouts.`,
    '',
    '## Optional',
    '',
    `- [Every lesson in one file](${url('/llms-full.txt')}): the full text of all lessons, in Markdown.`,
    `- [About AutoVerse](${url('/about')}): how lessons are written and sourced, and credits.`,
    '',
  )
  return out.join('\n')
}

/** Every lesson, concatenated, for agents that prefer a single document. */
export function buildLlmsFullTxt(ctx: MarkdownContext): string {
  const topics = [...ctx.topics].sort((a, b) => {
    const ca = ctx.categories.find((c) => c.id === a.categoryId)?.order ?? 99
    const cb = ctx.categories.find((c) => c.id === b.categoryId)?.order ?? 99
    return ca - cb || a.title.localeCompare(b.title)
  })
  return [`# AutoVerse — every lesson`, '', `> ${INTRO}`, '', `Index: ${join(ctx.siteUrl, '/llms.txt')}`, '', ...topics.map((t) => `\n${topicMarkdown(t, ctx)}`)].join('\n')
}

/** Crawlers named explicitly, so the intent is clear to search and AI operators. Everything else is allowed too. */
export const ALLOWED_CRAWLERS = [
  'Googlebot',
  'Google-Extended',
  'Bingbot',
  'Applebot',
  'Applebot-Extended',
  'DuckAssistBot',
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  'PerplexityBot',
  'Perplexity-User',
  'Amazonbot',
  'meta-externalagent',
  'MistralAI-User',
  'CCBot',
] as const

export function buildRobots(siteUrl: string, privatePaths: string[]): string {
  const disallow = privatePaths.map((p) => `Disallow: ${new URL(join(siteUrl, p)).pathname}`)
  const groups = [`User-agent: *\nAllow: /\n${disallow.join('\n')}`]
  for (const bot of ALLOWED_CRAWLERS) groups.push(`User-agent: ${bot}\nAllow: /\n${disallow.join('\n')}`)
  return `# AutoVerse welcomes search engines and AI assistants.\n# Lessons are also available as Markdown: ${join(siteUrl, '/llms.txt')}\n\n${groups.join('\n\n')}\n\nSitemap: ${join(siteUrl, '/sitemap.xml')}\n`
}
