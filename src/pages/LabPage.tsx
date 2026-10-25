import { useEffect, useMemo } from 'react'
import { ArrowRight, BookOpen, Search, X } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useStore } from 'zustand'
import { Breadcrumbs } from '@/components/layout/Breadcrumbs'
import { topicHref } from '@/components/learning/labels'
import { useDocumentTitle } from '@/components/learning/useDocumentTitle'
import { Button } from '@/components/ui/button'
import { LabStatus } from '@/features/home/LabCard'
import { queryFromPath } from '@/features/home/homeData'
import { applyLabDeepLink, resolveLabDeepLink, type DeepLinkSources } from '@/features/home/labDeepLink'
import { labPath, primaryLesson, sortLabs } from '@/features/home/labOverview'
import { LabHost } from '@/features/labs/LabHost'
import { useLabInstance } from '@/features/labs/useLabInstance'
import { getLab, labs } from '@/features/labs/registry'
import type { LabDefinition } from '@/features/labs/types'
import { openSearch } from '@/features/search/events'
import { getComponent, getTopic, topics } from '@/lib/content'
import type { LabStore } from '@/lib/simulation/labStore'

const deepLinkSources: DeepLinkSources = { getComponent, topics }

/**
 * /labs/:labId — one laboratory, full-size, with a link to its lesson.
 * `?cue=<id>` seeks the timeline to a cue; `?component=<id>` selects and
 * highlights a part (without isolating it). Invalid values are ignored.
 */
export default function LabPage() {
  const { labId = '' } = useParams()
  const lab = getLab(labId)
  useDocumentTitle(lab ? lab.title : 'Lab not found')

  if (!lab) return <LabNotFound labId={labId} />
  // Keyed so moving between labs builds a fresh store for the new lab.
  return <LabScreen key={lab.id} lab={lab} />
}

function LabScreen({ lab }: { lab: LabDefinition }) {
  const store = useLabInstance(lab.id)
  const [params] = useSearchParams()
  const { cueId, componentId } = useMemo(() => resolveLabDeepLink(lab, params, deepLinkSources), [lab, params])

  // Re-applied whenever the query changes (e.g. following another deep link to the same lab).
  useEffect(() => {
    if (store) applyLabDeepLink(store, { cueId, componentId })
  }, [store, cueId, componentId])

  const lesson = primaryLesson(lab, { getTopic, topics })

  return (
    <div className="mx-auto max-w-[1600px] px-3 py-4 sm:px-4 lg:py-5">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Labs', to: '/labs' }, { label: lab.shortTitle }]} />
          <div className="-mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-xl font-semibold text-paper sm:text-2xl">{lab.title}</h1>
            <LabStatus status={lab.status} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {store && componentId && <LinkedPart store={store} componentId={componentId} />}
          {lesson && (
            <Button asChild variant="outline" size="sm" className="h-9">
              <Link to={topicHref(lesson)} title={lesson.title}>
                <BookOpen aria-hidden /> Read the lesson
              </Link>
            </Button>
          )}
        </div>
      </div>
      <LabHost labId={lab.id} store={store} variant="full" />
    </div>
  )
}

/** Shown while the part named in `?component` is still the selection, with a way to clear it. */
function LinkedPart({ store, componentId }: { store: LabStore; componentId: string }) {
  const selected = useStore(store, (s) => s.selectedId === componentId)
  if (!selected) return null
  const name = getComponent(componentId)?.name ?? componentId
  return (
    <p className="flex h-9 items-center gap-1 rounded-md border border-cyan/30 bg-cyan/[0.06] pl-3 text-sm text-paper" role="status">
      <span className="eyebrow mr-1 text-cyan">Selected</span>
      <span className="max-w-[14rem] truncate">{name}</span>
      <Button
        variant="ghost"
        size="icon"
        className="size-9 text-steel-300 hover:text-paper"
        aria-label={`Clear selection: ${name}`}
        onClick={() => store.getState().select(null)}
      >
        <X aria-hidden />
      </Button>
    </p>
  )
}

function LabNotFound({ labId }: { labId: string }) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:py-16">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Labs', to: '/labs' }, { label: 'Lab not found' }]} />
      <p className="eyebrow">404 · Lab</p>
      <h1 className="mt-2 text-3xl font-semibold text-paper sm:text-4xl">We couldn’t find that lab</h1>
      <p className="mt-3 max-w-2xl leading-relaxed text-steel-300">
        There is no laboratory at{' '}
        <code className="break-all rounded bg-graphite-800 px-1.5 py-0.5 font-mono text-sm text-paper">/labs/{labId}</code>. These are the
        labs that exist:
      </p>
      <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {sortLabs(labs).map((l) => (
          <li key={l.id} className="panel flex flex-col gap-1 p-4">
            <Link to={labPath(l)} className="inline-flex min-h-9 items-center gap-1.5 font-medium text-paper hover:text-cyan">
              {l.title}
              <ArrowRight aria-hidden className="size-4" />
            </Link>
            <p className="text-sm leading-relaxed text-steel-400">{l.summary}</p>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex flex-wrap gap-2">
        <Button asChild variant="outline" className="h-10">
          <Link to="/labs">All labs</Link>
        </Button>
        <Button variant="ghost" className="h-10" aria-haspopup="dialog" onClick={() => openSearch(queryFromPath(labId))}>
          <Search aria-hidden /> Search AutoVerse
        </Button>
      </div>
    </div>
  )
}
