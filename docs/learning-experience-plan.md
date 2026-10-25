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

## Next Work

1. **Tighten the learning loop:** align home resume, lesson continuation, and progress-page actions; add path milestones and an explicit completed-path state.
2. **Improve activity feedback:** explain incorrect quiz answers more clearly and show a concise result after a learner finishes a quiz or lab.
3. **Build depth:** expand sparse categories (tyres, HVAC, body/chassis, and driving) with prerequisite-aware lessons and carefully sourced history notes.
4. **Validate usability:** test first-time navigation, completion and refresh, keyboard and screen-reader feedback, narrow screens, and GitHub Pages subpaths.

Consider progress export or cross-device sync after the core learning flow is clear.
