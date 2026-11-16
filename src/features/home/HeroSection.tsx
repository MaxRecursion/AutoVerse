import { ArrowRight, AudioLines, Car, GraduationCap } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { labs } from '@/features/labs/registry'
import { useCourseNextUp } from '@/features/course-navigation/useCourseNextUp'
import { sceneComponents, topics } from '@/lib/content'
import { HeroEngine } from './HeroEngine'
import { startLearningHref } from './homeData'
import { Reveal } from './Reveal'

/** Above the fold: the signature sound lab, learning entry, and live engine. */
export function HeroSection() {
  // The same answer as the header's progress pill, so the page never gives two different "next" lessons.
  const nextUp = useCourseNextUp()
  const nextTopic = nextUp.topic
  const startHref = startLearningHref(nextTopic)
  const startLabel =
    nextUp.kind === 'start'
      ? 'Start Learning'
      : nextUp.kind === 'continue' || nextUp.kind === 'next' || nextUp.kind === 'revisit'
        ? 'Continue Learning'
        : nextUp.kind === 'new-route'
          ? 'Start Next Path'
          : 'Explore Lessons'

  const stats = [
    { label: 'Lessons', value: topics.length },
    { label: '3D labs', value: labs.length },
    { label: 'Parts explained', value: sceneComponents.length },
  ]

  return (
    <section aria-labelledby="home-heading" className="relative isolate overflow-hidden border-b border-line/[0.06]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-blueprint [mask-image:radial-gradient(ellipse_80%_70%_at_65%_40%,black_25%,transparent_80%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-[20%] -top-[30%] -z-10 h-[90vh] w-[80vw] bg-[radial-gradient(closest-side,rgb(56_215_242/0.09),transparent)]"
      />

      {/* Phones: copy, engine, then figures. Wide screens: copy over figures, the engine spanning both rows. */}
      <div className="mx-auto grid w-full max-w-[1400px] grid-cols-1 gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:grid-rows-[auto_auto] lg:gap-x-6 lg:py-6">
        <div className="max-w-xl lg:col-start-1 lg:row-start-1 lg:self-end">
          <p className="eyebrow flex items-center gap-2">
            <span aria-hidden className="h-px w-6 bg-cyan" />
            AutoVerse · See the motion. Hear the difference.
          </p>
          <h1
            id="home-heading"
            className="mt-2 text-3xl font-semibold leading-[1.05] tracking-tight text-paper sm:text-4xl xl:text-5xl"
          >
            See it move.<br />{' '}Hear it fire<span className="text-amber">.</span>
          </h1>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-steel-300">
            From an inline-three to a V10: hear how production engine layouts, bank angles and firing orders shape the rhythm.
            Then take the machinery apart with interactive 3D labs and plain-language lessons.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
            <Button asChild size="lg" className="h-10 px-3 text-sm pointer-coarse:min-h-11">
              <Link to="/sound-lab">
                <AudioLines aria-hidden />
                Open Engine Sound Lab
                <ArrowRight aria-hidden />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-10 border-line/12 bg-graphite-900/60 px-3 text-sm pointer-coarse:min-h-11 hover:border-cyan/40">
              <Link to={startHref}>
                <GraduationCap aria-hidden />
                {startLabel}
                <ArrowRight aria-hidden />
              </Link>
            </Button>
            <Button asChild size="lg" variant="ghost" className="h-10 px-3 text-sm text-paper pointer-coarse:min-h-11 hover:text-cyan">
              <Link to="/explore">
                <Car aria-hidden />
                Explore the Car
              </Link>
            </Button>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-steel-400">Live synthesized audio · Starts only when you press play</p>
          {nextTopic && (
            <p className="mt-3 text-sm text-steel-400">
              <span className="eyebrow mr-2">Next up</span>
              <Link to={startHref} className="text-steel-300 underline-offset-4 hover:text-cyan hover:underline">
                {nextTopic.title}
              </Link>{' '}
              · {nextTopic.estimatedDuration} min
            </p>
          )}
        </div>

        <Reveal trigger="mount" delay={0.1} className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center">
          <HeroEngine compact />
        </Reveal>

        <dl className="grid w-full max-w-md grid-cols-3 gap-2 self-start lg:col-start-1 lg:row-start-2">
          {stats.map((s) => (
            <div key={s.label} className="panel flex flex-col-reverse justify-end gap-1 px-3 py-2">
              <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-steel-400">{s.label}</dt>
              <dd className="font-display text-2xl tabular-nums text-paper">{s.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
