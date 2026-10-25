let cached: boolean | null = null

/** Detects WebGL support once. `?nowebgl` in the URL forces the non-3D fallback (for testing). */
export function hasWebGL(): boolean {
  if (cached !== null) return cached
  try {
    if (typeof window === 'undefined') return (cached = false)
    if (new URLSearchParams(window.location.search).has('nowebgl')) return (cached = false)
    const canvas = document.createElement('canvas')
    cached = !!(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    cached = false
  }
  return cached
}
