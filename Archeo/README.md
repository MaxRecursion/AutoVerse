# Codebase Archaeologist

**Understand any codebase. See how everything connects.**

Codebase Archaeologist reads a public GitHub repository at a pinned commit and turns supported JavaScript and TypeScript imports into an interactive, source-backed architecture map. Phase 1 is deterministic: imports are parsed from source, directory structure comes from repository paths, and unresolved imports remain explicit.

## Phase 1 features

- Analyze a public GitHub repository by URL or `owner/repository` and branch.
- Resolve the branch once, then read the Git tree and blobs at its commit SHA.
- View project, module, file, npm package, Node built-in, and unresolved import nodes.
- Inspect static imports, re-exports, literal dynamic imports, CommonJS `require`, exported symbols, and evidence locations.
- Search the repository and graph, filter node kinds, collapse side panels, and switch between overview and file detail.
- Browse source and manifests at the pinned commit, export the visible graph as SVG, and clear page state.
- Run the sample repository through the same API and analyzer as user input.

### Supported inputs and limits

- Public GitHub repositories only. GitHub URLs must use `https://github.com/owner/repository`; `owner/repository` also works.
- JavaScript (`.js`, `.jsx`) and TypeScript (`.ts`, `.tsx`) static syntax. Root `tsconfig.json` and `jsconfig.json` `baseUrl`/`paths` aliases are supported when their targets are in the analyzed source set.
- Vite, React, Vue, Svelte, Angular, Next.js, Remix, Express, and Fastify are detected only when named in a package manifest.
- No runtime call graph, semantic TypeScript checking, package installation, source execution, private repository support, or AI-generated claims.
- Large trees and files can produce a clearly marked partial result. The current centralized budgets are documented in [docs/SECURITY.md](docs/SECURITY.md).
- SVG export is implemented. PNG export is not included in Phase 1.

## Stack and layout

- React 19, Vite 8, strict TypeScript, React Router, Tailwind CSS 4, shadcn-style local UI primitives, Lucide, React Flow, Zod, and highlight.js.
- One Vercel Node.js Function in `/api/router.ts` dispatches the three API routes; deterministic GitHub/source analysis lives in `lib/server`; client-safe schemas and graph transforms live in `src/lib`.
- No database, mandatory secret, authentication, AI service, or persistent analysis storage.

## Local development

Requires Node.js 20.19+ (Node 22 recommended) and npm.

```sh
npm ci
npm run dev
```

The Vite development middleware serves the same `/api/analyze` and `/api/source` handlers as Vercel. No secret is required. The public GitHub REST API applies its anonymous rate limit.

Commands:

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run preview
npm run test:e2e
```

`npm run test:e2e` builds the production assets and runs Playwright against Vite Preview. The UI tests stub HTTP responses; analyzer integration tests mock GitHub and do not depend on live GitHub availability. To try the real sample, click **sindresorhus/is** on the landing page.

## Environment variables

No environment variables are required. Copy `.env.example` only if you need a reminder of the optional setting.

- Optional `GITHUB_TOKEN`: server-side only; can raise GitHub REST API request quotas. Keep it in local server environment or Vercel Function environment variables. Never use a `VITE_*` name.

## Vercel deployment

Deploy this directory as its own Vercel project, separate from the parent AutoVerse project:

1. Import the Git repository into Vercel and set **Root Directory** to `Archeo`.
2. Select the Vite preset and Node.js 22. Keep the build command as `npm run build` and output directory as `dist` (also set in `vercel.json`).
3. Leave environment variables empty for the default public, anonymous experience. Optionally add a server-side `GITHUB_TOKEN` if you have authorization to use one.
4. Deploy. Vercel discovers `api/router.ts` as a Node.js Function. Explicit rewrites dispatch the three supported API paths to that function; the final SPA rewrite excludes API and asset paths.

The shared function has a 30-second Vercel maximum and the analyzer has a smaller internal 25-second budget. Source preview uses bounded GitHub requests. These are conservative request caps, not a guarantee that every repository fits a single function invocation. Vercel currently documents Node.js 22 and 24 runtimes; Node.js 22 is selected explicitly for this project. The 30-second cap is below the current Hobby plan's documented maximum. Review current [Node.js runtime versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), [function duration limits](https://vercel.com/docs/functions/configuring-functions/duration), and [function limits](https://vercel.com/docs/functions/limitations) before changing them.

## Security and privacy

The server accepts repository identity fields, never arbitrary URLs. GitHub API requests use a fixed origin. Branches are pinned to commit SHAs, source paths are checked against the commit tree, repository code is never executed, and analysis remains in page memory. Clear or reload to discard it. See [docs/SECURITY.md](docs/SECURITY.md).

## Development status

Phase 1 is the current deliverable. Phase 2 (workspace grouping and architecture observations), Phase 3 (bounded static path tracing), Phase 4 (C#/.NET adapter), and Phase 5 (optional AI explanations) are in [docs/ROADMAP.md](docs/ROADMAP.md).
