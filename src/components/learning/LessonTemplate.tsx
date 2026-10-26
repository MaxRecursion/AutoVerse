import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Check, ListTree } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { completeLesson } from '@/features/progress/actions'
import { resolveNextUp } from '@/features/progress/curriculum'
import { LabHost } from '@/features/labs/LabHost'
import { useLabInstance } from '@/features/labs/useLabInstance'
import { getLab } from '@/features/labs/registry'
import type { LessonFacts, Stage } from '@/features/progress/stages'
import { useLessonStages } from '@/features/progress/useLessonStages'
import { useIsMobile, usePrefersReducedMotion } from '@/hooks/useMediaQuery'
import { getCategory, getComponent, getPioneersForTopic, getRelatedTopics, getTopic, learningPaths, topics } from '@/lib/content'
import type { FlowDiagram as FlowDiagramData, Topic } from '@/lib/schemas'
import type { LabStore } from '@/lib/simulation/labStore'
import { usePreferences } from '@/stores/preferences'
import { useProgress } from '@/stores/progress'
import { DwellSentinel } from './DwellSentinel'
import { FlowDiagram } from './FlowDiagram'
import { KeyConcepts, Misconceptions, PracticalExamples, RelatedTopics, SourcesAndAttribution } from './LessonDetails'
import { LessonDeeper, type DeeperPanel } from './LessonDeeper'
import { LessonFinish } from './LessonFinish'
import { LessonHeader } from './LessonHeader'
import { LessonJourney } from './LessonJourney'
import { LessonComponents } from './LessonComponents'
import { LessonQuiz } from './LessonQuiz'
import { LessonSection } from './LessonSection'
import { LessonSteps } from './LessonSteps'
import { LessonStory } from './LessonStory'
import { LevelToggle } from './LevelToggle'
import { StageRail } from './StageRail'
import { paragraphs } from './labels'
import { revealElement, useOptionalLab } from './labSync'
import { useLevelScrollAnchor } from './useLevelScrollAnchor'

interface SectionDef {
  id: string
  title: string
  /** Lesson stage label shown beside the section number. */
  stage?: string
  description?: ReactNode
  wide?: boolean
  content: ReactNode
}

const isPresent = <T,>(x: T | undefined): x is T => x !== undefined

/**
 * The lesson page body for one topic, taught in stages:
 * Overview → See it work → Go deeper → Check → Story. Sections without
 * content are hidden (numbering stays continuous). When the topic names a
 * registered lab, the lab store is created here so the steps, component cards
 * and flow diagram can drive — and follow — the 3D animation, and so lab
 * activity can count towards the "See it work" stage.
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
  const signal = useProgress((s) => s.signal)
  const seeStep = useProgress((s) => s.seeStep)
  const completed = useProgress((s) => s.completed)
  useEffect(() => {
    visit(topic.id)
  }, [topic.id, visit])

  const category = getCategory(topic.categoryId)
  const components = topic.componentIds.map(getComponent).filter(isPresent)
  const prerequisites = topic.prerequisiteTopicIds.map(getTopic).filter(isPresent)
  const prereqIds = new Set(prerequisites.map((t) => t.id))
  const related = getRelatedTopics(topic).filter((t) => !prereqIds.has(t.id))
  const pioneers = useMemo(() => getPioneersForTopic(topic.id), [topic.id])
  const nextUp = useMemo(
    () => resolveNextUp({ topics, paths: learningPaths, completed, recent: [], getTopic, currentTopicId: topic.id }),
    [completed, topic.id],
  )
  const routeTopics = nextUp.route?.topics ?? [topic]

  const hasFlow = !!topic.flow && topic.flow.nodes.length > 0
  const facts = useMemo<LessonFacts>(
    () => ({
      hasLab: !!lab,
      stepIds: topic.steps.map((s) => s.id),
      hasFlow,
      hasDeeper: topic.keyConcepts.length + topic.misconceptions.length + topic.practicalExamples.length > 0,
      hasQuiz: topic.quiz.length > 0,
      hasStory: pioneers.length > 0,
    }),
    [lab, topic, hasFlow, pioneers],
  )
  const { stages, summary, complete } = useLessonStages(topic.id, facts)

  // Evidence for "See it work": the learner did something in the lab (never the autoplay clock).
  useEffect(() => {
    if (!store) return
    const mark = () => signal(topic.id, 'lab')
    if (Object.keys(store.getState().activity).length > 0) mark()
    return store.subscribe((s, prev) => {
      if (s.activity !== prev.activity) mark()
    })
  }, [store, topic.id, signal])

  // Evidence for "Go deeper": switching to the Technical level while reading.
  const previousLevel = useRef(level)
  useEffect(() => {
    if (previousLevel.current !== level && level === 'technical') signal(topic.id, 'deeper')
    previousLevel.current = level
  }, [level, topic.id, signal])

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
  const goToStage = (stage: Stage) => {
    const section = document.getElementById(stage.target)
    section?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
    const heading = document.getElementById(`${stage.target}-heading`)
    if (heading) {
      heading.tabIndex = -1
      heading.focus({ preventScroll: true })
    }
  }

  const flowOnly = hasFlow && !lab && topic.steps.length === 0
  const flowDiagram = hasFlow && (
    <div className="relative">
      <LessonFlow flow={topic.flow!} topic={topic} store={store} onLocate={revealScene} />
      {flowOnly && <DwellSentinel onSeen={() => signal(topic.id, 'flow')} threshold={0.5} ms={1500} />}
    </div>
  )

  const deeperCandidates: (DeeperPanel | false)[] = [
    topic.keyConcepts.length > 0 && {
      id: 'concepts',
      title: 'Key concepts',
      count: topic.keyConcepts.length,
      content: <KeyConcepts concepts={topic.keyConcepts} />,
      defaultOpen: level === 'technical',
    },
    topic.misconceptions.length > 0 && {
      id: 'misconceptions',
      title: 'Common misconceptions',
      count: topic.misconceptions.length,
      content: <Misconceptions items={topic.misconceptions} />,
    },
    topic.practicalExamples.length > 0 && {
      id: 'examples',
      title: 'In the real world',
      count: topic.practicalExamples.length,
      content: <PracticalExamples items={topic.practicalExamples} />,
    },
  ]
  const deeperPanels = deeperCandidates.filter((p): p is DeeperPanel => !!p)

  const introParagraphs = paragraphs(level === 'beginner' ? topic.beginnerExplanation : topic.technicalExplanation)

  const sections: (SectionDef | false)[] = [
    {
      id: 'introduction',
      stage: 'Overview',
      title: 'The idea',
      description: level === 'beginner' ? 'Beginner explanation — switch to Technical for the engineering detail.' : 'Technical explanation.',
      content: (
        <div className="flex flex-col gap-4 text-[17px] leading-[1.7] text-steel-300">
          {introParagraphs.map((p, i) => (
            <p key={i} data-anchor className="relative">
              {p}
              {i === introParagraphs.length - 1 && <DwellSentinel onSeen={() => signal(topic.id, 'overview')} threshold={0.8} ms={700} />}
            </p>
          ))}
        </div>
      ),
    },
    topic.learningObjectives.length > 0 && {
      id: 'objectives',
      stage: 'Overview',
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
          stage: 'See it work',
          title: 'Try it yourself',
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
            <div ref={sceneRef} className="scroll-mt-28" data-tour="lesson-lab">
              <LabHost labId={lab.id} store={store} variant="embedded" />
            </div>
          ),
        }
      : !!flowDiagram && { id: 'diagram', stage: 'See it work', title: 'How it flows', wide: true, content: flowDiagram },
    topic.steps.length > 0 && {
      id: 'steps',
      stage: 'See it work',
      title: 'Step by step',
      description: store ? 'Use “Show in 3D” to jump the animation to a step; the step currently playing is highlighted.' : 'Read each step in order.',
      content: (
        <LessonSteps
          steps={topic.steps}
          level={level}
          store={store}
          onShowCue={showCue}
          onSelectComponent={selectInLab}
          onSeen={(id) => seeStep(topic.id, id)}
        />
      ),
    },
    components.length > 0 && {
      id: 'components',
      stage: 'See it work',
      title: 'Key components',
      description: store ? 'Select a part to highlight it in the 3D scene.' : 'Select a part for more detail.',
      wide: true,
      content: <LessonComponents components={components} store={store} onLocate={revealScene} />,
    },
    !!store && !!flowDiagram && { id: 'flow', stage: 'See it work', title: 'How it flows', wide: true, content: flowDiagram },
    deeperPanels.length > 0 && {
      id: 'deeper',
      stage: 'Go deeper',
      title: 'Go deeper',
      description: 'Optional. Open a panel for the engineering detail — or switch to Technical above.',
      content: <LessonDeeper panels={deeperPanels} onOpen={() => signal(topic.id, 'deeper')} />,
    },
    topic.quiz.length > 0 && {
      id: 'quiz',
      stage: 'Check',
      title: 'Check your understanding',
      description: `${topic.quiz.length} question${topic.quiz.length === 1 ? '' : 's'}. Your best score is saved in this browser.`,
      content: <LessonQuiz topicId={topic.id} questions={topic.quiz} />,
    },
    pioneers.length > 0 && {
      id: 'story',
      stage: 'Story',
      title: 'The story behind it',
      description: 'Who worked this out, and what they were up against. Optional.',
      content: <LessonStory pioneers={pioneers} topicId={topic.id} onOpened={() => signal(topic.id, 'story')} />,
    },
    (prerequisites.length > 0 || related.length > 0) && {
      id: 'related',
      title: 'Related lessons',
      wide: true,
      content: <RelatedTopics prerequisites={prerequisites} related={related} />,
    },
    { id: 'sources', title: 'Sources & attribution', content: <SourcesAndAttribution topic={topic} /> },
  ]
  const visible = sections.filter((s): s is SectionDef => !!s)

  return (
    <div ref={rootRef}>
      <div className="mx-auto max-w-6xl px-4 pb-6 pt-6 sm:px-6 lg:pt-10">
        <LessonHeader topic={topic} category={category} interactive={!!lab} />
        <div className="mt-5">
          <LessonJourney
            topic={topic}
            category={category}
            routeTopics={routeTopics}
            path={nextUp.route?.path}
            next={nextUp.topic}
            nextLabel={nextUp.label}
            skipped={nextUp.skipped}
          />
        </div>
      </div>

      <LessonBar
        sections={visible}
        rail={<StageRail stages={stages} summary={summary} complete={complete} onGo={goToStage} onFinish={() => completeLesson(topic.id)} />}
      />

      <article className="mx-auto flex max-w-6xl flex-col gap-14 px-4 py-10 sm:px-6">
        {visible.map((s, i) =>
          s.id === 'sources' ? (
            <div key={s.id} className="flex flex-col gap-14">
              <LessonFinish topic={topic} stages={stages} summary={summary} complete={complete} next={nextUp} onFinish={() => completeLesson(topic.id)} />
              <LessonSection id={s.id} index={i + 1} title={s.title} description={s.description} wide={s.wide}>
                {s.content}
              </LessonSection>
            </div>
          ) : (
            <LessonSection key={s.id} id={s.id} index={i + 1} stage={s.stage} title={s.title} description={s.description} wide={s.wide}>
              {s.content}
            </LessonSection>
          ),
        )}
      </article>
    </div>
  )
}

/** Sticky bar under the site header: section menu, lesson title, level toggle. */
function LessonBar({ sections, rail }: { sections: SectionDef[]; rail: ReactNode }) {
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
        {rail}
        <LevelToggle compact={mobile} className="ml-auto shrink-0" />
      </div>
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
