import type { ReactNode } from 'react'
import { ArrowRight, BookOpen, Compass, FlaskConical } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { topicHref } from '@/components/learning/labels'
import { useDocumentTitle } from '@/components/learning/useDocumentTitle'
import { queryFromPath } from '@/features/home/homeData'
import { SearchEntry } from '@/features/home/HomeSearch'
import { labPath, sortLabs } from '@/features/home/labOverview'
import { labs } from '@/features/labs/registry'
import { getTopic } from '@/lib/content'
import type { Topic } from '@/lib/schemas'

const START_POINTS = [
  { to: '/', label: 'Home' },
  { to: '/explore', label: 'Explore the car' },
  { to: '/map', label: 'System map' },
  { to: '/learn', label: 'All lessons' },
  { to: '/labs', label: 'All labs' },
] as const

const POPULAR_LESSONS = ['how-a-car-works', 'four-stroke-cycle', 'torque-and-power', 'differential', 'brake-hydraulics', 'tyres-and-grip']

const popularLessons = POPULAR_LESSONS.map(getTopic).filter((t): t is Topic => !!t)

/** Any unmatched route: what went wrong, a pre-filled search, and popular ways back in. */
export default function NotFoundPage() {
  useDocumentTitle('Page not found')
  const { pathname } = useLocation()
  const query = queryFromPath(pathname)

  return (
    <div className="relative isolate overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-blueprint [mask-image:radial-gradient(ellipse_70%_60%_at_30%_20%,black_20%,transparent_75%)]"
      />
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:py-20">
        <p className="eyebrow flex items-center gap-2">
          <span aria-hidden className="h-px w-5 bg-cyan" />
          Error 404
        </p>
        <h1 className="mt-3 text-4xl font-semibold text-paper sm:text-5xl">Page not found</h1>
        <p className="mt-4 max-w-2xl leading-relaxed text-steel-300">
          Nothing is mounted at{' '}
          <code className="break-all rounded bg-graphite-800 px-1.5 py-0.5 font-mono text-sm text-paper">{pathname}</code>. The link may be
          mistyped, or the page may have moved. Search for it, or pick up from one of the pages below.
        </p>

        <SearchEntry
          className="mt-8 max-w-2xl"
          query={query || undefined}
          placeholder={query ? `Search for “${query}”` : 'Search lessons, labs and parts…'}
          suggestions={[]}
        />

        <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
          <LinkGroup icon={<Compass aria-hidden className="size-4 text-cyan" />} title="Start points">
            {START_POINTS.map((p) => (
              <NavItem key={p.to} to={p.to} label={p.label} />
            ))}
          </LinkGroup>
          {popularLessons.length > 0 && (
            <LinkGroup icon={<BookOpen aria-hidden className="size-4 text-cyan" />} title="Popular lessons">
              {popularLessons.map((t) => (
                <NavItem key={t.id} to={topicHref(t)} label={t.title} />
              ))}
            </LinkGroup>
          )}
          {labs.length > 0 && (
            <LinkGroup icon={<FlaskConical aria-hidden className="size-4 text-cyan" />} title="Laboratories">
              {sortLabs(labs).map((l) => (
                <NavItem key={l.id} to={labPath(l)} label={l.title} />
              ))}
            </LinkGroup>
          )}
        </div>
      </div>
    </div>
  )
}

function LinkGroup({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  const id = `nf-${title.toLowerCase().replace(/\s+/g, '-')}`
  return (
    <nav aria-labelledby={id}>
      <h2 id={id} className="eyebrow mb-2 flex items-center gap-2">
        {icon}
        {title}
      </h2>
      <ul className="flex flex-col divide-y divide-white/[0.05] border-y border-white/[0.06]">{children}</ul>
    </nav>
  )
}

function NavItem({ to, label }: { to: string; label: string }) {
  return (
    <li>
      <Link to={to} className="group flex min-h-11 pointer-coarse:min-h-12 items-center justify-between gap-3 py-2 text-sm text-steel-300 transition-colors hover:text-paper">
        {label}
        <ArrowRight aria-hidden className="size-3.5 shrink-0 text-steel-500 transition-colors group-hover:text-cyan" />
      </Link>
    </li>
  )
}
