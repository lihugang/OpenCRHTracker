# Task: admin users + train-provenance domain extraction (agent admin_users_provenance)

Extract shared domain operations for admin users and train-provenance APIs in /root/crhdata/OpenCRHTracker. v1 must keep EXACTLY its current external behavior. Work independently; do not ask questions.

## Read first

1. docs/api-v2-implementation-spec.md (sections 3.3, 11, 13, 14)
2. docs/api-v2-domain-modules.md (module mapping)
3. docs/api-v2-operation-index.md
4. v1 handlers (20):
   - server/api/v1/admin/users.get.ts
   - server/api/v1/admin/users/[userId]/memberships.get.ts, [groupId].put.ts, [groupId].delete.ts
   - server/api/v1/admin/users/qq-ban-list.post.ts, [qqNumber].delete.ts
   - server/api/v1/admin/users/quota/reset.post.ts
   - server/api/v1/admin/users/risk/clear.post.ts
   - server/api/v1/admin/users/security.get.ts
   - server/api/v1/admin/users/status.post.ts
   - server/api/v1/admin/train-provenance.get.ts
   - server/api/v1/admin/train-provenance/coupling-scan.get.ts, coupling-scan-tasks.get.ts
   - server/api/v1/admin/train-provenance/qrcode-scan.get.ts, qrcode-scan-tasks.get.ts
   - server/api/v1/admin/train-provenance/request-stats.get.ts
   - server/api/v1/admin/train-provenance/station-board.get.ts, station-board-tasks.get.ts
   - server/api/v1/admin/train-provenance/station-platform-refresh.get.ts
5. Their stores: server/services/adminUserStore.ts, adminTrainProvenanceStore.ts, userBanSecurityStore.ts, taskQueue/taskScheduler related stores, and server/utils/admin* if any.

## Conventions

Create exactly:

- server/domain/admin/users.ts -> getAdminUsers, getAdminUserMemberships, putAdminUserMembership, deleteAdminUserMembership, postAdminQqBanEntry, deleteAdminQqBanEntry, postAdminUsersQuotaReset, postAdminUsersRiskClear, getAdminUsersSecurity, postAdminUsersStatus, postAdminWebappTokensRevokeAll
- server/domain/admin/trainProvenance.ts -> getAdminTrainProvenance, getAdminTrainProvenanceCouplingScan, getAdminTrainProvenanceCouplingScanTasks, getAdminTrainProvenanceQrcodeScan, getAdminTrainProvenanceQrcodeScanTasks, getAdminTrainProvenanceRequestStats, getAdminTrainProvenanceStationBoard, getAdminTrainProvenanceStationBoardTasks, getAdminTrainProvenanceStationPlatformRefresh

Domain functions: plain internal typed inputs/outputs; no H3Event; no headers/cookies; no executeApi; no wire formatting; version-independent validation throws ApiRequestError with today's exact status/errorCode/userMessage.

v1 handlers keep: query/body parsing, v1-specific unknown-field rejection, executeApi options, v1 response formatting.

## Key design points

- Admin users: preserve exact member/group/qq-ban/quota/risk/security/status semantics, messages, and side effects (e.g., enqueueing tasks). Where a handler returns rows with numeric ids, domain returns raw numbers; v1 formats exactly as today.
- Train provenance: preserve all query params and response shapes; domain returns raw internal data including timetableId/emuId references where present so a later v2 adapter can attach mappings.
- Do not modify admin-core handlers (another agent owns them).

## Constraints

Do not modify export handlers, auth/public/oauth/feedback/notifications domains, package.json, nuxt.config.ts, frontend, docs, proto files; no v2 routes/manifest.

## Validation

`pnpm typecheck:server` must pass for your files.

## Report

Files created/changed; all exported signatures; confirmation v1 unchanged; judgment calls; typecheck result.
