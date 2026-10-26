/**
 * Build-time renderer: turns a route into the same HTML the app renders in
 * the browser, so search engines and AI crawlers that do not run JavaScript
 * read real headings, text and links. Used by scripts/prerender; never
 * shipped to browsers.
 */
import { StrictMode } from 'react'
import { renderToString } from 'react-dom/server'
import { createStaticHandler, createStaticRouter, StaticRouterProvider } from 'react-router'
import { routes } from '@/app/routes'
import { TooltipProvider } from '@/components/ui/tooltip'

export interface RenderResult {
  html: string
  status: number
}

/** `pathname` is the app path ("/topics/four-stroke-cycle"); `basename` is the deploy subpath ("/AutoVerse/"). */
export async function render(pathname: string, basename = '/'): Promise<RenderResult> {
  const base = basename.replace(/\/+$/, '')
  const handler = createStaticHandler(routes, { basename: base || '/' })
  const context = await handler.query(new Request(new URL(`${base}${pathname}`, 'http://autoverse.local')))
  if (context instanceof Response) throw new Error(`route ${pathname} answered with a redirect (${context.status})`)
  const router = createStaticRouter(handler.dataRoutes, context)
  const html = renderToString(
    <StrictMode>
      <TooltipProvider delayDuration={300}>
        <StaticRouterProvider router={router} context={context} hydrate={false} />
      </TooltipProvider>
    </StrictMode>,
  )
  return { html, status: context.statusCode }
}
