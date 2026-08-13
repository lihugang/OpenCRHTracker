# Task: v2 route files + final integration (agent routes)

Create the 100 real v2 route files and verify the full implementation in /root/crhdata/OpenCRHTracker. Work independently; do not ask questions.

## Read first

1. docs/api-v2-implementation-spec.md (full)
2. docs/api-v2-operation-index.md (authoritative path -> operation mapping)
3. server/utils/api/v2/v2OperationManifest.ts and executeV2Operation.ts (must exist; if missing, report and stop)
4. server/api/v1/** (to mirror paths exactly)

## Deliverables

1. Create exactly 100 route files under server/api/v2/** matching the operation index: `<v2 path>.<method>.ts` (e.g. server/api/v2/records/daily.get.ts, server/api/v2/auth/login.post.ts, server/api/v2/timetable/train/[trainCode]/history/[timetableId].get.ts). Each file is a real static file (no catch-all), containing roughly:
   import { defineEventHandler } from 'h3';
   import executeV2Operation from '~/server/utils/api/v2/executeV2Operation';
   export default defineEventHandler((event) => executeV2Operation(event, '<OperationName>'));
   No domain logic in route files.
2. Verify exactly 100 files with method counts 53 GET / 24 POST / 5 PUT / 6 PATCH / 12 DELETE.
3. Add `'/api/v2/notifications/send': { csurf: false }` to nuxt.config.ts routeRules if not already present.
4. Add package.json script `"exports:v2:migrate": "node scripts/exports-v2-migrate.mjs"` if not already present.
5. Run `pnpm typecheck:server`; fix integration errors (do not change proto/generated files; report missing messages).
6. Run `pnpm proto:check`.
7. If full `pnpm typecheck` is feasible and quick, run it; otherwise report why skipped.

## Constraints

Do not modify v1 handlers, frontend, public docs, proto sources. No version headers/body markers.

## Report

Route file count by method; deviations (should be none); nuxt.config/package.json diffs; typecheck results; blocked items.
