# Codebase Archaeologist: Product Specification

## Phase 1: public repository explorer

**Users:** developers onboarding to an unfamiliar JavaScript or TypeScript project.

**Promise:** Understand a public repository's high-level structure and supported static import relationships, with every displayed relationship tied to a file and commit.

### User journey

1. Enter a GitHub repository URL or `owner/repository` and a branch.
2. Resolve that branch to one commit SHA and analyze only that immutable revision.
3. Inspect project and directory relationships in the graph, then search files and inspect source.
4. Select a node or file to see verified import evidence, unresolved imports, and a commit-pinned GitHub link.
5. Export the visible graph as SVG or clear the in-memory analysis.

### Phase 1 scope

- Public GitHub repositories, anonymous REST API access, JavaScript and TypeScript source.
- Static import and re-export extraction; relative extension and index resolution; package references; unresolved specifiers remain visible.
- Bounded tree and blob reads, deterministic graph presentation, a data-derived summary, and SVG export.
- No authentication, persistence, AI, execution of repository code, runtime call tracing, or claim of full semantic analysis.

### Evidence policy

An `imports` edge is a verified static source declaration. A `contains` edge is derived from a path's directory structure. Package detection comes from manifests. An unresolved module stays unresolved. Any future heuristic must be labelled as an inference and must carry its rule and evidence.

### Phase 1 acceptance criteria

- [x] A real public GitHub repository and branch resolve to a pinned SHA.
- [x] The analysis is derived from GitHub tree and blob data at that SHA.
- [x] Limits and partial-result warnings are enforced server-side.
- [x] Internal, package, and unresolved imports are represented distinctly.
- [x] File selection and graph selection stay synchronized; source links use the pinned SHA.
- [x] The sample repository uses the same live analysis endpoint.
- [x] Search, filters, responsive panels, and SVG export work.
- [x] Unit/integration tests, typecheck, lint, and production build pass.
- [x] Vercel project-root and deployment steps are documented.

## Later phases

- **Phase 2:** path aliases and workspaces, richer exports, cycle and hotspot observations, with evidence and rule identifiers.
- **Phase 3:** bounded source-grounded static path exploration, clearly distinguished from runtime behavior.
- **Phase 4:** a C#/.NET adapter selected after parser evaluation.
- **Phase 5:** optional, bounded AI explanations only after deterministic evidence is reliable.
