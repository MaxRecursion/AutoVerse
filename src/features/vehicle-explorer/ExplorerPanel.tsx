import { useEffect, useRef, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, ArrowRight, BookOpen, ChevronRight, FlaskConical, Network } from 'lucide-react'
import { useLab, useLabStoreApi } from '@/components/three/LabContext'
import { LevelToggle } from '@/components/learning/LevelToggle'
import { topicHref } from '@/components/learning/labels'
import { getLab } from '@/features/labs/registry'
import { getComponent, getTopic } from '@/lib/content'
import type { Topic } from '@/lib/schemas'
import { cn } from '@/lib/utils'
import { usePreferences } from '@/stores/preferences'
import { chooseComponent, chooseSystem, visibleComponents } from './explorerActions'
import { readView } from './explorerConfig'
import { EXPLORER_SYSTEMS, getExplorerSystem, type ExplorerSystem, type ExplorerSystemId } from './explorerSystems'
import { CARCONCEPT_EXPLORER_CHANGES, LINKS, MODEL_CREDIT } from './modelCredits'

export const EXPLORER_DISCLAIMER =
  'Parts added to the model (gearbox, suspension, steering, brake hydraulics, electrics, cooling, exhaust, fuel tank) are simplified original models placed where a front-engine, front-wheel-drive car typically carries them. Positions and sizes are approximate and illustrative, not data for any real vehicle.'

const topicsOf = (ids: readonly string[]): Topic[] => ids.map(getTopic).filter((t): t is Topic => !!t)

/** Panel focus moves only for choices made in the panel (never for clicks in the 3D scene). */
type FocusRequest = { kind: 'system' } | { kind: 'list'; systemId: ExplorerSystemId } | null

export function ExplorerPanel({ className, compact = false }: { className?: string; compact?: boolean }) {
  const system = useLab((s) => readView(s.params).system)
  const focusRequest = useRef<FocusRequest>(null)
  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
        {system ? (
          <SystemDetail system={getExplorerSystem(system)} focusRequest={focusRequest} compact={compact} />
        ) : (
          <Overview focusRequest={focusRequest} compact={compact} />
        )}
      </div>
      <Credits compact={compact} />
    </div>
  )
}

/* ------------------------------------------------------------------------ */

function Overview({ focusRequest, compact }: { focusRequest: React.RefObject<FocusRequest>; compact: boolean }) {
  const store = useLabStoreApi()
  const buttons = useRef(new Map<ExplorerSystemId, HTMLButtonElement>())
  useEffect(() => {
    const req = focusRequest.current
    if (req?.kind === 'list') {
      buttons.current.get(req.systemId)?.focus()
      focusRequest.current = null
    }
  }, [focusRequest])
  return (
    <section aria-labelledby="explorer-overview-title">
      <p className="eyebrow">Vehicle explorer</p>
      <h2 id="explorer-overview-title" className="mt-1 font-display text-xl font-semibold text-paper">
        The whole car
      </h2>
      {!compact && (
        <p className="mt-2 text-sm leading-relaxed text-steel-300">
          Choose a system to light up every part of it, frame it in 3D and read what it does. Select individual parts in the scene or from the
          list.
        </p>
      )}
      <ul className="mt-3 grid gap-1.5" aria-label="Vehicle systems">
        {EXPLORER_SYSTEMS.map((sys) => (
          <li key={sys.id}>
            <button
              type="button"
              ref={(el) => {
                if (el) buttons.current.set(sys.id, el)
                else buttons.current.delete(sys.id)
              }}
              onClick={() => {
                focusRequest.current = { kind: 'system' }
                chooseSystem(store, sys.id)
              }}
              onPointerEnter={() => store.getState().hover(null)}
              className="group flex min-h-11 w-full items-center gap-3 rounded-lg border border-white/[0.06] bg-graphite-900/50 px-3 py-2 text-left transition-colors hover:border-cyan/40 hover:bg-cyan/[0.05] focus-visible:outline-2 focus-visible:outline-cyan"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-paper">{sys.name}</span>
                {!compact && <span className="mt-0.5 line-clamp-1 block text-xs text-steel-400">{sys.location}</span>}
              </span>
              <span className="font-mono text-[10px] text-steel-500 tabular-nums">{sys.componentIds.length}</span>
              <ChevronRight aria-hidden className="size-4 shrink-0 text-steel-500 group-hover:text-cyan" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/* ------------------------------------------------------------------------ */

function SystemDetail({
  system,
  focusRequest,
  compact,
}: {
  system: ExplorerSystem
  focusRequest: React.RefObject<FocusRequest>
  compact: boolean
}) {
  const store = useLabStoreApi()
  const heading = useRef<HTMLHeadingElement>(null)
  const level = usePreferences((p) => p.level)
  const model = useLab((s) => readView(s.params).model)
  const selectedId = useLab((s) => s.selectedId)
  const parts = visibleComponents(system.id, model)
  const lessons = topicsOf(system.topicIds)
  const lab = system.labId ? getLab(system.labId) : undefined

  useEffect(() => {
    if (focusRequest.current?.kind === 'system') {
      heading.current?.focus()
      focusRequest.current = null
    }
  }, [system.id, focusRequest])

  return (
    <section aria-labelledby="explorer-system-title">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            focusRequest.current = { kind: 'list', systemId: system.id }
            chooseSystem(store, null)
          }}
          className="-ml-2 inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-xs text-steel-300 hover:bg-white/5 hover:text-paper focus-visible:outline-2 focus-visible:outline-cyan"
        >
          <ArrowLeft aria-hidden className="size-3.5" />
          All systems
        </button>
        <LevelToggle compact />
      </div>
      <p className="eyebrow mt-3 text-cyan">System</p>
      <h2 ref={heading} tabIndex={-1} id="explorer-system-title" className="mt-1 font-display text-xl font-semibold text-paper outline-none">
        {system.name}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-steel-300">{system.summary}</p>
      {level === 'technical' && <p className="mt-2 text-sm leading-relaxed text-steel-300">{system.technical}</p>}
      {!compact && (
        <p className="mt-3 rounded-md border border-white/[0.06] bg-graphite-900/50 px-3 py-2 text-xs leading-relaxed text-steel-400">
          <span className="annotation mr-1 text-steel-300">In this car</span>
          {system.location}
        </p>
      )}

      <h3 className="eyebrow mt-5">Parts ({parts.length})</h3>
      <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={`${system.name} parts`}>
        {parts.map((id) => {
          const c = getComponent(id)
          const active = selectedId === id
          return (
            <li key={id}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => chooseComponent(store, active ? null : id)}
                onPointerEnter={() => store.getState().hover(id)}
                onPointerLeave={() => store.getState().hoveredId === id && store.getState().hover(null)}
                onFocus={() => store.getState().hover(id)}
                onBlur={() => store.getState().hoveredId === id && store.getState().hover(null)}
                className={cn(
                  'min-h-9 rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors focus-visible:outline-2 focus-visible:outline-cyan',
                  active ? 'border-cyan/60 bg-cyan/15 text-cyan' : 'border-white/10 text-steel-300 hover:border-cyan/40 hover:text-paper',
                )}
              >
                {c?.name ?? id}
              </button>
            </li>
          )
        })}
      </ul>

      {selectedId && parts.includes(selectedId) && <ComponentCard id={selectedId} />}

      <h3 className="eyebrow mt-5">Learn more</h3>
      <ul className="mt-2 grid gap-1.5">
        {lessons.map((t, i) => (
          <LinkRow key={t.id} to={topicHref(t)} icon={<BookOpen aria-hidden className="size-4" />} meta={i === 0 ? 'Lesson' : 'Related lesson'}>
            {t.title}
          </LinkRow>
        ))}
        {lab && (
          <LinkRow to={`/labs/${lab.id}`} icon={<FlaskConical aria-hidden className="size-4" />} meta="3D lab">
            {lab.title}
          </LinkRow>
        )}
        <LinkRow to="/map" icon={<Network aria-hidden className="size-4" />} meta="Overview">
          How the systems connect
        </LinkRow>
      </ul>
    </section>
  )
}

function LinkRow({ to, icon, meta, children }: { to: string; icon: ReactNode; meta: string; children: ReactNode }) {
  return (
    <li>
      <Link
        to={to}
        className="group flex min-h-11 items-center gap-3 rounded-lg border border-white/[0.06] px-3 py-2 text-sm text-steel-300 transition-colors hover:border-cyan/40 hover:text-paper focus-visible:outline-2 focus-visible:outline-cyan"
      >
        <span className="text-steel-400 group-hover:text-cyan">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="annotation block text-steel-500">{meta}</span>
          <span className="block truncate">{children}</span>
        </span>
        <ArrowRight aria-hidden className="size-4 shrink-0 text-steel-500 group-hover:text-cyan" />
      </Link>
    </li>
  )
}

function ComponentCard({ id }: { id: string }) {
  const level = usePreferences((p) => p.level)
  const c = getComponent(id)
  if (!c) return null
  const related = topicsOf(c.relatedTopicIds)
  return (
    <div className="mt-3 rounded-lg border border-cyan/30 bg-cyan/[0.06] p-3" data-testid="explorer-selected-component">
      <p className="eyebrow text-cyan">Selected part</p>
      <h3 className="mt-1 text-base font-semibold text-paper">{c.name}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-steel-300">{level === 'technical' && c.technical ? c.technical : c.description}</p>
      {c.annotations.length > 0 && (
        <dl className="mt-2 grid gap-1">
          {c.annotations.map((a) => (
            <div key={a.label} className="flex gap-2 text-xs">
              <dt className="annotation shrink-0 text-steel-400">{a.label}</dt>
              <dd className="text-steel-300">{a.text}</dd>
            </div>
          ))}
        </dl>
      )}
      {related.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {related.map((t) => (
            <Link
              key={t.id}
              to={topicHref(t)}
              className="inline-flex min-h-9 items-center rounded border border-white/10 px-2 text-xs text-steel-300 hover:border-cyan/50 hover:text-cyan"
            >
              {t.title} →
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------------ */

/** Short form of the disclaimer for the phone sheet (the full text is one tap away). */
export const EXPLORER_DISCLAIMER_SHORT = 'Added parts are simplified, illustrative models — not data for any real car.'

function Credits({ compact }: { compact: boolean }) {
  const model = useLab((s) => readView(s.params).model)
  const credit = MODEL_CREDIT[model]
  return (
    <footer className="max-h-[55%] shrink-0 overflow-y-auto overscroll-contain border-t border-white/[0.06] px-4 py-2 text-[11px] leading-snug text-steel-400">
      <p>{compact ? EXPLORER_DISCLAIMER_SHORT : EXPLORER_DISCLAIMER}</p>
      <details>
        <summary className="inline-flex min-h-9 cursor-pointer items-center text-steel-300 hover:text-paper">
          {compact ? 'Model credit and notes' : `3D model credit: ${credit.title}`}
        </summary>
        {compact && <p className="mb-1">{EXPLORER_DISCLAIMER}</p>}
        {model === 'carconcept' ? (
          <p className="mt-1" data-testid="model-attribution">
            “Car Concept” © 2024 Darmstadt Graphics Group GmbH, artist Eric Chadwick, licensed{' '}
            <a href={LINKS.ccBy} className="underline hover:text-cyan" rel="license noreferrer" target="_blank">
              CC BY 4.0
            </a>
            , from KhronosGroup{' '}
            <a href={LINKS.carConcept} className="underline hover:text-cyan" rel="noreferrer" target="_blank">
              glTF-Sample-Assets
            </a>
            ; derived from “FREE Concept Car 004 - public domain (CC0)” by Unity Fan. Modified for AutoVerse: Khronos and 3D Commerce logo
            textures removed, geometry simplified and meshopt-compressed, textures converted to WebP. {CARCONCEPT_EXPLORER_CHANGES}
          </p>
        ) : (
          <p className="mt-1" data-testid="model-attribution">
            {credit.text}
          </p>
        )}
      </details>
    </footer>
  )
}
