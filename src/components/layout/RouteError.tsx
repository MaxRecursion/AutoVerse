import { isRouteErrorResponse, Link, useRouteError } from 'react-router'

export function RouteError() {
  const error = useRouteError()
  const message = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : error instanceof Error ? error.message : 'Unknown error'
  return (
    <main className="mx-auto grid min-h-dvh max-w-xl place-content-center gap-4 px-6 text-center">
      <p className="eyebrow text-danger">Something went wrong</p>
      <h1 className="text-3xl font-semibold">This page stalled.</h1>
      <p className="font-mono text-sm text-steel-400">{message}</p>
      <Link to="/" className="text-cyan underline-offset-4 hover:underline">
        Back to AutoVerse
      </Link>
    </main>
  )
}
