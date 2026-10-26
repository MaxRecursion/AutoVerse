import { createBrowserRouter } from 'react-router'
import { routes } from './routes'

export { routes }

export const router = createBrowserRouter(routes, { basename: import.meta.env.BASE_URL })

/** Resolves once the first page's lazy route module has loaded, so React never paints the loading fallback over prerendered HTML. */
export function routerReady(): Promise<void> {
  if (router.state.initialized) return Promise.resolve()
  return new Promise((resolve) => {
    const unsubscribe = router.subscribe((state) => {
      if (!state.initialized) return
      unsubscribe()
      resolve()
    })
  })
}
