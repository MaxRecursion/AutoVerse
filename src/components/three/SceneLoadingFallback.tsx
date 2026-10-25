import { useProgress } from '@react-three/drei'

interface SceneLoadingFallbackProps {
  /** True until the scene has drawn its first frames (or the caller's own readiness signal). */
  pending?: boolean
  /** What is being prepared, e.g. "Preparing 3D scene…". */
  label?: string
}

/**
 * DOM overlay inside the scene while it is not drawn yet: the canvas is
 * blank while three.js compiles shaders and builds geometry, and while drei
 * loaders fetch models (then a progress bar shows). It goes once the first
 * frames are on screen, so a lab never shows an empty canvas.
 */
export function SceneLoadingFallback({ pending = false, label = 'Preparing 3D scene…' }: SceneLoadingFallbackProps) {
  const { active, progress } = useProgress()
  const loadingAssets = active && progress < 100
  if (!pending && !loadingAssets) return null
  return (
    <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center" role="status" aria-live="polite" data-testid="scene-loading">
      <div className="panel flex w-56 flex-col gap-2 px-4 py-3">
        <span className="flex items-center gap-2 text-xs text-steel-300">
          <span aria-hidden className="size-2 shrink-0 rounded-full bg-cyan motion-safe:animate-pulse" />
          {loadingAssets ? 'Loading model…' : label}
        </span>
        <div className="h-1 overflow-hidden rounded bg-graphite-700" aria-hidden>
          {loadingAssets ? (
            <div className="h-full bg-cyan transition-[width]" style={{ width: `${Math.round(progress)}%` }} />
          ) : (
            <div className="h-full w-full bg-cyan/60 motion-safe:animate-pulse" />
          )}
        </div>
        {loadingAssets && <span className="annotation">{Math.round(progress)}%</span>}
      </div>
    </div>
  )
}
