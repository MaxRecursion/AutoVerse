import { Logo } from './Logo'

/**
 * Shown by the router while the first page's code-split route module loads
 * (the root route's `HydrateFallback`). It mirrors the shell's header bar so
 * the page does not jump when the real shell replaces it.
 */
export function AppLoading() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-graphite-950/85 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-4 px-4 sm:px-6">
          <Logo />
        </div>
      </header>
      <main className="grid flex-1 place-items-center p-10">
        <p className="eyebrow motion-safe:animate-pulse" role="status">
          Loading AutoVerse…
        </p>
      </main>
    </div>
  )
}
