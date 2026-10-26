/**
 * The product tour: what it says and where it points. Pure data — the host
 * (TourHost.tsx) turns it into a spotlight and a card. Targets are
 * `data-tour="…"` anchors in the app; steps.test.ts fails if one disappears.
 */

export interface TourStep {
  id: string
  /** Shown beside the step count so a learner knows which part of the app they are in. */
  chapter: string
  /** Router pathname this step lives on. The tour navigates there first; omit for steps that work on any page. */
  route?: string
  /** `data-tour` anchor to spotlight. Omit for a centred card. */
  target?: string
  /** Tried first on narrow screens, e.g. the menu button standing in for the hidden nav. */
  narrowTarget?: string
  title: string
  body: string
  /** One short, concrete thing to try. */
  tip?: string
}

const anchor = (name: string) => `[data-tour="${name}"]`

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'welcome',
    chapter: 'Welcome',
    route: '/',
    title: 'Welcome to AutoVerse',
    body: 'A car makes sense when you start at the surface and dig down. This 60-second tour shows how to learn here: where to go, what the 3D labs do, and how your progress is kept.',
    tip: 'Press Esc at any time to leave. You can replay the tour from the ? button.',
  },
  {
    id: 'nav',
    chapter: 'Find your way',
    target: anchor('nav'),
    narrowTarget: anchor('menu-button'),
    title: 'Five doors, in order',
    body: 'Explore the Car shows the whole vehicle. Learn is the curriculum, surface to depth. Labs run live 3D machinery. Pioneers tells who developed each part. My Progress keeps score.',
  },
  {
    id: 'progress-pill',
    chapter: 'Find your way',
    target: anchor('progress-pill'),
    title: 'Always know what is next',
    body: 'This ring is your overall progress. It always links to your next lesson, from any page, so you never have to remember where you were.',
    tip: 'Progress is saved only in this browser. There is no account.',
  },
  {
    id: 'search',
    chapter: 'Find your way',
    target: anchor('search'),
    title: 'Search everything',
    body: 'Find lessons, labs, parts and engineers in one place. Small typos are forgiven.',
    tip: 'Press ⌘K or Ctrl+K from anywhere, or just /.',
  },
  {
    id: 'stages',
    chapter: 'Learn a lesson',
    route: '/topics/four-stroke-cycle',
    target: anchor('stage-rail'),
    title: 'Five stages, earned by doing',
    body: 'Overview, See it work, Go deeper, Check, Story. A stage ticks only when you actually read, try or answer. When the core stages are done, a Finish button appears.',
    tip: 'Optional stages never block you from finishing.',
  },
  {
    id: 'lesson-lab',
    chapter: 'Learn a lesson',
    route: '/topics/four-stroke-cycle',
    target: anchor('lesson-lab'),
    title: 'Text and 3D move together',
    body: 'Press “Show in 3D” on any step and the engine jumps to that moment. Select a part to highlight it. The animation is slowed right down so you can see what each part does.',
    tip: 'Drag to orbit. Pinch or scroll to zoom.',
  },
  {
    id: 'lab-toolbar',
    chapter: 'Run a lab',
    route: '/labs/engine',
    target: anchor('lab-toolbar'),
    title: 'Take it apart',
    body: 'Show part names, explode the assembly, reveal everything again, or reset the camera. Every lab has the same toolbar.',
  },
  {
    id: 'lab-transport',
    chapter: 'Run a lab',
    route: '/labs/engine',
    target: anchor('lab-transport'),
    title: 'You control time',
    body: 'Play, pause, step one small angle at a time, scrub the timeline, or slow it to a tenth of normal speed. The explanation beside it changes as the animation moves.',
  },
  {
    id: 'lab-missions',
    chapter: 'Run a lab',
    route: '/labs/engine',
    target: anchor('lab-missions'),
    title: 'Missions tick as you explore',
    body: 'Each lab has a short checklist. Items complete from what you really do, such as selecting a part, changing a gear or switching ABS off, and the lab tells you when one lands.',
  },
  {
    id: 'lab-parts',
    chapter: 'Run a lab',
    route: '/labs/engine',
    target: anchor('lab-parts'),
    title: 'Every part has a story',
    body: 'The Parts tab lists, hides and isolates each component. Select one to read what it does and, where we can source it, who developed it.',
  },
  {
    id: 'finish',
    chapter: 'You are set',
    route: '/',
    title: 'Start at the surface',
    body: 'Begin with the big picture, then follow each system down: Surface, Mechanism, Engineering. Finish a whole course and you can earn a certificate.',
    tip: 'Replay this tour any time from the ? button in the header.',
  },
]

export const TOUR_LENGTH = TOUR_STEPS.length
