# Architecture

## Phase 1 runtime flow

```text
React/Vite client
  └─ /api/analyze, /api/source, /api/health ──> Vercel rewrites ──> api/router.ts
                                                     ├─ validate and dispatch
                                                     ├─ GitHub REST metadata/branch/tree
                                                     └─ bounded blobs ─> deterministic analyzer

Normalized analysis response ──> React Flow graph, file explorer, evidence panel
```

The browser never supplies a fetch URL to the server. Server GitHub requests use a fixed `https://api.github.com` origin. Every analysis resolves a branch once and uses the resulting commit SHA for tree and blob reads. The client stores the result only in page state. The source endpoint verifies that the requested path is a supported blob in the requested commit tree before returning it.

## Code boundaries

- `src/lib/validation` and `src/lib/graph`: browser-safe shared contracts and graph transformations.
- `src/features/analysis`: request lifecycle state and selection context.
- `src/components`: repository controls, explorer, graph, and evidence views.
- `lib/server/github`: fixed-origin GitHub access, timeout handling, and bounded concurrency.
- `lib/server/analysis`: language adapter and normalized graph construction, independent of HTTP/UI.
- `api/router.ts`: one Vercel Node.js Web Handler dispatches the three fixed API routes. `vercel.json` rewrites preserve the public route URLs and send a validated route key to the shared entry point.
- `lib/server/routes`: isolated request handlers shared by Vercel and Vite.
- Vite development and preview middleware dispatch the same handlers locally, so local analysis does not require Vercel CLI or credentials.

## Graph semantics

Nodes represent project, directory/module, source file, and external package records. `contains` means a path is nested under a directory. `imports` edges record the source path, line, original module specifier, and whether the target was resolved. `references-package` edges identify an external package specifier. Static imports are evidence; the analyzer does not infer function calls or runtime execution.

The TypeScript compiler API is used only to parse source syntax and discover import/export declarations. Repository code is never loaded or executed. A language-adapter boundary keeps parser selection separate from graph normalization.

## Resource budgets

The Phase 1 defaults live in `lib/server/security/budgets.ts`: at most 2,500 eligible tree entries, 180 parsed source files, 80 KiB per source blob, 1 MiB total downloaded source/config text, eight concurrent blob requests, a 25-second analysis deadline, 500 graph nodes, 1,200 edges, 2,000 evidence items, and a 3.6 MB analysis response. A GitHub request has an 8-second timeout and at most one retry for transient transport or 5xx failures. Source preview is capped at 96 KiB. The values are deliberately conservative for an anonymous, synchronous serverless endpoint and are not promises about plan capacity. Any cap or API truncation marks the result partial.
