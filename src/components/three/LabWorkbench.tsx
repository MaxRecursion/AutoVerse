import { useState, type ReactNode } from 'react'
import { Boxes, Eye, EyeOff, Focus, History, PanelBottomClose, PanelBottomOpen, RotateCcw, Tag, View } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { LevelToggle } from '@/components/learning/LevelToggle'
import { getComponent, getPioneersForComponent, getTopic } from '@/lib/content'
import { cn } from '@/lib/utils'
import { usePreferences } from '@/stores/preferences'
import { LabMissions } from '@/features/labs/LabMissions'
import { AnimationControls } from './AnimationControls'
import { workbenchAside, workbenchGrid, workbenchScene } from './workbenchLayout'
import { useLab, useLabStoreApi } from './LabContext'

export interface LabWorkbenchProps {
  title: string
  /** The <SceneCanvas> for this lab. */
  scene: ReactNode
  /** Cue-synchronised explanation panel. */
  explanation: ReactNode
  /** Component ids listed in the Parts tab, in display order. */
  componentIds: string[]
  /** Lab-specific controls (gear selector, brake pedal, road input...). */
  controls?: ReactNode
  /** Live readouts overlaid on the scene (rpm, ratio, pressure...). */
  readouts?: ReactNode
  /** Extra side-panel tab, e.g. a 2D section diagram. */
  extraTab?: { id: string; label: string; content: ReactNode }
  /** Short honesty note shown under the scene ("conceptual visualisation"...). */
  disclaimer?: string
  variant?: 'full' | 'embedded'
}

/**
 * Shared layout for every engineering lab: big canvas with toolbar and
 * transport on the left, explanation / parts inspector on the right
 * (stacked on mobile).
 */
export function LabWorkbench({
  title,
  scene,
  explanation,
  componentIds,
  controls,
  readouts,
  extraTab,
  disclaimer,
  variant = 'full',
}: LabWorkbenchProps) {
  const timeline = useLab((s) => s.config.timeline)
  const cue = useLab((s) => s.cue)
  const cues = useLab((s) => s.config.cues)
  const cueLabel = cues.find((c) => c.id === cue)?.label
  // Phones: the readouts and lab controls can be tucked away so the scene is not mostly covered.
  const [panelsTucked, setPanelsTucked] = useState(false)
  const canTuck = !!(readouts || controls)
  const tuck = panelsTucked ? 'max-sm:hidden' : undefined

  return (
    <div className={workbenchGrid(variant)}>
      <section aria-label={`${title} 3D scene`} className={cn(workbenchScene(variant), 'isolate')}>
        {scene}
        {/* z-30: keep overlays above in-scene part labels (drei <Html>, z-index ≤ 20). */}
        <div className="pointer-events-none absolute inset-x-3 top-3 z-30 flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1.5">
            {cueLabel && (
              <span className="panel pointer-events-auto w-fit px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-amber" aria-live="polite" data-testid="cue-badge">
                {cueLabel}
              </span>
            )}
            {readouts && <div className={cn('pointer-events-auto', tuck)}>{readouts}</div>}
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <SceneToolbar />
            {canTuck && (
              <div className="panel pointer-events-auto p-1 sm:hidden">
                <ToolButton
                  label={panelsTucked ? 'Show readouts and controls' : 'Hide readouts and controls'}
                  active={panelsTucked}
                  onClick={() => setPanelsTucked((v) => !v)}
                >
                  {panelsTucked ? <PanelBottomOpen /> : <PanelBottomClose />}
                </ToolButton>
              </div>
            )}
          </div>
        </div>
        <div className="absolute inset-x-3 bottom-3 z-30 flex flex-col gap-2">
          {controls && <div className={cn('flex flex-col gap-2', tuck)}>{controls}</div>}
          {timeline && <AnimationControls />}
        </div>
      </section>

      <aside className={workbenchAside} aria-label={`${title} explanation`}>
        <LabMissions />
        <Tabs defaultValue="explain" className="flex min-h-0 flex-1 flex-col gap-0">
          <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2">
            <TabsList>
              <TabsTrigger value="explain">Explain</TabsTrigger>
              <TabsTrigger value="parts" data-tour="lab-parts">Parts</TabsTrigger>
              {extraTab && <TabsTrigger value={extraTab.id}>{extraTab.label}</TabsTrigger>}
            </TabsList>
            <LevelToggle compact />
          </div>
          <TabsContent value="explain" className="min-h-0 flex-1 overflow-y-auto p-4">
            {explanation}
          </TabsContent>
          <TabsContent value="parts" className="min-h-0 flex-1 overflow-y-auto p-3">
            <ComponentInspector componentIds={componentIds} />
          </TabsContent>
          {extraTab && (
            <TabsContent value={extraTab.id} className="min-h-0 flex-1 overflow-y-auto p-3">
              {extraTab.content}
            </TabsContent>
          )}
        </Tabs>
        {disclaimer && <p className="border-t border-white/[0.06] px-4 py-2 text-[11px] leading-snug text-steel-400">{disclaimer}</p>}
      </aside>
    </div>
  )
}

function ToolButton({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          aria-label={label}
          aria-pressed={active}
          onClick={onClick}
          className={cn('size-9 pointer-coarse:size-11', active && 'bg-cyan/15 text-cyan hover:bg-cyan/20 hover:text-cyan')}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function SceneToolbar() {
  const store = useLabStoreApi()
  const showLabels = useLab((s) => s.showLabels)
  const exploded = useLab((s) => s.exploded)
  const s = store.getState()
  return (
    <div className="panel pointer-events-auto flex items-center gap-0.5 p-1 pointer-coarse:gap-1 pointer-coarse:max-sm:grid pointer-coarse:max-sm:grid-cols-2" role="toolbar" aria-label="Scene tools" data-tour="lab-toolbar">
      <ToolButton label={showLabels ? 'Hide part names' : 'Show part names'} active={showLabels} onClick={() => s.toggleLabels()}>
        <Tag />
      </ToolButton>
      <ToolButton label={exploded ? 'Assembled view' : 'Exploded view'} active={exploded} onClick={() => s.setExploded(!exploded)}>
        <Boxes />
      </ToolButton>
      <ToolButton label="Show all parts" onClick={() => s.showAll()}>
        <View />
      </ToolButton>
      <ToolButton label="Reset camera" onClick={() => s.resetCamera()}>
        <RotateCcw />
      </ToolButton>
    </div>
  )
}

/** Parts list with select / hide / isolate, plus details of the selected part. */
export function ComponentInspector({ componentIds }: { componentIds: string[] }) {
  const store = useLabStoreApi()
  const selectedId = useLab((s) => s.selectedId)
  const hidden = useLab((s) => s.hidden)
  const isolatedId = useLab((s) => s.isolatedId)
  const level = usePreferences((p) => p.level)
  const s = store.getState()
  const selected = selectedId ? getComponent(selectedId) : undefined

  return (
    <div className="flex flex-col gap-3">
      {selected ? (
        <div className="rounded-lg border border-cyan/30 bg-cyan/[0.06] p-3" aria-live="polite" data-testid="selected-component">
          <p className="eyebrow text-cyan">Selected</p>
          <h3 className="mt-1 text-lg font-semibold">{selected.name}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-steel-300">
            {level === 'technical' && selected.technical ? selected.technical : selected.description}
          </p>
          {selected.annotations.length > 0 && (
            <dl className="mt-2 grid gap-1">
              {selected.annotations.map((a) => (
                <div key={a.label} className="flex gap-2 text-xs">
                  <dt className="annotation shrink-0 text-steel-400">{a.label}</dt>
                  <dd className="text-steel-300">{a.text}</dd>
                </div>
              ))}
            </dl>
          )}
          {getPioneersForComponent(selected.id).map((p) => (
            <Link
              key={p.id}
              to={`/pioneers?focus=${p.id}`}
              className="relative hit-area mt-2 flex min-h-9 items-center gap-2 rounded-md border border-amber/25 bg-amber/[0.05] px-2.5 py-1.5 text-xs text-amber hover:border-amber/60"
            >
              <History aria-hidden className="size-3.5 shrink-0" />
              <span className="min-w-0">
                History: <span className="font-medium">{p.name}</span>, {p.year}
              </span>
            </Link>
          ))}
          {selected.relatedTopicIds.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {selected.relatedTopicIds.map((tid) => {
                const t = getTopic(tid)
                return t ? (
                  <Link key={tid} to={`/topics/${t.slug}`} className="rounded border border-white/10 px-2 py-0.5 text-xs text-steel-300 hover:border-cyan/50 hover:text-cyan">
                    {t.title} →
                  </Link>
                ) : null
              })}
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-steel-400">Select a part in the scene or from the list to see what it does.</p>
      )}

      <ul className="flex flex-col divide-y divide-white/[0.05] rounded-lg border border-white/[0.06]">
        {componentIds.map((id) => {
          const c = getComponent(id)
          const isHidden = !!hidden[id]
          const isIsolated = isolatedId === id
          return (
            <li key={id} className={cn('flex items-center gap-1 px-1.5 py-1', selectedId === id && 'bg-white/[0.04]')}>
              <button
                type="button"
                className={cn('min-h-9 pointer-coarse:min-h-12 flex-1 rounded px-2 text-left text-sm hover:text-cyan', selectedId === id ? 'text-cyan' : 'text-paper', isHidden && 'opacity-50')}
                onClick={() => s.select(selectedId === id ? null : id)}
                aria-pressed={selectedId === id}
              >
                {c?.name ?? id}
              </button>
              <Button size="icon" variant="ghost" className="size-8" aria-label={`${isIsolated ? 'Stop isolating' : 'Isolate'} ${c?.name ?? id}`} aria-pressed={isIsolated} onClick={() => s.isolate(isIsolated ? null : id)}>
                <Focus className={cn(isIsolated && 'text-cyan')} />
              </Button>
              <Button size="icon" variant="ghost" className="size-8" aria-label={`${isHidden ? 'Show' : 'Hide'} ${c?.name ?? id}`} aria-pressed={isHidden} onClick={() => s.toggleHidden(id)}>
                {isHidden ? <EyeOff className="text-steel-500" /> : <Eye />}
              </Button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
