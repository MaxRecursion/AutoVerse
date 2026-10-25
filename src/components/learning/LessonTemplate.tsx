import { useEffect, useRef, type ReactNode } from 'react'
import { ArrowRight, Box, Check, ListTree } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { LabHost } from '@/features/labs/LabHost'
import { useLabInstance } from '@/features/labs/useLabInstance'
import { getLab } from '@/features/labs/registry'
import { useIsMobile, usePrefersReducedMotion } from '@/hooks/useMediaQuery'
import { getCategory, getComponent, getRelatedTopics, getTopic, getTopicsInCategory } from '@/lib/content'
import type { FlowDiagram as FlowDiagramData, Topic } from '@/lib/schemas'
import type { LabStore } from '@/lib/simulation/labStore'
import { usePreferences } from '@/stores/preferences'
import { useProgress } from '@/stores/progress'
import { FlowDiagram } from './FlowDiagram'
import { KeyConcepts, Misconceptions, PracticalExamples, RelatedTopics, SourcesAndAttribution } from './LessonDetails'
import { LessonActions, LessonHeader } from './LessonHeader'
import { LessonComponents } from './LessonComponents'
import { LessonQuiz } from './LessonQuiz'
import { LessonSection } from './LessonSection'
import { LessonSteps } from './LessonSteps'
import { LevelToggle } from './LevelToggle'
import { paragraphs, sortForLearning, topicHref } from './labels'
import { revealElement, useOptionalLab } from './labSync'
import { useLevelScrollAnchor } from './useLevelScrollAnchor'

interface SectionDef {
  id: string
  title: string
  description?: ReactNode
  wide?: boolean
  content: ReactNode
}

const isPresent = <T,>(x: T | undefined): x is T => x !== undefined

/**
 * The lesson page body for one topic. Sections without content are hidden
 * (numbering stays continuous); when the topic names a registered lab, the
 * lab store is created here so the step list, component cards and flow
 * diagram can drive — and follow — the 3D animation.
 *
 * Mount with `key={topic.id}` so each lesson gets its own lab store.
 */
export function LessonTemplate({ topic }: { topic: Topic }) {
  const level = usePreferences((p) => p.level)
  const rootRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<HTMLDivElement>(null)
  useLevelScrollAnchor(rootRef, level)
  const reduced = usePrefersReducedMotion()

  // null when the topic has no lab or names one that is not registered.
  const store = useLabInstance(topic.labId ?? '')
  const lab = topic.labId && store ? getLab(topic.labId) : undefined

  const visit = useProgress((s) => s.visit)
  useEffect(() => {
    visit(topic.id)
  }, [topic.id, visit])

  const category = getCategory(topic.categoryId)
  const components = topic.componentIds.map(getComponent).filter(isPresent)
  const prerequisites = topic.prerequisiteTopicIds.map(getTopic).filter(isPresent)
  const prereqIds = new Set(prerequisites.map((t) => t.id))
  const related = getRelatedTopics(topic).filter((t) => !prereqIds.has(t.id))
  const inCategory = sortForLearning(getTopicsInCategory(topic.categoryId))
  const upNext = inCategory[inCategory.findIndex((t) => t.id === topic.id) + 1] ?? related[0]

  const revealScene = () => revealElement(sceneRef.current, reduced)
  const showCue = (cue: string) => {
    store?.getState().seekCue(cue)
    revealScene()
  }
  const selectInLab = (componentId: string) => {
    if (!store) return
    store.getState().select(componentId)
    revealScene()
  }

  const flowDiagram = topic.flow && topic.flow.nodes.length > 0 && (
    <LessonFlow flow={topic.flow} topic={topic} store={store} onLocate={revealScene} />
  )

  const sections: (SectionDef | false)[] = [
    {
      id: 'introduction',
      title: 'Introduction',
      description: level === 'beginner' ? 'Beginner explanation — switch to Technical for the engineering detail.' : 'Technical explanation.',
      content: (
        <div className="flex flex-col gap-4 text-[17px] leading-[1.7] text-steel-300">
          {paragraphs(level === 'beginner' ? topic.beginnerExplanation : topic.technicalExplanation).map((p, i) => (
            <p key={i} data-anchor>
              {p}
            </p>
          ))}
        </div>
      ),
    },
    topic.learningObjectives.length > 0 && {
      id: 'objectives',
      title: 'What you will learn',
      content: (
        <ul className="grid gap-2">
          {topic.learningObjectives.map((o) => (
            <li key={o} className="flex gap-3 text-[15px] leading-relaxed text-steel-300">
              <Check aria-hidden className="mt-1 size-4 shrink-0 text-cyan" />
              {o}
            </li>
          ))}
        </ul>
      ),
    },
    lab && store
      ? {
          id: 'scene',
          title: 'Interactive 3D',
          wide: true,
          description: (
            <>
              {lab.summary}{' '}
              <Link to={`/labs/${lab.id}`} className="whitespace-nowrap text-cyan hover:underline">
                Open the full {lab.shortTitle.toLowerCase()} lab
              </Link>
            </>
          ),
          content: (
            <div ref={sceneRef} className="scroll-mt-28">
              <LabHost labId={lab.id} store={store} variant="embedded" />
            </div>
          ),
        }
      : !!flowDiagram && { id: 'diagram', title: 'How it flows', wide: true, content: flowDiagram },
    components.length > 0 && {
      id: 'components',
      title: 'Key components',
      description: store ? 'Select a part to highlight it in the 3D scene.' : 'Select a part for more detail.',
      wide: true,
      content: <LessonComponents components={components} store={store} onLocate={revealScene} />,
    },
    topic.steps.length > 0 && {
      id: 'steps',
      title: 'Step by step',
      description: store ? 'Use “Show in 3D” to jump the animation to a step; the step currently playing is highlighted.' : undefined,
      content: <LessonSteps steps={topic.steps} level={level} store={store} onShowCue={showCue} onSelectComponent={selectInLab} />,
    },
    !!store && !!flowDiagram && { id: 'flow', title: 'How it flows', wide: true, content: flowDiagram },
    topic.keyConcepts.length > 0 && { id: 'concepts', title: 'Key concepts', wide: true, content: <KeyConcepts concepts={topic.keyConcepts} /> },
    topic.misconceptions.length > 0 && {
      id: 'misconceptions',
      title: 'Common misconceptions',
      content: <Misconceptions items={topic.misconceptions} />,
    },
    topic.practicalExamples.length > 0 && {
      id: 'examples',
      title: 'In the real world',
      content: <PracticalExamples items={topic.practicalExamples} />,
    },
    (prerequisites.length > 0 || related.length > 0) && {
      id: 'related',
      title: 'Related lessons',
      wide: true,
      content: <RelatedTopics prerequisites={prerequisites} related={related} />,
    },
    topic.quiz.length > 0 && {
      id: 'quiz',
      title: 'Check your understanding',
      description: `${topic.quiz.length} question${topic.quiz.length === 1 ? '' : 's'}. Your best score is saved in this browser.`,
      content: <LessonQuiz topicId={topic.id} questions={topic.quiz} />,
    },
    { id: 'sources', title: 'Sources & attribution', content: <SourcesAndAttribution topic={topic} /> },
  ]
  const visible = sections.filter((s): s is SectionDef => !!s)

  return (
    <div ref={rootRef}>
      <div className="mx-auto max-w-6xl px-4 pb-6 pt-6 sm:px-6 lg:pt-10">
        <LessonHeader topic={topic} category={category} interactive={!!lab} />
      </div>

      <LessonBar title={topic.title} sections={visible} />

      <article className="mx-auto flex max-w-6xl flex-col gap-14 px-4 py-10 sm:px-6">
        {visible.map((s, i) => (
          <LessonSection key={s.id} id={s.id} index={i + 1} title={s.title} description={s.description} wide={s.wide}>
            {s.content}
          </LessonSection>
        ))}

        <LessonFooter topic={topic} upNext={upNext && upNext.id !== topic.id ? upNext : undefined} />
      </article>
    </div>
  )
}

/** Sticky bar under the site header: section menu, lesson title, level toggle. */
function LessonBar({ title, sections }: { title: string; sections: SectionDef[] }) {
  const mobile = useIsMobile()
  const reduced = usePrefersReducedMotion()
  const target = useRef<string | null>(null)

  return (
    <div className="sticky top-14 z-30 border-y border-white/[0.06] bg-graphite-950/90 backdrop-blur-lg">
      <div className="mx-auto flex h-12 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-9 shrink-0 px-2 text-steel-300">
              <ListTree aria-hidden />
              <span className={mobile ? 'sr-only' : undefined}>On this page</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-64 border-white/10 bg-graphite-850"
            onCloseAutoFocus={(e) => {
              const id = target.current
              target.current = null
              if (!id) return
              e.preventDefault()
              const section = document.getElementById(id)
              section?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
              const heading = document.getElementById(`${id}-heading`)
              if (heading) {
                heading.tabIndex = -1
                heading.focus({ preventScroll: true })
              }
            }}
          >
            <DropdownMenuLabel className="eyebrow">Sections</DropdownMenuLabel>
            {sections.map((s, i) => (
              <DropdownMenuItem key={s.id} className="min-h-9" onSelect={() => (target.current = s.id)}>
                <span className="w-5 font-mono text-[11px] text-steel-500">{String(i + 1).padStart(2, '0')}</span>
                {s.title}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <p className="hidden min-w-0 flex-1 truncate text-sm text-steel-300 sm:block" aria-hidden>
          {title}
        </p>
        <LevelToggle compact={mobile} className="ml-auto shrink-0" />
      </div>
    </div>
  )
}

function LessonFooter({ topic, upNext }: { topic: Topic; upNext?: Topic }) {
  return (
    <div className="panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium text-paper">Finished this lesson?</p>
        <p className="mt-1 text-sm text-steel-400">Progress and bookmarks are stored only in this browser.</p>
        <LessonActions topicId={topic.id} className="mt-3" />
      </div>
      {upNext && (
        <Link
          to={topicHref(upNext)}
          className="group flex min-h-11 items-center gap-3 rounded-lg border border-white/[0.08] px-4 py-3 transition-colors hover:border-cyan/40 sm:max-w-sm"
        >
          <span className="min-w-0">
            <span className="eyebrow block">Up next</span>
            <span className="block truncate text-sm font-medium text-paper group-hover:text-cyan">{upNext.title}</span>
          </span>
          {upNext.labId ? <Box aria-hidden className="size-4 shrink-0 text-cyan" /> : null}
          <ArrowRight aria-hidden className="ml-auto size-4 shrink-0 text-steel-400 group-hover:text-cyan" />
        </Link>
      )}
    </div>
  )
}

/** Flow diagram whose component nodes share selection with the lesson's lab. */
function LessonFlow({ flow, topic, store, onLocate }: { flow: FlowDiagramData; topic: Topic; store: LabStore | null; onLocate: () => void }) {
  const selectedId = useOptionalLab(store, (s) => s.selectedId)
  return (
    <FlowDiagram
      flow={flow}
      label={`${topic.title}: flow diagram`}
      currentTopicId={topic.id}
      selectedComponentId={store ? selectedId : undefined}
      onSelectComponent={store ? (id) => store.getState().select(id) : undefined}
      onLocate={store ? onLocate : undefined}
    />
  )
}
