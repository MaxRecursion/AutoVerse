# Repository Guidelines

## Project Structure & Module Organization

AutoVerse is a static-first React and TypeScript learning app. Application code lives in `src/`: route pages in `src/pages/`, reusable UI in `src/components/`, simulations in `src/features/`, state in `src/stores/`, and shared logic in `src/lib/`. Educational JSON is under `src/content/`; topic files follow `topics/<category>/<topic-id>.json`. Public models, textures, and icons live in `public/`. Build, prerender, validation, and asset utilities are in `scripts/`; architecture notes are in `docs/`.

## Build, Test, and Development Commands

- `npm run dev` starts the Vite development server.
- `npm run build` type-checks, bundles the app, and prerenders routes into `dist/`.
- `npm run typecheck` runs the TypeScript project checks; `npm run lint` runs ESLint.
- `npm test` runs Vitest unit and component tests in jsdom.
- `npm run validate:content` checks content schemas and cross-references; add `-- --strict` to fail on warnings.
- `npm run test:e2e` runs Playwright browser tests when specs are present in `tests/e2e/`.

## Coding Style & Naming Conventions

Use TypeScript with the repository's strict compiler settings and two-space indentation. Use PascalCase for React component files and exports (for example, `TopicCard.tsx`), camelCase for functions, hooks, and utilities (`useMediaQuery.ts`), and `*.test.ts` or `*.test.tsx` for tests. Name content files with lowercase kebab-case. Use the `@/` alias for imports from `src/`. Keep simulation math testable as pure functions and follow nearby component patterns; ESLint enforces hooks and unused-variable rules.

## Testing Guidelines

Place unit and component tests beside the code they cover. Vitest includes `src/**/*.test.{ts,tsx}` and `scripts/**/*.test.ts`; there is no configured coverage threshold. For content changes, run `npm run validate:content` as well as relevant tests. Add browser-level specs under `tests/e2e/` when testing full navigation or interaction flows.

## Commits and Pull Requests

This checkout has no Git history available to establish an existing commit convention. Write short, imperative commit subjects, such as `Add transmission lesson`. Pull requests should explain the user-facing change, link related issues when applicable, list validation commands run, and include screenshots for visual changes.

## Content and Configuration

Keep lesson data aligned with the Zod schemas in `src/lib/schemas.ts`. Write original educational text and preserve accurate attribution and licensing metadata. The app stores user progress locally; do not add secrets or require runtime credentials for public content.
