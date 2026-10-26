import { Suspense, useEffect, ViewTransition } from 'react'
import { Outlet, ScrollRestoration } from 'react-router'
import { Header } from './Header'
import { Footer } from './Footer'
import { TourHost } from '@/features/tour/TourHost'
import { TourInvite } from '@/features/tour/TourInvite'
import { ToastHost } from './ToastHost'

export function AppShell() {
  // Marks the moment the app has taken over the prerendered HTML (buttons work from here on); used by browser tests.
  useEffect(() => {
    document.documentElement.dataset.app = 'ready'
  }, [])
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-cyan focus:px-3 focus:py-2 focus:text-ink">
        Skip to content
      </a>
      <Header />
      <main id="main" className="flex-1">
        {/* The router updates inside React transitions, so a route change cross-fades the page (timing in globals.css). */}
        <ViewTransition>
          <Suspense fallback={<div className="p-10 text-center text-steel-400" role="status">Loading…</div>}>
            <Outlet />
          </Suspense>
        </ViewTransition>
      </main>
      <Footer />
      <ToastHost />
      <TourInvite />
      <TourHost />
      {/* Key by path on the initial load so a fresh (or prerendered) page never inherits another page's scroll offset. */}
      <ScrollRestoration getKey={(loc) => (loc.key === 'default' ? loc.pathname + loc.search : loc.key)} />
    </div>
  )
}
