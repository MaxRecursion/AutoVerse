import { useMemo } from 'react'
import { ArrowRight, Boxes, Eye, Layers, ScrollText } from 'lucide-react'
import { Link } from 'react-router'
import { Progress } from '@/components/ui/progress'
import { topicHref } from '@/components/learning/labels'
import { layerProgress, layerOf } from '@/features/progress/curriculum'
import { getTopic, pioneers, topics } from '@/lib/content'
import type { Layer } from '@/lib/schemas'
import { useProgress } from '@/stores/progress'
import { HomeSection } from './HomeSection'
import { Reveal } from './Reveal'

const ICONS: Record<Layer, typeof Eye> = { surface: Eye, mechanism: Boxes, engineering: Layers }

const COPY: Record<Layer, { title: string; body: string; cta: string }> = {
  surface: {
    title: 'Get the idea',
    body: 'Start with the big picture: what each system does and why it exists, in plain language.',
    cta: 'Start with the basics',
  },
  mechanism: {
    title: 'See it work',
    body: 'Run a live 3D lab. Play it, scrub it, explode it, select any part and watch the rest respond.',
    cta: 'Open the labs',
  },
  engineering: {
    title: 'Go deeper',
    body: 'Ratios, hydraulics, thermodynamics: the numbers and trade-offs engineers actually design with.',
    cta: 'Take the next deep dive',
  },
}

/**
 * "How you'll learn": the descent every system follows, with the learner's
 * live progress at each depth, plus the story layer. Each card is one
 * obvious next step.
 */
export function LearningJourney() {
  const completed = useProgress((s) => s.completed)
  const progress = useMemo(() => layerProgress(topics, completed), [completed])
  const nextIn = (layer: Layer) => topics.filter((t) => layerOf(t) === layer).sort((a, b) => a.prerequisiteTopicIds.length - b.prerequisiteTopicIds.length).find((t) => !completed[t.id])
  const years = pioneers.length ? `${pioneers[0]!.sortYear}–${pioneers[pioneers.length - 1]!.sortYear}` : ''
  const basics = getTopic('how-a-car-works')

  return (
    <HomeSection
      id="journey"
      eyebrow="How you'll learn"
      title="Start at the surface. Dig as deep as you like."
      description="Every system is taught the same way, so you always know where you are and what comes next."
    >
      <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {progress.map(({ layer, total, completed: done, percent }, i) => {
          const Icon = ICONS[layer.id]
          const copy = COPY[layer.id]
          const next = nextIn(layer.id)
          const to = layer.id === 'mechanism' ? '/labs' : next ? topicHref(next) : layer.id === 'surface' && basics ? topicHref(basics) : '/learn'
          return (
            <li key={layer.id}>
              <Reveal delay={i * 0.05} className="h-full">
                <Link to={to} className="group panel flex h-full flex-col gap-3 p-5 transition-colors hover:border-cyan/40">
                  <span className="flex items-center gap-2">
                    <span className="grid size-8 place-items-center rounded-full border border-cyan/40 bg-cyan/10 font-mono text-xs text-cyan">{i + 1}</span>
                    <Icon aria-hidden className="size-4 text-steel-400" />
                    <span className="eyebrow">{layer.label}</span>
                  </span>
                  <span className="text-lg font-semibold text-paper group-hover:text-cyan">{copy.title}</span>
                  <span className="text-sm leading-relaxed text-steel-300">{copy.body}</span>
                  <span className="mt-auto flex flex-col gap-2 pt-2">
                    <span className="flex items-baseline justify-between font-mono text-xs text-steel-400">
                      <span>
                        {done} of {total} lessons
                      </span>
                      <span className="tabular-nums">{percent}%</span>
                    </span>
                    <Progress value={percent} aria-label={`${layer.label} lessons complete`} className="h-1 bg-graphite-700" />
                    <span className="inline-flex items-center gap-1.5 text-sm text-cyan">
                      {copy.cta} <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </span>
                </Link>
              </Reveal>
            </li>
          )
        })}
        <li>
          <Reveal delay={0.15} className="h-full">
            <Link to="/pioneers" className="group flex h-full flex-col gap-3 rounded-xl border border-amber/25 bg-amber/[0.04] p-5 transition-colors hover:border-amber/60">
              <span className="flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-full border border-amber/40 bg-amber/10 font-mono text-xs text-amber">+</span>
                <ScrollText aria-hidden className="size-4 text-steel-400" />
                <span className="eyebrow text-amber">Stories</span>
              </span>
              <span className="text-lg font-semibold text-paper group-hover:text-amber">Meet the engineers</span>
              <span className="text-sm leading-relaxed text-steel-300">
                Every part was somebody’s problem first. See who solved it, and what they were up against.
              </span>
              <span className="mt-auto flex flex-col gap-2 pt-2">
                <span className="font-mono text-xs text-steel-400">
                  {pioneers.length} engineers · {years}
                </span>
                <span className="inline-flex items-center gap-1.5 text-sm text-amber">
                  Browse the timeline <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </span>
            </Link>
          </Reveal>
        </li>
      </ol>
    </HomeSection>
  )
}
