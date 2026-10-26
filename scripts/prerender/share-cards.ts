/**
 * Share images (1200×630, the Open Graph size): what each indexable page's card
 * says, and the page the cards are drawn on. Pure; og-images.ts renders them
 * with Playwright.
 */
import type { Category, Topic } from '../../src/lib/schemas'
import { ogImageFile } from './html'
import { categoryPath, labPath, topicPath, type LabMeta, type PrerenderRoute } from './routes'

export interface ShareCard {
  /** Output file under public/, e.g. "og/topics/four-stroke-cycle.png". */
  file: string
  eyebrow: string
  title: string
  text: string
  chips: string[]
}

const LEVEL: Record<Topic['difficulty'], string> = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' }
const EYEBROW: Record<string, string> = {
  '/': 'Interactive automotive lessons',
  '/learn': 'Every lesson',
  '/labs': 'Interactive 3D labs',
  '/explore': 'Explore the car',
  '/map': 'System map',
  '/pioneers': 'History of the car',
  '/glossary': 'Glossary',
  '/about': 'About',
}
const withoutSiteName = (title: string) => title.replace(/\s+·\s+AutoVerse$/, '')

/** One card per indexable route, plus og/default.png (the home card) for pages without their own. */
export function shareCards(routes: PrerenderRoute[], content: { categories: Category[]; topics: Topic[]; labs: LabMeta[] }): ShareCard[] {
  const { categories, topics, labs } = content
  const topicAt = new Map(topics.map((t) => [topicPath(t), t]))
  const categoryAt = new Map(categories.map((c) => [categoryPath(c), c]))
  const labAt = new Map(labs.map((l) => [labPath(l), l]))
  const cards: ShareCard[] = []
  for (const r of routes) {
    if (r.noindex) continue
    const file = ogImageFile(r.path)
    const topic = topicAt.get(r.path)
    const category = categoryAt.get(r.path)
    const lab = labAt.get(r.path)
    if (topic) {
      const home = categories.find((c) => c.id === topic.categoryId)
      cards.push({
        file,
        eyebrow: home ? `${home.title} · Lesson` : 'Lesson',
        title: topic.title,
        text: topic.seo?.description ?? r.description,
        chips: [LEVEL[topic.difficulty], `${topic.estimatedDuration} min`, ...(topic.labId ? ['Interactive 3D lab'] : [])],
      })
    } else if (category) {
      const n = topics.filter((t) => t.categoryId === category.id).length
      cards.push({ file, eyebrow: 'Lessons by system', title: category.title, text: r.description, chips: [`${n} ${n === 1 ? 'lesson' : 'lessons'}`] })
    } else if (lab) {
      cards.push({ file, eyebrow: 'Interactive 3D lab', title: lab.title, text: lab.summary, chips: ['Runs in your browser'] })
    } else if (r.path === '/') {
      cards.push({
        file,
        eyebrow: EYEBROW['/']!,
        title: 'Learn how cars work, in interactive 3D',
        text: r.description,
        chips: [`${topics.length} lessons`, `${labs.length} 3D labs`, `${categories.length} vehicle systems`],
      })
    } else {
      cards.push({ file, eyebrow: EYEBROW[r.path] ?? '', title: withoutSiteName(r.title), text: r.description, chips: [] })
    }
  }
  const home = cards.find((c) => c.file === ogImageFile('/'))
  if (home) cards.push({ ...home, file: ogImageFile('default') })
  return cards
}

export interface CardFonts {
  /** Base64 woff2 data: Space Grotesk, Inter and JetBrains Mono (the app's own variable fonts). */
  display: string
  sans: string
  mono: string
}

/**
 * The page every card is drawn on. Words go in with `fill(card)` (defined in
 * the page, so no bundled code has to cross into the browser); it returns false
 * when the title or text runs past three lines and is cut short.
 */
export function cardDocument(fonts: CardFonts, logoSvg: string): string {
  const face = (family: string, data: string, weights: string) =>
    `@font-face{font-family:'${family}';src:url(data:font/woff2;base64,${data}) format('woff2');font-weight:${weights};font-display:block}`
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
${face('Space Grotesk', fonts.display, '300 700')}
${face('Inter', fonts.sans, '100 900')}
${face('JetBrains Mono', fonts.mono, '100 800')}
*{box-sizing:border-box;margin:0}
html,body{width:1200px;height:630px;overflow:hidden;background:#0b0c0f}
body{position:relative;font-family:'Inter',sans-serif;color:#f3efe6;-webkit-font-smoothing:antialiased}
.grid{position:absolute;inset:0;background-image:linear-gradient(rgba(56,215,242,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(56,215,242,.05) 1px,transparent 1px);background-size:48px 48px}
.motif{position:absolute;width:620px;height:620px;right:-200px;top:-40px}
.card{position:absolute;inset:0;padding:60px 72px 64px;display:flex;flex-direction:column}
.brand{display:flex;align-items:center;gap:16px;font-family:'Space Grotesk';font-weight:600;font-size:32px;letter-spacing:-.01em}
.brand svg{width:54px;height:54px}
.body{margin-top:auto;max-width:880px}
#eyebrow{display:flex;align-items:center;gap:14px;font-family:'JetBrains Mono';font-size:21px;font-weight:500;letter-spacing:.12em;text-transform:uppercase;color:#38d7f2}
#eyebrow::before{content:'';width:12px;height:12px;border-radius:3px;background:#f6a63a}
#eyebrow:empty{display:none}
#title{margin-top:18px;font-family:'Space Grotesk';font-weight:600;line-height:1.05;letter-spacing:-.025em;text-wrap:balance;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
#text{margin-top:22px;max-width:840px;font-size:27px;line-height:1.42;color:#b3bbc6;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
#chips{margin-top:32px;display:flex;flex-wrap:wrap;gap:12px}
#chips[hidden]{display:none}
#chips span{font-family:'JetBrains Mono';font-size:19px;color:#b3bbc6;border:1.5px solid #343a44;border-radius:999px;padding:7px 18px;background:#101216}
</style></head><body>
<div class="grid"></div>
<svg class="motif" viewBox="0 0 640 640" fill="none" stroke="#38d7f2" aria-hidden="true">
<circle cx="320" cy="320" r="300" stroke-opacity=".10" stroke-width="2"/>
<circle cx="320" cy="320" r="262" stroke-opacity=".16" stroke-width="12" stroke-dasharray="3 14"/>
<circle cx="320" cy="320" r="200" stroke-opacity=".14" stroke-width="2"/>
<circle cx="320" cy="320" r="120" stroke-opacity=".24" stroke-width="3"/>
<path d="M320 24v84M320 532v84M24 320h84M532 320h84" stroke-opacity=".2" stroke-width="3" stroke-linecap="round"/>
<circle cx="320" cy="320" r="40" fill="#f6a63a" fill-opacity=".9" stroke="none"/>
</svg>
<div class="card">
<div class="brand">${logoSvg.replace(/<\?xml[^>]*>/, '').trim()}AutoVerse</div>
<div class="body"><p id="eyebrow"></p><h1 id="title"></h1><p id="text"></p><div id="chips"></div></div>
</div>
<script>
function fill(card) {
  var title = document.getElementById('title'), text = document.getElementById('text'), chips = document.getElementById('chips');
  document.getElementById('eyebrow').textContent = card.eyebrow;
  title.textContent = card.title;
  var n = card.title.length;
  title.style.fontSize = (n <= 18 ? 88 : n <= 30 ? 76 : n <= 44 ? 64 : 56) + 'px';
  text.textContent = card.text;
  chips.replaceChildren.apply(chips, card.chips.map(function (c) { var s = document.createElement('span'); s.textContent = c; return s; }));
  chips.hidden = card.chips.length === 0;
  var lines = function (el) { return Math.round(el.scrollHeight / parseFloat(getComputedStyle(el).lineHeight)); };
  return lines(title) <= 3 && lines(text) <= 3;
}
</script>
</body></html>`
}
