# Repository Guidelines

## Project Structure & Module Organization

This is a Nuxt 4 + TypeScript app. Keep feature logic close to existing folders:

- `app.vue` and `nuxt.config.ts` define the app shell and runtime modules.
- `server/` contains backend runtime code (`config.ts`, `libs/`, `utils/`).
- `assets/` stores CSS, SQL scripts, JSON schema/data assets.
- `public/` stores static files served as-is (icons, `robots.txt`).
- `data/config.json` holds runtime config and database file paths (`data/*.db`).

## Build, Test, and Development Commands

- `pnpm install`: install dependencies.
- `pnpm dev`: run local development server.
- `pnpm build`: build production server/client bundles.
- `pnpm preview`: run the built app locally for verification.
- `pnpm generate`: generate static output where applicable.
- `pnpm format`: format `vue/ts/js/json` files with Prettier.

## Coding Style & Naming Conventions

Formatting is enforced by `.editorconfig` and `.prettierrc`:

- 4-space indentation, LF line endings, UTF-8, final newline.
- Single quotes and semicolons in TypeScript/JavaScript.
- Keep Vue templates readable; avoid dense one-line markup.

Naming:

- Use `camelCase` for variables/functions.
- Use descriptive utility filenames like `parseDateAsTimestamp.ts`.
- Keep SQL scripts in `assets/sql/` with verb-based names.

Prioritize reusing existing code rather than adding new functions. Place utility classes in either `utils/` (client-side code) or `server/utils` (server-side code). You should check whether the utility function is declared in other places.
Inline SQL statements are strictly forbidden.
When SSR code calls this app's own `/api` endpoints, service-side requests must use `useRequestFetch()` in server context so request identity, cookies, and quota bucket resolution stay consistent with direct API access.

## Testing Guidelines

There is no automated test framework configured yet. Required validation for changes:

1. Run `pnpm dev` and verify affected pages/API behavior.
2. Run `pnpm build` to catch compile/runtime integration issues.
3. Run `pnpm generate` when routes or static behavior change.

In each PR, include clear manual verification steps and expected outcomes.

## Commit & Pull Request Guidelines

Use Conventional Commits:

- `feat: add train route lookup cache`
- `fix: handle empty schedule payload`
- `chore: format server utils`

PRs should include:

- concise change summary and scope
- linked issue/task (if available)
- validation commands run
- screenshots for UI-visible changes

## Security & Configuration Tips

- Do not commit secrets or environment-specific credentials.
- Treat `data/config.json` as operational config; keep schema-compatible with `assets/json/configScheme.json`.
- Review `nuxt.config.ts` security settings carefully before relaxing headers or CSRF protections.
