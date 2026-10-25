import { useEffect, useState, type ReactNode } from 'react'
import { AlertTriangle, ChevronDown, ExternalLink, Loader2, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router'
import { useDocumentTitle } from '@/components/learning/useDocumentTitle'
import { Button } from '@/components/ui/button'
import { labs } from '@/features/labs/registry'
import { categories, sourceArticles, topics } from '@/lib/content'
import { ModelManifestSchema, type ModelManifest, type SourceArticle } from '@/lib/schemas'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------------ */
/* Data helpers                                                              */
/* ------------------------------------------------------------------------ */

type ImportStatus = SourceArticle['importStatus']

const STATUS_LABELS: Record<ImportStatus, { label: string; detail: string }> = {
  'metadata-only': { label: 'Linked only', detail: 'Title and link recorded; no text reused' },
  imported: { label: 'Imported under licence', detail: 'Explicit permission on file' },
  failed: { label: 'Not accessible', detail: 'The page could not be retrieved' },
  'blocked-by-robots': { label: 'Excluded by robots.txt', detail: 'Never requested' },
  skipped: { label: 'Skipped', detail: 'Out of scope' },
}
const STATUS_ORDER: ImportStatus[] = ['metadata-only', 'imported', 'failed', 'blocked-by-robots', 'skipped']

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Only http(s) URLs are rendered as links; anything else is shown as text. */
const safeHttpUrl = (value: string | null | undefined): string | null => {
  if (!value) return null
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null
  } catch {
    return null
  }
}

const formatDate = (iso: string | undefined) => {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function summariseSources(list: readonly SourceArticle[]) {
  const counts = new Map<ImportStatus, number>()
  for (const a of list) counts.set(a.importStatus, (counts.get(a.importStatus) ?? 0) + 1)
  const hosts = [...new Set(list.map((a) => hostOf(a.url)))].sort()
  const latest = list.reduce<string | undefined>((max, a) => (a.retrievedAt && (!max || a.retrievedAt > max) ? a.retrievedAt : max), undefined)
  const groups = categories
    .map((c) => ({
      id: c.id,
      title: c.title,
      articles: list.filter((a) => a.mappedCategoryId === c.id).sort((a, b) => a.title.localeCompare(b.title)),
    }))
    .filter((g) => g.articles.length > 0)
  const unmapped = list.filter((a) => !a.mappedCategoryId || !categories.some((c) => c.id === a.mappedCategoryId))
  if (unmapped.length) groups.push({ id: 'other', title: 'Other', articles: unmapped })
  return { counts, hosts, latest, groups }
}

type ManifestAsset = ModelManifest['assets'][number]
type ManifestState =
  | { status: 'loading' }
  | { status: 'ready'; assets: ManifestAsset[] }
  | { status: 'error'; message: string }

/** Load /models/manifest.json at runtime and keep only assets cleared for use. */
function useModelCredits(attempt: number): ManifestState {
  const [state, setState] = useState<ManifestState>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    const url = `${import.meta.env.BASE_URL}models/manifest.json`
    fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } })
      .then(async (res) => {
        if (res.status === 404) return { version: 0, generatedAt: '', assets: [] }
        if (!res.ok) throw new Error(`The model manifest returned HTTP ${res.status}.`)
        return res.json() as Promise<unknown>
      })
      .then((json) => {
        const parsed = ModelManifestSchema.safeParse(json)
        if (!parsed.success) throw new Error('The model manifest is not in the expected format.')
        setState({ status: 'ready', assets: parsed.data.assets.filter((a) => a.status === 'ready') })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setState({ status: 'error', message: error instanceof Error ? error.message : 'The model manifest could not be loaded.' })
      })
    return () => controller.abort()
  }, [attempt])

  return state
}

/* ------------------------------------------------------------------------ */
/* Small presentational pieces                                               */
/* ------------------------------------------------------------------------ */

function ExternalAnchor({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn('inline-flex items-center gap-1.5 text-cyan underline-offset-4 hover:underline focus-visible:underline', className)}
    >
      {children}
      <ExternalLink aria-hidden className="size-3.5 shrink-0" />
      <span className="sr-only">(external site, opens in a new tab)</span>
    </a>
  )
}

function Section({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-24 border-t border-white/[0.06] pt-10">
      <p className="eyebrow">{eyebrow}</p>
      <h2 id={`${id}-heading`} className="mt-2 font-display text-2xl font-semibold text-paper">
        {title}
      </h2>
      <div className="mt-4 flex flex-col gap-4 leading-relaxed text-steel-300">{children}</div>
    </section>
  )
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="panel flex flex-col gap-1 p-4">
      {/* Term (label) first in the DOM so screen readers announce "label: value"; CSS shows the value on top. */}
      <dt className="order-2 text-xs leading-snug text-steel-400">{label}</dt>
      <dd className="order-1 font-mono text-2xl text-paper">{value}</dd>
    </div>
  )
}

/* ------------------------------------------------------------------------ */
/* Page                                                                      */
/* ------------------------------------------------------------------------ */

const SECTIONS = [
  { id: 'originality', label: 'Original content' },
  { id: 'sources', label: 'Sources' },
  { id: 'credits', label: '3D model credits' },
  { id: 'disclaimers', label: 'Disclaimers' },
]

/** /about — what AutoVerse is, originality, source discovery status, model credits and disclaimers. */
export default function AboutPage() {
  useDocumentTitle('About, sources & credits')
  const [attempt, setAttempt] = useState(0)
  const credits = useModelCredits(attempt)
  const sources = summariseSources(sourceArticles)
  const completeLessons = topics.filter((t) => t.contentStatus === 'complete').length
  const discoveredOn = formatDate(sources.latest)
  const importedCount = sources.counts.get('imported') ?? 0

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:py-12">
      <header className="max-w-3xl">
        <p className="eyebrow">About</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-paper sm:text-4xl">How AutoVerse is made</h1>
        <p className="mt-3 text-lg leading-relaxed text-steel-300">
          AutoVerse explains how cars work through original lessons, interactive 3D laboratories and short quizzes. Every lesson has a
          beginner and a technical explanation, and the labs let you scrub, pause and step through mechanisms that are normally hidden
          inside metal.
        </p>
      </header>

      <dl className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="AutoVerse at a glance">
        <Stat value={topics.length} label={`lessons (${completeLessons} complete)`} />
        <Stat value={categories.length} label="vehicle systems" />
        <Stat value={labs.length} label="3D laboratories" />
        <Stat value={sourceArticles.length} label="external articles catalogued" />
      </dl>

      <nav aria-label="On this page" className="mt-8">
        <ul className="flex flex-wrap gap-2">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="inline-flex min-h-10 items-center rounded-full border border-white/[0.08] px-4 text-sm text-steel-300 hover:border-cyan/40 hover:text-cyan"
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-10 flex flex-col gap-12">
        <Section id="originality" eyebrow="Originality" title="Original content">
          <p>
            Every lesson, explanation, diagram description, quiz question and simulation in AutoVerse is written or built for this project
            from general engineering knowledge. Lessons carry the licence “AutoVerse original content”.
          </p>
          <p>
            AutoVerse does not copy text or images from other websites. Where another site covers a topic well, the lesson links to it as
            further reading — clearly marked as external — and only when our discovery tooling confirmed that the page exists.
          </p>
          <p className="flex items-start gap-2 text-sm text-steel-400">
            <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-ok" />
            Your progress and preferences are stored only in this browser. AutoVerse has no accounts and sends no lesson data anywhere.
          </p>
        </Section>

        <Section id="sources" eyebrow="Content discovery" title="Sources and reuse">
          {sourceArticles.length === 0 ? (
            <p>No external sources have been catalogued yet.</p>
          ) : (
            <>
              <p>
                To plan lesson coverage and suggest further reading, a small offline tool catalogued the public article index of{' '}
                {sources.hosts.join(', ')}
                {discoveredOn ? `, most recently on ${discoveredOn}` : ''}. It honoured robots.txt, identified itself, waited between requests
                and stopped after a fixed number of requests. It recorded titles, links and categories only.
              </p>
              {importedCount === 0 ? (
                <p>
                  No licence permitting reuse was found, so every article is <strong className="text-paper">linked only</strong>. Full text
                  would be imported only for pages covered by explicit written permission or an open licence, and none currently are.
                </p>
              ) : (
                <p>
                  {importedCount} article{importedCount === 1 ? ' is' : 's are'} reused under explicit written permission or an open licence,
                  credited as that permission requires. Every other article is <strong className="text-paper">linked only</strong>.
                </p>
              )}

              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Catalogued articles by status">
                {STATUS_ORDER.map((status) => (
                  <div key={status} className="rounded-lg border border-white/[0.06] p-3">
                    <dt className="text-sm text-paper">{STATUS_LABELS[status].label}</dt>
                    <dd className="mt-1 font-mono text-xl text-paper">{sources.counts.get(status) ?? 0}</dd>
                    <dd className="text-xs text-steel-500">{STATUS_LABELS[status].detail}</dd>
                  </div>
                ))}
              </dl>

              <div>
                <h3 className="text-base font-semibold text-paper">Catalogued articles by AutoVerse category</h3>
                <p className="mt-1 text-sm text-steel-400">
                  These are links to another website. They are not part of AutoVerse and open in a new tab.
                </p>
                <ul className="mt-3 flex flex-col gap-2">
                  {sources.groups.map((g) => (
                    <li key={g.id}>
                      <details className="group panel overflow-hidden">
                        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-paper hover:text-cyan focus-visible:outline-2 focus-visible:outline-cyan [&::-webkit-details-marker]:hidden">
                          <span>{g.title}</span>
                          <span className="flex items-center gap-2">
                            <span className="font-mono text-xs text-steel-400">{g.articles.length}</span>
                            <ChevronDown aria-hidden className="size-4 text-steel-400 transition-transform group-open:rotate-180" />
                          </span>
                        </summary>
                        <ul className="border-t border-white/[0.06] px-4 py-2">
                          {g.articles.map((a) => (
                            <li key={a.url} className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-white/[0.04] py-2 last:border-0">
                              <ExternalAnchor href={a.url} className="min-h-9 text-sm">
                                {a.title}
                              </ExternalAnchor>
                              <span className="text-xs text-steel-500">
                                {hostOf(a.url)} · {STATUS_LABELS[a.importStatus].label}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </Section>

        <Section id="credits" eyebrow="Credits" title="3D model credits">
          <p>
            Most 3D scenes are built procedurally in AutoVerse’s own code. Third-party models are used only when their licence allows it,
            and are credited here exactly as recorded in the model manifest.
          </p>
          <ModelCredits state={credits} onRetry={() => setAttempt((n) => n + 1)} />
        </Section>

        <Section id="disclaimers" eyebrow="Please note" title="Disclaimers">
          <ul className="flex list-disc flex-col gap-3 pl-5 marker:text-steel-500">
            <li>
              Simulations are <strong className="text-paper">illustrative</strong>. Speeds, pressures, forces and timings in the labs are
              simplified to show how mechanisms behave; they are not measured data for any particular vehicle.
            </li>
            <li>
              AutoVerse is for learning, <strong className="text-paper">not professional repair advice</strong>. Follow your vehicle
              handbook and the manufacturer’s procedures, and use a qualified technician for safety-critical work such as brakes, steering,
              airbags, fuel systems and high-voltage components.
            </li>
            <li>Never work under a vehicle supported only by a jack, and never open a hot, pressurised cooling system.</li>
            <li>AutoVerse is not affiliated with the websites it links to, and is not responsible for their content.</li>
          </ul>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button asChild className="h-10">
              <Link to="/learn">Browse the lessons</Link>
            </Button>
            <Button asChild variant="outline" className="h-10">
              <Link to="/labs">Open a laboratory</Link>
            </Button>
          </div>
        </Section>
      </div>
    </div>
  )
}

function ModelCredits({ state, onRetry }: { state: ManifestState; onRetry: () => void }) {
  if (state.status === 'loading') {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-steel-400">
        <Loader2 aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
        Loading model credits…
      </p>
    )
  }
  if (state.status === 'error') {
    return (
      <div role="alert" className="panel flex flex-col items-start gap-3 p-4">
        <p className="flex items-start gap-2 text-sm text-steel-300">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-amber" />
          Model credits could not be loaded. {state.message}
        </p>
        <Button variant="outline" className="h-10" onClick={onRetry}>
          Try again
        </Button>
      </div>
    )
  }
  if (state.assets.length === 0) {
    return <p className="text-sm text-steel-400">No third-party 3D models are in use at the moment, so there is nothing to credit.</p>
  }
  return (
    <ul className="flex flex-col gap-3">
      {state.assets.map((asset) => {
        const licenceUrl = safeHttpUrl(asset.license.url)
        const sourceUrl = safeHttpUrl(asset.source.modelPageUrl)
        return (
          <li key={asset.id} className="panel p-4">
            <h3 className="font-medium text-paper">{asset.name}</h3>
            <dl className="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[8rem_minmax(0,1fr)]">
              <dt className="annotation text-steel-400">Author</dt>
              <dd className="text-steel-300">{asset.author ?? 'Not stated in the manifest'}</dd>
              <dt className="annotation text-steel-400">Licence</dt>
              <dd className="text-steel-300">
                {licenceUrl ? <ExternalAnchor href={licenceUrl}>{asset.license.name}</ExternalAnchor> : asset.license.name}
              </dd>
              {asset.license.attributionText && (
                <>
                  <dt className="annotation text-steel-400">Attribution</dt>
                  <dd className="break-words text-steel-300">{asset.license.attributionText}</dd>
                </>
              )}
              <dt className="annotation text-steel-400">Source</dt>
              <dd className="min-w-0 text-steel-300">
                {sourceUrl ? (
                  <ExternalAnchor href={sourceUrl} className="break-all">
                    {asset.source.site}
                  </ExternalAnchor>
                ) : (
                  asset.source.site
                )}
              </dd>
            </dl>
          </li>
        )
      })}
    </ul>
  )
}
