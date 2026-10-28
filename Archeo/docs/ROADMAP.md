# Roadmap

## Phase 1 — functional MVP (complete)

Implemented and verified public GitHub analysis, commit pinning, bounded JS/TS import extraction, interactive graph, searchable source explorer, evidence details, summary, and SVG export. The deployment path is documented in `README.md`; deployment itself requires linking the repository in the user's Vercel account.

## Phase 2 — architecture intelligence

Add practical TypeScript path aliases and workspace boundaries; improve grouping/layout and report export; identify cycles, highly connected modules, and dependency hotspots as observations. Each result must include a rule and source/graph evidence.

## Phase 3 — request-flow tracing

Add bounded static call/path exploration for explicitly supported syntax. Show each source hop. Mark inferred links and explain limits such as dynamic imports, reflection, DI, generated code, or unsupported syntax. Do not describe import graphs as runtime traces.

## Phase 4 — C#/.NET

Evaluate parser options first. Add a language adapter for solution/project references, namespaces, declarations, using directives, and selected framework conventions where evidence supports them. Keep semantic limitations explicit and preserve the normalized graph.

## Phase 5 — optional AI explanations

Only after deterministic analysis is dependable, consider opt-in explanations from bounded snippets and graph facts. Keep the core product useful without an AI provider; label generated text, treat source as hostile input, and validate claims against evidence.
