# Repository Guidelines

## Project Structure & Module Organization

AutoVerse is a static-first React/TypeScript app. Pages live in `src/pages/`; shared UI in `src/components/`; simulations in `src/features/`; state in `src/stores/`; and shared logic in `src/lib/`. Educational JSON lives in `src/content/`, with topics at `topics/<category>/<topic-id>.json`. Public models, textures, and icons are in `public/`. Tooling is in `scripts/`, architecture notes in `docs/`, and deployment workflow in `.github/workflows/`.

## Build, Test, and Development Commands

- `npm run dev` starts the Vite development server.
- `npm run build` type-checks, bundles the app, and prerenders routes into `dist/`.
- `PUBLIC_BASE_PATH=/AutoVerse/ SITE_URL=https://maxrecursion.github.io/AutoVerse npm run build` builds the repository-subpath version for GitHub Pages.
- `npm run typecheck` runs the TypeScript project checks; `npm run lint` runs ESLint.
- `npm test` runs Vitest unit and component tests in jsdom.
- `npm run validate:content` checks content schemas and cross-references; add `-- --strict` to fail on warnings.
- `npm run test:e2e` runs Playwright browser tests when specs are present in `tests/e2e/`.

## Coding Style & Naming Conventions

Use strict TypeScript and two-space indentation. Name components PascalCase (`TopicCard.tsx`); functions, hooks, and utilities camelCase (`useMediaQuery.ts`); tests `*.test.ts` or `*.test.tsx`; and content files lowercase kebab-case. Import `src/` through `@/`. Keep simulation math pure and follow nearby patterns. ESLint enforces hooks and unused-variable rules.

## Testing Guidelines

Place unit and component tests beside the code they cover. Vitest includes `src/**/*.test.{ts,tsx}` and `scripts/**/*.test.ts`; there is no configured coverage threshold. For content changes, run `npm run validate:content` as well as relevant tests. Add browser-level specs under `tests/e2e/` when testing full navigation or interaction flows.

## Commits and Pull Requests

Use short, imperative commit subjects, such as `Add transmission lesson`. Work only on `main`; never create alternate branches or pull requests. After changes are complete and validated, commit directly to `main` and push immediately.

## GitHub Pages

`.github/workflows/deploy-pages.yml` builds `dist/` and deploys it on pushes to `main`. Keep `PUBLIC_BASE_PATH` and `SITE_URL` aligned with the repository path (`/AutoVerse/`) so assets, router links, prerendered links, and canonical URLs work under GitHub Pages.

## Content and Configuration

Keep lesson data aligned with the Zod schemas in `src/lib/schemas.ts`. Write original educational text and preserve accurate attribution and licensing metadata. The app stores user progress locally; do not add secrets or require runtime credentials for public content.
