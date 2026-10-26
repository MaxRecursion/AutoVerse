/**
 * The first paint of a prerendered page is the static HTML the build wrote.
 * Until the learner first navigates, components that would animate content
 * in on mount (Reveal) render it plainly instead, so React taking over the
 * static markup causes no flash. Always "static" on the server.
 */
let staticFirstPaint = typeof window === 'undefined'

export const isStaticFirstPaint = () => staticFirstPaint || typeof window === 'undefined'
export const setStaticFirstPaint = (value: boolean) => {
  staticFirstPaint = value
}
