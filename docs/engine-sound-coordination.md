# Engine Sound Lab — shared implementation handoff

Implemented together by Claude and Codex on main, 14 November 2026. Claude owned the engine catalogue, firing model, AudioWorklet synthesiser, page and lifecycle tests. Codex owned home/navigation promotion, routing, SEO/share images, production browser tests, independent source/DSP review, and release verification. Codex completed the cylinder schematic and the Magnum/TDI presets after Claude handed off the core implementation.

## Feature and boundaries

- `/sound-lab` is the signature experience, linked from the home hero, primary/mobile navigation, Labs, search, footer and existing engine cutaway.
- 19 production presets cover inline-3/4/5/6, boxer-4/6, V6, cross-plane/flat-plane V8 and all nine V10 families featured in the Hagerty reference: Viper, Magnum, Triton, BMW S85, Gallardo 5.0, Audi/Lamborghini 5.2, Lexus LFA, Carrera GT and VW V10 TDI.
- `?engine=<id>` deep-links a preset. The picker stays rendered in the DOM; narrow screens scroll within one horizontal strip. The shared Slider passes accessible names to its actual thumbs.
- `CylinderLayout` shows the cylinder count, bank angle and piston phases. `FiringRing` shows the exact crank firing timeline over 720 degrees, slowed 40 times. Reduced motion leaves both diagrams still; the oscilloscope also stops animating.
- Bank-angle/crankpin experiments are labelled **Experiment · not production**. Returning to production restores the preset.
- The sound is synthesised, not recorded. Firing intervals and verified orders come from engine data. Exhaust routing, runner delays, resonance, rasp and RPM limits are representative teaching settings. This is not a measured acoustic replica. A missing verified cylinder order is labelled rather than invented (currently LFA).
- Each cylinder has an illustrative delay/gain path so firing order can influence the collector waveform, rather than treating every cylinder as an identical oscillator. The original video is credited and linked; its audio and footage are not copied.
- Audio starts on a click, stops when hidden or unmounted, and tears down the specific old graph after its fade. A quick restart cannot be disconnected by the previous stop. Failed startup cleans up and can be retried.
- Listening and page visits do not award curriculum progress. The normal lesson-evidence and next-step rules still apply.

## Source audit

Sources below were fetched/read during implementation on 14 November 2026. The catalogue links the sources on the page.

- [Hagerty / Jason Cammisa reference video](https://www.youtube.com/watch?v=F4-RPcSGVFI): original description and chapter list identify the nine V10 families, the even/odd-firing comparison, 68/76-degree Carrera GT and header-wave interference demonstration. The caption endpoint returned no transcript, so no claim is presented as a quote from a watched transcript.
- [Audi CTO interview](https://magazine.audi.com.au/article/heart-of-gold) and [Audi service training via NHTSA](https://static.nhtsa.gov/odi/tsbs/2016/MC-10119355-9999.pdf): 90-degree unsplit R8 crank, 90/54-degree firing and cylinder order.
- [Lexus LFA media material](https://media.lexus.co.uk/lexus-lfa/): 72-degree bank angle and 9000 rpm.
- [Porsche Carrera GT 2004 service training, archived mirror](https://pdfcoffee.com/2004-carrera-gt-pdf-free.html): Porsche Cars North America PNA48932104 edition 2/04, page 1.3, 68-degree angle, 68/76-degree intervals and order 1-6-3-8-5-10-4-9-2-7.
- [Volkswagen SSP 303](https://www.volkspage.net/technik/ssp/ssp/SSP_303_d1.pdf), pages 4–5 and 9: 90-degree V10 TDI, 18-degree split pins, uniform 72-degree firing, order and production applications. [VW SSP 304](https://www.vaglinks.com/docs/ssp/VWUSA.COM_SSP_304_EDC-16.pdf), page 8: bank/injector numbering.
- [Chrysler SAE 933033](https://saemobilus.sae.org/papers/chrysler-80-liter-v-10-engine-933033): 8.0-litre 90-degree truck V10. The archived 2001 Ram factory manual supplies the order and odd/even bank numbering. The explicit Magnum 54/90-degree sequence is supported by [488 Magnum Designs' original technical explanation](https://www.488magnum.com/post/why-do-dodge-v10-s-sound-unique), rather than a retrieved OEM interval statement.
- [Tenneco/Ricardo/MTS SAE 1999-01-1652](https://www.bksv.com/media/doc/bn1828.pdf): measured and modelled Viper exhaust, shared-pin 90/54-degree firing and the importance of exhaust path delays. It also distinguishes modelled engine orders from recorded timbre.
- The catalogue also links the sources used for remaining inline/flat/V6/V8 orders and the BMW, Gallardo and Triton presets. Maker numbering is retained; the intervals and bank assignments are covered by tests.

## Verification

Unit tests cover 720-degree totals, orders/banks, production V10 interval patterns, source-backed contrasts, and audio lifecycle failures/restarts. `worklet.test.ts` executes the shipped processor at sample resolution: all presets at idle/redline must be finite, audible and unclipped; separate assertions cover odd/even timing, bank rhythm, header delay and firing-order audibility. Browser tests exercise the production build on desktop and phone: explicit start, real non-silent output, restart, unmount cleanup, preset changes, keyboard sliders, experiment reset, diagram angle, overflow and static metadata. Build/prerender checks include the GitHub Pages `/AutoVerse/` base path.

## Claude: animation refinement in progress (user request, 14 Nov 2026)

Akshay asked Claude to refine the Sound Lab animations. Until Claude posts "animation refinement done" below, **Claude is editing these files, so please leave them alone**: `FiringRing.tsx`, `CylinderLayout.tsx`, `Oscilloscope.tsx`, the playhead/animation hooks in `SoundLabPage.tsx`, and the telemetry part of `synth.ts`. Planned:

- The worklet sends the actual (smoothed) rpm and a crank-synchronous 720° waveform snapshot back to the page, **only after the page asks for them** (`{type:'telemetry', on:true}`). `worklet.test.ts`'s fake port has no `postMessage` and never asks, so it is unaffected.
- One requestAnimationFrame loop drives the ring, the cylinder diagram and the scope through refs, with no React re-render per frame. Firing flashes use the Web Animations API, and reduced motion keeps everything still.
- The oscilloscope locks to the engine cycle (one 720° cycle, firing markers per bank) instead of free-running.
- I'll keep the e2e hooks and the existing test ids.

### Codex animation review and release ownership

Akshay has explicitly asked Codex to coordinate this refinement as well. Claude retains the animation/source files claimed above and pure animation/telemetry unit tests. Codex owns `tests/e2e/sound-animation.spec.ts`, independent review, final docs/checks, commit/push and live verification. Please do not commit/push; hand off with "animation refinement done" when ready. The existing feature is already deployed from `974a2d6` (19 presets).

- Phone usability: **move the single Hold to rev button beside/under Start, next to the tachometer**. Currently it is several screens away below the schematic/ring/scope, so learners cannot see the dial or limiter while revving. Keep one button/name for existing keyboard tests. A compact controls stack beside the dial should fit the player; check 320px as well as Pixel 7 width.
- Diesel V10 TDI must use compression ignition cues; do not show a spark plug or an ignition spark flash. Combustion glow and exhaust pulses still apply.
- Reduced-motion changes should cancel any already-running ring Web Animations (including entrance/pops/ripples), not merely stop spawning new ones. Stopping playback should also clear transient firing effects.
- Root's browser tests will inspect existing diagram transforms and `sound-lab-tach`/`sound-lab-limiter`. Consider adding stable `sound-lab-ring` and `sound-lab-scope` test ids if convenient; no extra user-facing debug UI is needed.
- Accessibility regression: the old Engine speed fact was removed, but the whole tachometer is `aria-hidden`, so actual (telemetry) RPM and limiter status are unavailable to screen readers. Please hide only the decorative SVG and expose a labelled numeric `Actual engine speed` output (no rapid aria-live announcements). Expose limiter state in a polite status only on entry/exit, if practical.
- The tachometer needle still writes transforms every frame even with reduced motion. Please freeze it or jump at the throttled numeric update cadence while keeping the readout usable; do not shiver it in reduced mode.

### Claude: animation refinement done — handing back to Codex

Nothing is committed or pushed; Codex reviews and ships. Every change is in `src/features/sound-lab/`:

- **New:** `animation.ts` (pure helpers: slowed crank, firing detection across the 720° wrap, crank sections, rotation sense, shared-pin and slider-crank geometry, combustion cues, dial angle, frame bus), `useEngineFrames.ts` (the single requestAnimationFrame loop), `Tachometer.tsx`, `LiveText.tsx`, `animation.test.ts`, `worklet-telemetry.test.ts`.
- **Changed:**
  - `FiringRing.tsx`: a sweeping hand with a fading trail; each firing pops and ripples (Web Animations API). The latest firing and its gap stay lit, the dots deal in by firing order on engine change, and they glide when the bank or split changes.
  - `CylinderLayout.tsx`:
    - **Motion:** a true slider-crank, so the rod length stays constant. Cylinders on a shared crankpin now ride one pin; this used to be drawn 180° apart on the Viper, Magnum, Buick and cross-plane V8. Split pins show 18° apart, boxer throws 180° apart, and the 60° V6's paired throws 60° apart.
    - **Combustion cues:** a flame fills the chamber after each firing, the ignition flashes, and the exhaust pulse leaves on the outer side.
    - **Bank angle:** it eases instead of jumping.
  - `Oscilloscope.tsx`: locked to the engine cycle, with one lane per exhaust, firing marks and a crank cursor. Before Start it shows idealised pulses.
  - `synth.ts`: worklet telemetry plus `EngineSound.telemetry` and `idealTrace`.
  - `engines.ts`: added `ignition`, with `v10-tdi` set to `'compression'`.
  - `SoundLabPage.tsx`: wiring. The rev counter sits next to Start, and Firing pulses shows live.
- **Telemetry:** the worklet posts nothing until it receives `{type:'telemetry', on:true}`; `EngineSound.start` sends that message. After that it posts `{type:'state', rpm, throttle, limiting}` at an average of 60 Hz and `{type:'cycle', a, b}` (240 bins of 3°, starting at the first firing) at most 30 times a second. Turning telemetry on leaves the audio sample-for-sample identical (tested). Late reports from a stopped graph cannot reach its replacement (tested).
- **Diesel:** the VW V10 TDI shows an injector and a fuel-spray flash, not a spark plug. Its legend reads "Injection and flame (diesel)". It is the only `ignition: 'compression'` preset (tested).
- **Progress:** nothing in `sound-lab/` imports progress, tour or certificate code, so playing, stopping and reduced motion record nothing.
- **Reduced motion:**
  - No hand, pops, piston motion or easing.
  - The scope refreshes at most once a second.
  - The rev counter and "Firing pulses" still show live numbers (text, not motion).
- **Hooks for `tests/e2e/sound-animation.spec.ts`:**
  - **Unchanged:** `sound-lab-start`, `sound-lab-engine-<id>`, `sound-lab-rpm`, `sound-lab-intervals`, `cylinder-layout[data-bank-angle]` (the chosen angle).
  - **New:** `sound-lab-tach` (the readout text) and `sound-lab-limiter[data-on]`.
  - **Also useful:** cylinder groups carry `data-cylinder` and `data-firing="true"` while their flame is lit. The latest firing's ring dot is `g[data-lit="true"]`. The ring hand's `style.opacity` is `1` while animating and `0` otherwise.
  - **Caveat:** animation frames only run in a visible page. Headless Chromium is fine; the hidden in-app browser pane runs none.
- **Checked here:**
  - **Static checks and tests:** `tsc -b` clean, `eslint .` clean, full `vitest run` 1058/1058 (including the reviewer's `worklet.test.ts`).
  - **Headless Playwright on the dev server:** 61 fps with no long tasks while running, and no console errors. Shared pins coincide on screen for the Viper and the cross-plane V8. The bank angle glides from −47.5° to −60°.
  - **Revs:** hold-to-rev climbs to the limiter (8,500 rpm, flag on, BMW V10) and falls back on release. The keyboard Space hold works too, and the counter spins down after Stop.
  - **Layout and reduced motion:** no sideways scroll at 375 px, and reduced motion stays still.
- **Not run by Claude:** `npm run build`, e2e and `og:images` (Codex's). Page titles and descriptions are unchanged, so share cards should be unaffected.

### Reference-image update: mechanical 3D cutaway

Akshay supplied the existing procedural engine cutaway as a visual reference and asked for this kind of animation in the engine lab. Codex is extending the integrated refinement with a lazy-loaded multi-cylinder 3D view at the centre of the production-engine simulator: whole-engine banks plus a detailed selected-cylinder cutaway, orbit/zoom/reset buttons, valves, springs, half-speed cams, rods, crank throws and combustion cues. It reuses AutoVerse's original engine geometries and the shared audio-driven frame bus. The SVG timing diagram stays available as a secondary view and as the WebGL fallback. This is original illustrative teaching geometry, not manufacturer CAD; production presets still own cylinder count, bank angle, ignition type and firing timing. Claude's source handoff above is complete; Codex owns the additional 3D integration and release checks.

## Claude: 3D cutaway — withdrawn in favour of Codex's (14 Nov 2026)

Claude started its own 3D cutaway before seeing that Codex had already claimed this work ("Reference-image update: mechanical 3D cutaway", above). To avoid two competing views:

- **Withdrawn:** Claude deleted its unwired files `EngineCutaway3D.tsx`, `cutawayLayout.ts` and `cutawayLayout.test.ts` (nothing imported them), and **lifts its request that Codex stay out of `SoundLabPage.tsx`**. Codex owns the 3D view, its page integration and the release.
- **Read-only review of `CutawayScene.tsx`, `EngineCutaway.tsx` and `cutawayMath.ts`:**
  - **Crank geometry is consistent.** A bank's pin sits at `bankAxis(side) + sense·(playhead − firing)` about +x, so the two pins of a pair coincide exactly when `firing_B − firing_A ≡ sense·bankAngle (mod 360)`. That is the rule `rotationSense` votes on, and `showCrank` uses the same expression. `cycleDeg = mod(phase + 360, 720)` matches the Engine Lab's firing TDC at 360°.
  - **Blocking (typecheck):** `tsc -b` fails on `CutawayScene.tsx:38` (`Side` imported but unused, TS6133) and `CutawayScene.tsx:101` (`Gases` declared but unused, TS6196), so `npm run build` fails until those go.
  - **Performance suggestion:** `SoundLab` remounts on every preset change (keyed by `spec.id`), so `CutawayScene` rebuilds every Engine Lab geometry and `disposeAll`s it, along with a new WebGL context, each time. A module-level geometry cache per quality tier, never disposed and shared across mounts, would make preset switches cheaper. Codex's e2e test clicks through seven presets with audio running.
  - **Check:** the diesel shows an ignition flash at the injector (scaled up). If that is intended as injection, the legend and caption should say "injection" rather than "spark" (the 2D schematic already does).

### Codex: integrated mechanical cutaway and review fixes

The production sound lab now lazy-loads `EngineCutaway` and `CutawayScene`. It opens on a detailed cylinder, matching the reference image, with Whole engine available for complete inline/V/boxer layouts. The same frame bus drives the 3D piston, rods, crank, springs, valves and half-speed cams, together with the sound and timing displays. The secondary timing schematic stays in a native details element; WebGL failure shows its own accessible diagram fallback. Shared crankpins are drawn once, and the geometry/phasing helpers have constant-rod-length and bank-placement tests.

Codex completed the reviewed mobile/accessibility fixes: rev controls beside the dial, actual RPM exposed without continuous announcements, limiter entry/exit status, cancellation of owned firing animations, and valid 320px layout. The 3D canvas renders on demand, sharing a geometry set across its cylinders; the whole-engine view uses cheaper geometry on larger layouts. Camera orbit/zoom/reset and cylinder selection have buttons as well as gestures. Narrow-screen framing was visually checked. Diesel cues are injection rather than spark plugs. This remains generic illustrative DOHC teaching geometry, rather than an OEM reconstruction.

Validation includes the production build, full unit/lint checks, desktop/phone browser checks of actual rendered 3D motion and camera/selection controls, WebGL fallback, rev response, reduced-motion cleanup, and the existing learning/tour flows. Titles/descriptions are unchanged, so no share-image regeneration is needed for this refinement.

## Work split for the 3D cutaway (Akshay's instruction, 14 Nov 2026)

Akshay looked at the unfinished 3D cutaway and divided it: **Claude does all nine V10 presets; Codex takes everything else.** As of 15:40 the 3D view is not wired into the page, `tsc -b` fails on `CutawayScene.tsx:38` and `:101`, and `eslint` also reports two `react-hooks/refs` errors at `EngineCutaway.tsx:162`.

- **Claude: V10s.** Viper, Magnum, Triton, BMW S85, Gallardo 5.0, Audi/Lamborghini 5.2, Lexus LFA, Carrera GT and VW V10 TDI.
  - **New files:** `V10Cutaway.tsx` (lazy default export, same props as `EngineCutaway`: `spec, events, bankAngle, sense, bus, reduced`), `v10Layout.ts` and `v10Layout.test.ts`.
  - **Page:** a small lazy branch in `SoundLabPage.tsx` that renders `V10Cutaway` when `spec.cylinders === 10`, placed just above the 2D `CylinderLayout`. The 2D layout stays in place, so its test ids still work.
  - **Codex's files:** Claude will not edit `CutawayScene.tsx`, `EngineCutaway.tsx` or `cutawayMath.ts`.
- **Codex: every other preset** (inline-3/4/5/6, flat-4/6, both V6s, both V8s):
  1. Fix the type and lint errors above.
  2. Render `EngineCutaway` in the same spot for `spec.cylinders !== 10`. The props are identical by design, so it is a one-line branch beside Claude's.
  3. Keep, or drop, the V10 handling in `CutawayScene` as you prefer; V10 presets will not reach it.
- **To avoid edit collisions in `SoundLabPage.tsx`:** Claude adds the V10 branch first and posts "V10 cutaway done". Please add the non-V10 branch after that.

## Claude: V10 cutaway done (14 Nov 2026)

The nine V10 presets now use a dedicated scene inside Codex's `EngineCutaway`, which keeps its own UI, test ids, controls and accessibility. Every other preset still uses `CutawayScene`.

- **Files:**
  - **New:** `V10Scene.tsx` (same props as `CutawayScene`; invalidates on each bus frame for demand rendering), `v10Layout.ts` (pure maths) and `v10Layout.test.ts` (30 tests).
  - **`EngineCutaway.tsx`:** branches on `isV10(spec)` for the scene and the camera framing. It also sets `data-scene="v10" | "generic"`, adds a partner-cylinder note to the status, and adds a non-live `v10-throw-note`.
  - **`tests/e2e/sound-cutaway.spec.ts`:** asserts the V10 scene, the partner label and the shared-pin note.
- **Whole engine view:**
  - Ten cylinders on five throws, banks at the true angle (90°/72°/68°, eased by the experiment). Bank B sits one rod width behind A, so a shared crankpin carries both rods and split pins (Gallardo 5.0, Triton, TDI, or the "fire evenly" experiment) show 18° apart.
  - Bank A is mirrored so both banks exhaust outwards. Every repeated part is an `InstancedMesh` with the mirror on the bank-A objects, so the scene costs a few dozen draw calls in place of hundreds. In headless SwiftShader it ran at 18 fps against the generic scene's 8 fps.
  - Exhaust headers, collectors and tailpipes, with glowing pulses that leave at exhaust-valve opening and travel at one speed, so pulses sharing a pipe are spaced by their firing gaps. Separate-exhaust presets keep two pipes; the shared-exhaust Magnum and Triton merge into one.
- **Cylinder cutaway (detail view):** the selected cylinder's whole throw, both banks, with each bank's casting clipped at the middle of the vee: an Engine Lab-style V section, crank, rods, valvetrain, gas and headers. The TDI shows an injector and a spray flash, never a spark plug.
- **Codex's review:**
  - The flywheel now turns at the crank's angle in the scene, `lean + mirror·φ`.
  - The canvas labels keep Codex's prefixes ("…of cylinder N…", "…of the 10-cylinder…"), so screen-reader phrasing is consistent and the spec's locators still match.
- **Not mine:** I left Codex's uncommitted `CutawayScene.tsx` fix (firing-angle cache) unstaged for Codex to commit.
- **Checked:**
  - **Static checks and tests:** `tsc` and `eslint .` clean, `vitest` 1092/1092.
  - **Headless browser, all nine V10s:** both views render and move while running and stay still before Start and under reduced motion. The notes are correct: shared vs split pins, separate vs shared exhaust. The phone has no sideways scroll, and no console errors appeared.
  - **Full e2e suite on a fresh production build:** 75 passed, 8 skipped by design, 1 failed. I ran it on port 4174 because a `vite preview` from Codex's run still held 4173. The one failure is `seo.spec.ts` comparing the canonical with that port, while the build bakes in `http://localhost:4173` (prerender's `PREVIEW_ORIGIN`). That is an artefact of my port, not a regression; SEO and prerendering are untouched. Every sound spec passed, including `sound-cutaway`.
- Committed and pushed by Claude on Akshay's authorization. Codex, please check the V10 cutaway on the live site after Pages deploys.

### Codex: final cutaway verification

Codex verified the deployed `6ae6f37` shared cutaway and `c4995f5` dedicated V10 scene on GitHub Pages. The live Viper's whole-engine and paired-bank views render correctly on desktop and phone; pistons, cams, valves and exhaust pulses move with playback, and no browser errors appeared. The generic inline-four also passed live motion, camera/reset and desktop-to-phone resize checks. Local screenshots are retained as release evidence.

A final generic-scene fix includes the cylinder's firing angle and rotation sense in its pose cache. Crankpin experiments now update valves, gas and the mechanism while paused, and returning to production restores the complete frozen pose. A production-browser regression compares the rendered scene before and after that round trip on desktop and Pixel 7. It compares CSS-resolution interior pixels to avoid fractional-scroll borders.

The final root-path production build passed. Targeted production checks for the cutaway, paused-pose regression and SEO passed (13 passed, 5 intentionally skipped duplicate mobile crawler checks). This also resolves Claude's alternate-preview-port canonical test failure by running against the configured `http://localhost:4173` origin. Type checking, the changed-file lint checks and all four pure cutaway-math tests passed; Claude's V10 release passed all 1,092 unit tests and the rest of the browser suite as recorded above. Neither page metadata nor share images changed.

## Continuous exhaust gas: Claude continuation (16 Nov 2026)

Codex continued Claude's unfinished exhaust implementation after Claude reached its usage limit. The shared approach is retained: `exhaust.ts` describes plumbing and valve-timed flow, `exhaustGas.ts` builds a continuous turbulent gas field, and `ExhaustSystem.tsx` updates it through the existing frame bus. Both `CutawayScene` and `V10Scene` use this renderer, covering all 19 Sound Lab presets in whole-engine and detailed cutaway views. Moving exhaust-point markers are removed.

Gas leaves during exhaust-valve opening, with blowdown followed by the piston's push. It follows the headers, collectors and tailpipes, cools along the route, then widens, slows and fades as an outlet plume. Detailed cutaways fade flow at their header stubs. Shared and separate bank exhaust routing and each cylinder's firing phase remain preset-driven. Stopped engines and reduced motion show no exhaust flow. Thermal colours, turbulence and haze are illustrative teaching effects, not CFD results; audio remains synthesis rather than measured recordings.

The renderer review corrected inward triangle winding, aligned gas with the visible pipes' piecewise curves, kept detailed flow inside its header bore, and removed a discontinuity in the wrapped swirl phase. Geometry and noise tests cover outward normals, finite attributes and valid indices, pipe alignment at joins, header-bore containment, and deterministic turbulence. Future changes should extend these shared files and the existing scenes rather than add another exhaust renderer.

Release validation: all 1,187 unit tests, ESLint and the GitHub Pages production build passed. The 22 focused desktop/phone browser checks cover actual gas-shader draws for all 19 presets, advancing flow, diesel shading, stop/restart, reduced motion, bank experiments, camera controls and fallback. After tightening whole-engine framing around the actual pipes and plume bounds, the six cutaway/paused-pose browser checks passed again.

## Claude exhaust refinement: completion review (16 Nov 2026)

Claude's next unfinished changes add view-dependent pipe transparency, ray-based gas thickness, header heating, one plume per outlet, throttled bank-angle rebuilds and closer framing of the dense plume. Codex retained those changes and the existing shared renderer. Inline engines now face their exhaust towards the camera, using the same mirror transform for mechanism, plumbing and framing.

The review completed the missing outlet integration: plume slot masks and per-cylinder outlet travel times now reach the shader, so every connected cylinder contributes after its full route has filled. Flow is normalized across the connected cylinders, with flow-weighted cooling, rather than stacking duplicate plumes. A fractional-frequency noise warp was replaced by a periodic warp to remove a discontinuity when the flow offset wraps.

Header heating now consumes elapsed frame-bus time once, so repeated camera redraws do not overheat the metal and skipped bus ticks do not slow it. Stopped/reduced-motion views clear heat and flow. Shader warmup happens once per material, after the exhaust has real geometry, and targets only the exhaust group. Bank rebuilds stay throttled, settle even while stopped, and dispose replaced geometry.

Regressions cover the combined outlet masks/delays, new ray attributes, heat lag and cooling, repeat/skipped bus ticks, paused bank settling, geometry disposal and real GPU heat/outlet-time uniforms.

Completion checks: all 1,196 unit tests and ESLint pass. The full production browser suite passes on desktop and phone: 110 passed, with 10 intentional device-specific/duplicate checks skipped. This includes every production engine, pipe heating, audio, the WebGL fallback, course navigation, progress, certificates, tours, phone page widths and crawler-visible HTML. No page metadata or routes changed.
