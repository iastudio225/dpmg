# AGENTS.md — DPMG

Internal operational-request management app (multi-agency). Monorepo: `apps/api` (Express), `apps/web` (React+Vite), `packages/shared` (Zod/types), `database/prisma` (schema+migrations).

## Commands

Run from repo root unless noted.

- Dev (both): `pnpm dev` — API on :3001, web on :5173 (Vite proxies `/api` → :3001).
- Dev single: `pnpm dev:api` / `pnpm dev:web`.
- Typecheck: `pnpm typecheck` (both) or `pnpm --filter @dpmg/api typecheck` / `@dpmg/web typecheck`.
- Lint: `pnpm lint`.
- Build: `pnpm build`.
- API tests: `pnpm --filter @dpmg/api test` (runs the fixed list in `apps/api/package.json`).
- Web tests: `pnpm --filter @dpmg/web test`.
- Single API test file: `pnpm --filter @dpmg/api exec tsx --test src/<file>.test.ts`.
- Single web test file: `pnpm --filter @dpmg/web exec tsx --test tests/<file>.test.tsx`.
- Prisma client: `pnpm db:generate` (schema lives at `database/prisma/schema.prisma`, not in apps/api).
- Migrations: `pnpm db:migrate` (deploy) — applied via `prisma migrate deploy`.
- Push schema (dev only): `pnpm db:push`.
- Seed demo data: `pnpm db:seed` (demo accounts, default password shown at end).
- Create first admin: `pnpm db:seed:admin`.

## Monorepo boundaries

- `packages/shared` exports `.` (types) and `./zod` (Zod schemas). It must be **built** (`pnpm --filter @dpmg/shared build`) after any change to `src/` before the API or web will see new types/schemas — both consume `dist/`, not `src/`.
- Prisma schema/migrations are under `database/prisma/`; API references them via `--schema=../../database/prisma/schema.prisma`.
- API tests import `src/test-env.ts` as the very first import; it validates `TEST_DATABASE_URL` and overrides `DATABASE_URL` to the test DB. Never let tests run against `dpmg`.

## Environment

- `.env` at repo root is loaded by `apps/api/src/load-env.ts` (walks up to 6 dirs). `.env` and `.env.test` are gitignored; `.env.example` is the template.
- `TEST_DATABASE_URL` is required for API tests and must point at a DB named exactly `dpmg_test`, distinct from `DATABASE_URL`. The validation in `test-env.ts` is strict (URL parsing, query-string allowlist).
- `SESSION_SECRET` optional in dev (min 32 chars); required in production.
- API loads env through `packages/shared/src/zod.ts` `envSchema`; invalid env exits the process.

## Testing quirks

- API tests run against `dpmg_test` only. Do not create/modify real demandes in `dpmg` (dev) or production DBs.
- Web tests use jsdom + node:test via tsx; mocks fetch (no real API). Async `useEffect` data loads need an extra `await act(...setTimeout(0))` after `renderPage`.
- API tests use `tsx --test` with an explicit file list in `package.json` — new test files must be added to that list to run in CI.

## Conventions

- Naming: files/dirs kebab-case, variables/functions camelCase, types/interfaces PascalCase, constants UPPER_SNAKE_CASE, React components PascalCase.
- Errors: `AppError` for business errors; Zod errors → 400; centralized handler in `middleware/errorHandler.ts`; don't catch in routes, let bubble.
- Auth: session-based (express-session + connect-pg-simple). Roles include `TECHNICAL_ADMIN` and `SUPER_ADMIN`; both can be global (nullable `structureId`). A user's roles live in `UserStructureRole`.
- Admin operations are audited in `AdminAuditLog` (actorId, action, targetType, targetId, details JSONB). Never log passwords/hashes/tokens/secrets in details.
- `mustChangePassword` flag triggers a blocking modal in `PrivateRoute` (frontend) and a gate in auth middleware (backend).
- Backend is authoritative for permissions; frontend mirrors restrictions only for display.
- No new demande statuses beyond the validated set in `demandeStatusSchema`; no `DFC_DELEGATE` role; no amount field in DFC control.

## Gotchas

- Prisma client is generated into `node_modules/@prisma/client`; regenerate after schema changes.
- `packages/shared/dist` is stale-prone: rebuild shared after editing it.
- Repository has no commit history (all files untracked); do not create commits unless asked.
- Do not restart the API without explicit instruction.
- Migrations must be applied to `dpmg_test` for tests; `dpmg` (dev) requires explicit authorization.