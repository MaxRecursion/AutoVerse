# Repository Guidelines

## Project Structure

AutoVerse is a static-first React/TypeScript app. Pages are in `src/pages/`, shared UI in `src/components/`, simulations in `src/features/`, state in `src/stores/`, and shared logic in `src/lib/`. Lessons are JSON under `src/content/topics/<category>/`; public models and icons are in `public/`. Tooling lives in `scripts/`, architecture notes in `docs/`, and GitHub Pages deployment in `.github/workflows/`.

## Build, Test, and Development

- `npm run dev` starts Vite locally; `npm run preview` serves the production build.
- `npm run build` type-checks, bundles, and prerenders `dist/`.
- `PUBLIC_BASE_PATH=/AutoVerse/ SITE_URL=https://maxrecursion.github.io/AutoVerse npm run build` builds for GitHub Pages.
- `npm run typecheck` and `npm run lint` check TypeScript and ESLint.
- `npm test` runs Vitest; `npm run test:e2e` runs Playwright specs when present.
- `npm run validate:content -- --strict` validates lesson schemas and cross-references.

## Style and Naming

Use strict TypeScript and two-space indentation. Components use PascalCase (`TopicCard.tsx`); utilities and hooks use camelCase (`useMediaQuery.ts`); content files use lowercase kebab-case. Import app code through `@/`. Keep simulation math pure and follow nearby patterns. ESLint checks hooks and unused variables.

## Testing

Place unit and component specs beside the code as `*.test.ts` or `*.test.tsx`; scripts use `*.test.ts`. No coverage threshold is configured. For lesson-data changes, run strict content validation and relevant tests. Use `tests/e2e/` for full navigation or interaction flows.

## Commits and Pull Requests

Use short, imperative commit subjects (for example, `Add transmission lesson`). Work directly on `main`; never create alternate branches or pull requests. After changes are validated, commit to `main` and push immediately.

## GitHub Pages

`.github/workflows/deploy-pages.yml` deploys `dist/` on pushes to `main`. Keep `PUBLIC_BASE_PATH` and `SITE_URL` aligned with `/AutoVerse/` so assets, router links, prerendered links, and canonical URLs work at the repository subpath.

## Content and Learning Flow

Keep topic JSON aligned with `src/lib/schemas.ts`. Write original educational text and retain accurate source and licensing metadata. User progress stays in this browser; do not add secrets or runtime credentials. Maintain `docs/learning-experience-plan.md` as shared product guidance. Resolve the active path from recent lessons via `features/progress/paths.ts`; reuse `PathAction` so home and progress show the same start, continue, and completion states. Lesson pages should show route position and the matching next step. Optional `historyNote` entries include a person/team, contribution, year, concise anecdote, and credible source URL; distinguish invention, patent, and production milestones without unsupported sole-inventor claims.
