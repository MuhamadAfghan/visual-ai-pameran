# Repository Guidelines

## Project Structure & Module Organization
This frontend is a Vite + React + TypeScript app.
- `src/app/`: app shell, routing, and providers (e.g., `router.tsx`, `auth-provider.tsx`).
- `src/pages/`: route-level screens (`*.page.tsx`).
- `src/types/`: shared TypeScript types (`*.types.ts`).
- `public/`: static assets served directly.
- Root config: `vite.config.ts`, `tsconfig*.json`, `eslint.config.js`, `tailwind.config.js`, `postcss.config.cjs`.

Follow `src/CONVENTIONS.md` when adding new folders such as `features/`, `components/`, `services/`, or `store/`.

## Build, Test, and Development Commands
Use npm scripts from `package.json`:
- `npm run dev`: start local development server with hot reload.
- `npm run build`: run TypeScript project build (`tsc -b`) then create production bundle.
- `npm run preview`: serve the built app locally for smoke checks.
- `npm run lint`: run ESLint for all `ts/tsx` files with zero warnings allowed.

## Coding Style & Naming Conventions
- Language: TypeScript + TSX with ES modules.
- Formatting (Prettier): semicolons on, double quotes, no trailing commas, `printWidth: 100`.
- Linting: ESLint v9 + `typescript-eslint` + React Hooks rules + Prettier compatibility.
- Naming (from `src/CONVENTIONS.md`):
  - Components: `kebab-case.tsx`
  - Pages: `kebab-case.page.tsx`
  - Types: `kebab-case.types.ts`
  - Helpers: `camelCase.ts`

## Testing Guidelines
No automated test runner is configured yet (no `test` script in `package.json`).
Until tests are added, require:
- `npm run lint` passing.
- `npm run build` passing.
- Manual validation for changed routes via `npm run dev` or `npm run preview`.

If introducing tests, prefer Vitest + React Testing Library and colocate as `*.test.ts(x)` near source files.

## Commit & Pull Request Guidelines
Current git history is minimal (`first commit`), so conventions are not yet established. Use this baseline:
- Commit messages: short, imperative, scoped when useful (example: `feat(auth): add protected route guard`).
- PRs should include: purpose, key changes, verification steps, linked issue (if any), and screenshots/video for UI changes.
- Keep PRs focused and small enough for fast review.
