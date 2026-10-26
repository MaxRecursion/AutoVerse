/**
 * Whether the product tour is open. The tour visits real pages (a lesson, a
 * lab) to point at things; while it does, nothing the page records on its own
 * (visits, "read" evidence, passive mission ticks) may count as the learner's
 * progress. Lives outside any store so stores can consult it without cycles.
 */
let active = false

export const setTourActive = (value: boolean) => {
  active = value
}
export const isTourActive = () => active
