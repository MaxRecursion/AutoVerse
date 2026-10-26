import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app/App'
import { router, routerReady } from '@/app/router'
import { setStaticFirstPaint } from '@/lib/boot'
import '@/styles/globals.css'

const container = document.getElementById('root')!

// Prerendered pages arrive with the page already in #root (scripts/prerender).
// Wait for the first route's code so React replaces that markup with the same
// page in one commit, instead of flashing the loading fallback.
setStaticFirstPaint(container.hasChildNodes())
const stopWatching = router.subscribe((state) => {
  if (state.navigation.state !== 'idle') {
    setStaticFirstPaint(false)
    stopWatching()
  }
})

await routerReady()

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
