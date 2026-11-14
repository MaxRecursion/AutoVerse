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
