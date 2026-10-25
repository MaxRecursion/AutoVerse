# AutoVerse architecture

Static-first (Jamstack) React app. No server, no database, no runtime dependency on any third-party site.

**Stack:** React 19 · TypeScript (strict) · Vite 8 · Tailwind CSS 4 · shadcn/ui (Radix) · lucide-react · motion (`motion/react`) · three.js + React Three Fiber 9 + drei 10 · Zustand 5 · React Router 8 (`react-router`, `RouterProvider` from `react-router/dom`) · Zod 4 · Vitest + Testing Library · Playwright.

```
npm run dev            # Vite dev server
npx tsc -b --noEmit    # typecheck (npm run typecheck)
npm run lint           # ESLint
npm test               # Vitest (unit/component)
npm run test:e2e       # Playwright browser tests
npm run build          # typecheck + vite build + static prerender (scripts/prerender)
npm run validate:content
```

## Layers

| Layer | Where | Notes |
|---|---|---|
| Content data | `src/content/**.json` | Validated by Zod schemas in `src/lib/schemas.ts`, loaded by `src/lib/content.ts` (eager `import.meta.glob`). |
| Simulation state | `src/lib/simulation/labStore.ts` | One Zustand vanilla store per mounted lab. Single time parameter `progress` ∈ [0,1) + `params`. |
| 3D core | `src/components/three/` | `SceneCanvas`, `Part`, `PartLabel`, `LabWorkbench`, `AnimationControls`, `ComponentInspector`, `LabContext`. |
| Labs | `src/features/<name>-lab/` | `config.ts` (pure: cues, deriveCue, params) + `<Name>LabView.tsx` (lazy) + scene + pure math module + tests. Registered in `src/features/labs/registry.ts`. |
| Learning UI | `src/components/learning/`, `src/pages/` | Lesson template, quizzes, level toggle, flow diagrams. |
| Local progress | `src/stores/progress.ts`, `src/stores/preferences.ts` | `localStorage` only. |
| Offline tooling | `scripts/` | Content discovery/import, validation, model inspection, prerender. Never bundled. |

## Simulation & animation contract

- Every animated transform is a **pure function of `progress` (and `params`)**, e.g. `crankAngle = 720° × progress`. Never integrate per-frame deltas into transforms. This keeps pause / resume / scrub / step perfectly synchronised and makes the math unit-testable.
- `SceneCanvas` runs `SimulationClock`, which calls `store.advance(dt)` while playing. Scenes read state **inside `useFrame` via `store.getState()`** (no React re-render per frame). React components subscribe with narrow selectors (`useLab(s => s.cue)`).
- When the 2D `fallback` is shown (no WebGL, `?nowebgl`, or the scene threw), `SceneCanvas` keeps the timeline running with a DOM `requestAnimationFrame` clock (`src/lib/simulation/useRafClock.ts`). Lab authors need do nothing; the fallback reads the same store.
- `config.deriveCue(progress, params)` returns the active cue id (e.g. `intake`). The store only updates `cue` when it changes, so explanation panels re-render on cue boundaries only. Lesson steps call `store.getState().seekCue(id)` to drive the animation from the text.
- Lesson steps may also name **event cues** (e.g. the engine's `spark`, `tdc`, `bdc`, `overlap`) that `deriveCue` never returns while playing. The lesson highlights such a step while the lab is paused exactly on that cue (or, for param-driven labs, while the cue's `params` are applied); otherwise the highlight follows the live cue. See `selectActiveStepId` in `src/components/learning/labSync.ts`.
- Param-driven labs (gear selection, brake pedal, road input) set `timeline: true` only if they also have a meaningful cycle; params are changed with `setParam`. Cues may carry `params`.

## 3D component contract

- Wrap each educational component's geometry in `<Part id="piston" explode={[0,1,0]} labelAnchor={[0,0.6,0]}>`. The id **must** exist in `src/content/components/<system>.json`. `Part` handles click-select, hover, highlight (emissive tint from the component's `highlight.color`), hide, isolate (others ghosted), and the exploded-view offset. Put animated transforms on a group *inside* the Part.
- GLB parts: `<Part id="..."><primitive object={nodes['ExactNodeName']} /></Part>`, mapping from `public/models/manifest.json` `componentMap`. Missing/invalid models must fall back (error boundary → procedural or diagram), never crash.
- Reuse geometries/materials (`useMemo`), dispose what you create, keep triangle counts modest (mobile tier = `useQualityTier()`).
- Every `SceneCanvas` needs a `fallback` (an SVG/2D diagram + text) used when WebGL is unavailable (`?nowebgl` forces it) or the scene throws, and an accessible `label`.
- `SceneCanvas` takes an optional `controls?: 'orbit' | 'none'` (default `'orbit'`). Use `'none'` for decorative or hero scenes: the camera is aimed once and the canvas never captures page scroll, wheel or touch.
- `LabWorkbench` gives the scene its own stacking context (`isolate`) and draws its overlays (cue badge, readouts, transport bar) at `z-30`, above in-scene `PartLabel`s (drei `<Html>`, z-index ≤ 20), so labels never cover the controls and nothing leaks over the page's sticky bars. On phones a toolbar toggle tucks the readouts and lab controls away (the transport stays, on one row).
- `SceneCanvas` shows an in-scene loading overlay until the scene's first frames are drawn (and while drei loaders report progress); `LabHost` shows a workbench-shaped skeleton while a lab's code downloads, so no lab shows a blank canvas. Optional props: `loadingLabel`, `ready` (extra readiness signal, e.g. a model placed), `onCreated` (renderer, camera, canvas size).
- In-scene HTML (drei `<Html>`) renders into a fixed layer provided by `SceneCanvas`: pass `portal={useHtmlLayer()}` (`src/components/three/htmlLayer.ts`). `PartLabel` does this and stays mounted, hiding with CSS (`Part`'s `labelHidden` hides it without unmounting).
- `Part` takes an optional `look(state)` that replaces the default select / hover / isolate look (glow colour and intensity, opacity factor), e.g. the explorer's whole-system glow and view-mode opacity.
- The camera API registered by `SceneCanvas` has `reset`, `lookAt` and `setHome(position, target)`; labs that refit or change their framing (exploded view, resize) call `setHome` so "Reset camera" returns to the current framing.
- The engine lab's default export `src/features/engine-lab/EngineHero.tsx` is a self-contained homepage hero (own store, autoplay unless reduced motion, `controls="none"`). Lazy-load it into a sized container (it fills its parent, min-height 320px).

## Content rules

- Original educational writing only. Never copy text/images from third-party sites. Third-party article URLs may appear only as `sourceReferences` ("further reading") when the URL was actually fetched/confirmed.
- Original content licence field: `{ "name": "AutoVerse original content" }`. Never invent licences, authors or attributions.
- `contentStatus`: `complete` (full lesson incl. quiz), `draft` (substantive but partial), `outline` (title/summary/objectives only — UI says so).
- Simulation numbers are illustrative; say so in the UI (`disclaimer` prop on `LabWorkbench`).
- Category ids: `basics, engine, fuel-ignition, cooling-lubrication, transmission, drivetrain, brakes, suspension-steering, wheels-tyres, electrical, hvac, body-chassis, aero-technology, maintenance, driving`.
- Topic files: `src/content/topics/<categoryId>/<topic-id>.json` (one topic per file, `id === slug`). Component files: `src/content/components/<systemId>.json` (array).

## Learning flow

Depth model, stages, missions and pioneers are described in [learning-experience-plan.md](learning-experience-plan.md). Code map: `features/progress/{curriculum,stages,paths,status,actions,useLessonStages}.ts` (pure logic + hooks), `stores/{progress,toasts}.ts` (local-only state), `components/learning/{StageRail,LessonDeeper,LessonFinish,LessonStory,PioneerCard,SystemLadder,ProgressRing}.tsx`, `components/layout/{ProgressPill,ToastHost}.tsx`, `features/labs/{missions,LabMissions}`, `pages/PioneersPage.tsx`. The lab store's `activity` record is written only by user-facing actions, so anything that rewards interaction must read it rather than the playback clock.

## Design system

Graphite surfaces (`bg-graphite-950/900/850/800/700`), warm white text (`text-paper`), steel greys (`text-steel-300/400/500`), electric cyan for interaction (`cyan`), amber for energy / motion paths (`amber`), `danger` / `ok` for technical states. Utilities: `.panel` (metallic glass panel), `.eyebrow` (mono uppercase label), `.annotation` (mono caption), `.bg-blueprint` (engineering grid). Display font `font-display` (Space Grotesk), body Inter, mono JetBrains Mono. Restrained motion (`motion/react`), respect `prefers-reduced-motion` (`usePrefersReducedMotion`). Touch targets ≥ 36px. shadcn primitives live in `src/components/ui`.
