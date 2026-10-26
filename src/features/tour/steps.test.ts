import { matchRoutes } from 'react-router'
import { describe, expect, it } from 'vitest'
import { routes } from '@/app/router'
import { getTopicBySlug } from '@/lib/content'
import { TOUR_LENGTH, TOUR_STEPS } from './steps'

// Every file that could define an anchor (tests excluded, so a test cannot satisfy its own check).
const sources = import.meta.glob(['/src/**/*.tsx', '!/src/**/*.test.tsx'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const anchors = new Set(Object.values(sources).flatMap((src) => [...src.matchAll(/data-tour="([a-z-]+)"/g)].map((m) => m[1]!)))
const anchorOf = (selector: string) => /^\[data-tour="([a-z-]+)"\]$/.exec(selector)?.[1]

describe('tour steps', () => {
  it('has unique ids and a first and last step that need no target', () => {
    expect(new Set(TOUR_STEPS.map((s) => s.id)).size).toBe(TOUR_LENGTH)
    expect(TOUR_STEPS[0]!.target).toBeUndefined()
    expect(TOUR_STEPS.at(-1)!.target).toBeUndefined()
  })

  it('keeps chapters contiguous, so the step counter reads sensibly', () => {
    const seen: string[] = []
    for (const s of TOUR_STEPS) if (seen.at(-1) !== s.chapter) seen.push(s.chapter)
    expect(new Set(seen).size).toBe(seen.length)
  })

  it('only points at anchors that exist in the app', () => {
    for (const step of TOUR_STEPS) {
      for (const selector of [step.target, step.narrowTarget].filter((s): s is string => !!s)) {
        const name = anchorOf(selector)
        expect(name, `${step.id}: "${selector}" must be a [data-tour="…"] selector`).toBeDefined()
        expect(anchors.has(name!), `${step.id}: no element has data-tour="${name}"`).toBe(true)
      }
    }
  })

  it('only visits pages that exist', () => {
    for (const step of TOUR_STEPS.filter((s) => s.route)) {
      expect(matchRoutes(routes, step.route!), `${step.id}: ${step.route}`).not.toBeNull()
    }
    const lesson = TOUR_STEPS.find((s) => s.route?.startsWith('/topics/'))
    expect(getTopicBySlug(lesson!.route!.split('/').pop()!)).toBeDefined()
  })

  it('keeps every step short enough to read in a card', () => {
    for (const s of TOUR_STEPS) {
      expect(s.title.length, s.id).toBeLessThanOrEqual(40)
      expect(s.body.length, s.id).toBeLessThanOrEqual(260)
      if (s.tip) expect(s.tip.length, s.id).toBeLessThanOrEqual(120)
    }
  })

  it('has a narrow-screen stand-in for every target that is hidden on phones', () => {
    expect(TOUR_STEPS.find((s) => s.id === 'nav')!.narrowTarget).toBeDefined()
  })
})
