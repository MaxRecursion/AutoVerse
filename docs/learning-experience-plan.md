# Learning Experience Plan

This is the shared product and implementation guide for improving AutoVerse’s learning flow. Keep it current as work ships so future contributors, including Claude, can resume from the same priorities.

## What Is Already Here

AutoVerse has 34 complete lessons, three curated learning paths, four interactive labs, a vehicle system map, local lesson history, completion markers, bookmarks, and quiz scores. The main friction is orientation: the home page has a beginner route, but lesson pages primarily suggest a category neighbor, so learners can lose their place in a curated path. Completion is a button state rather than a clear “you finished / here is what comes next” moment. Progress is saved only in the current browser and device. Several categories have only one lesson, so breadth and depth remain uneven.

## Priorities

### 1. Make the next action obvious

On home, lesson, and progress screens, use the same path order and completion state. Show the learner’s current step, completed/total count, a compact progress bar, and one clear next action. After marking a lesson complete, immediately confirm the change and point to the next unfinished lesson. Keep a category fallback for lessons outside a path. State plainly that progress is local to this browser.

### 2. Teach through engineering history

Add optional, structured “Engineering history” notes to lesson content: a named person or team, the part or advance they contributed to, an approximate year when known, a short human anecdote, and a credible source link. Distinguish pioneers, patents, and practical popularization; avoid claiming a sole inventor when the history is shared or contested. Place notes near the relevant explanation and keep them concise.

### 3. Connect concepts to systems

Once the basic path is coherent, connect lessons to system-map nodes and labs with explicit “why this matters next” cues. Add small feedback after quizzes and labs, then expand thin categories (including tyres, HVAC, body/chassis, and driving) with prerequisite-aware lessons.

### 4. Validate the learning loop

Check a first-time learner can start, identify their place, complete a lesson, continue, refresh, and find the same state on the progress page. Verify keyboard and screen-reader feedback, narrow screens, direct links, and GitHub Pages subpaths.

## Shipped in the First Slice

Lesson pages now show their selected learning path (beginner path preferred when lessons overlap), current step, completed count, progress bar, and next unfinished lesson. Completing a lesson immediately updates that summary and the bottom-of-page continuation link. Lessons outside a curated path use their category order. Four core lessons now carry structured, sourced history notes: Bertha Benz and the early motor car, Otto and Langen's engine work, Duesenberg's production four-wheel hydraulic brakes, and Dunlop's practical tyre alongside Thomson's earlier pneumatic-tyre work. Progress remains local to this browser.

## Shipped in the Second Slice

Home, lesson, and progress pages now resolve the same current path from the most recently visited path lesson (the beginner route wins when paths overlap). Their primary action targets the same first unfinished lesson. The hero action changes from “Start Learning” to “Continue Learning” when there is history; the recent-lessons section is clearly secondary. Completing every available lesson produces a path-complete message and points to the next unfinished path.

## Shipped in the Third Slice: orientation, depth and people

**Diagnosis (from walking the running app as a first-time learner).** The nav was five peer links and the home page offered ~8 starting points; progress showed only on the lesson strip and `/progress`; lessons were a flat 14-section scroll with the live model at section 4 and the history note *before* anything had been learned; the route strip said "Next path step: …" while pointing at step 1 when the learner was on step 2; labs, the explorer and the map dead-ended; and only 4 of 34 lessons had a history note.

**Principles.** (1) One spine, three depths: every system is taught **Surface → Mechanism → Engineering**, with stories alongside. (2) Feedback comes from real actions — nothing is ticked on the learner's behalf. (3) One obvious next action everywhere, from a single resolver. (4) History is sourced or absent.

**What shipped**

- **Layers.** Every lesson has `layer` (`surface | mechanism | engineering`). `features/progress/curriculum.ts` owns the ladder order, per-layer progress and `resolveNextUp` — the *single* answer to "what next?" used by the header pill, hero, path card, lesson route strip and completion toast. It never mislabels an earlier unfinished step as "next": it names it as skipped.
- **System hubs.** `/learn/:category` is a descent ladder (rungs with progress, per-lesson status, "Up next"), one primary action (Start here / Continue), a progress ring, the system's lab and its engineers.
- **Lesson stages.** `Overview → See it work → Go deeper (optional) → Check → Story (optional)`, as a sticky rail and as the order of the page. Stage state is derived (`features/progress/stages.ts`) from evidence in `progress.lessons[topicId]`: the introduction's last paragraph dwelled on, every step read or played, any lab activity, quiz taken, a deeper panel opened or the Technical level chosen, a story opened. When the core stages are done a Finish button appears; "Mark complete anyway" remains for learners who want to skip ahead.
- **Feedback.** Header progress pill (ring + next lesson), toasts for newly completed stages, "core stages complete", lab missions and lesson completion (with the next lesson as a link), status on every ladder row, and a finish card that lists what was and was not covered.
- **Lab missions.** 3–4 per lab (`features/labs/missions.ts`), ticked from the lab store's `activity` record (user actions only — never the playback clock) plus the cues and parameter values that were actually shown. Persisted per lab.
- **Pioneers.** `src/content/pioneers.json` (26 engineers, 1782–1959) replaces per-lesson `historyNote`. Each entry has role, year, headline, an original-wording story, an optional `caution` (disputed credit, doubtful legends), linked lessons and parts, and ≥1 source with the date it was read. Shown as "The story behind it" in lessons, on the `/pioneers` timeline (era groups, system filter, search, deep links), as a "History" chip on the part inspector, in the hub's "Meet the engineers", in search, and in the no-JS prerender.
- **Navigation.** Primary nav is ordered like the descent: Explore the Car → Learn → Labs → Pioneers → My Progress. The system map stays reachable from Explore, the home page, the mobile menu and the footer.

**Content rule for history (see AGENTS.md).** Every claim must be on a page that was actually read; where the page does not say it, leave it out. The first pass of research caught several plausible-but-unsupported details (e.g. a 1902 Honold spark-plug claim, a bubble-car origin for the Mini, a fixed 1891 Panhard layout date). Distinguish invention, patent and production milestones; say so when credit is shared or contested; retell in your own words.

**How to add a pioneer.** Add an entry in `scripts/content/build-pioneers.py` (it generates `pioneers.json`; re-run it), citing a source you fetched; link `topicIds` (required) and `componentIds` (optional, shown on the part); run `npm run validate:content -- --strict` and `npx vitest run src/lib/pioneers.test.ts`.

## Next Work

1. **Cover the remaining lessons with stories.** 9 of 34 lessons have no linked engineer yet: alternator and charging, cooling, diagnosing warning signs, driveshafts and CV joints, gear ratios, lubrication, mechanical sympathy, pistons and crankshaft, routine maintenance. Add only where a source supports it (the Rzeppa CV joint was left out because the page read did not name his employer).
2. **Deepen quiz and lab feedback.** Explain *why* a chosen wrong answer is wrong; show a short result after a lab mission set; link wrong answers back to the step that teaches it.
3. **Build depth.** Expand sparse categories (tyres, HVAC, body/chassis, driving) with prerequisite-aware lessons at each layer.
4. **Validate usability.** Test first-time navigation end to end in Playwright (start → stages → finish → next → refresh → progress page), keyboard and screen-reader feedback, narrow screens, direct links, and GitHub Pages subpaths (`/AutoVerse/`).
5. **Carry layers into the system map and explorer** (completion rings on map nodes; "visited" markers on explorer systems).

Consider progress export or cross-device sync after the core learning flow is clear.
