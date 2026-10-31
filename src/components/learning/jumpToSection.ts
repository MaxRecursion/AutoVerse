/** Scrolls to a lesson section and moves keyboard focus to its heading. */
export function jumpToSection(id: string, reduced: boolean) {
  document.getElementById(id)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
  const heading = document.getElementById(`${id}-heading`)
  if (heading) {
    heading.tabIndex = -1
    heading.focus({ preventScroll: true })
  }
}
