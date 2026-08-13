# Task: admin core domain extraction (agent admin_core)

Extract shared domain operations for the admin core APIs in /root/crhdata/OpenCRHTracker (everything except train-provenance and users; another agent owns those). v1 must keep EXACTLY its current external behavior. Work independently; do not ask questions.

## Read first

1. docs/api-v2-implementation-spec.md (sections 3.3, 11, 13, 14)
2. docs/api-v2-domain-modules.md (module mapping)
3. docs/api-v2-operation-index.md
4. v1 handlers (25):
   - server/api/v1/admin/anomaly-actions/delete-by-type.post.ts, delete-route.post.ts, anomaly-scan.get.ts
   - server/api/v1/admin/config-files.get.ts, post.ts, [target].get.ts, [target].put.ts
   - server/api/v1/admin/daily-routes.get.ts, post.ts, [id].delete.ts, timetables.get.ts
   - server/api/v1/admin/membership-codes.get.ts, post.ts
   - server/api/v1/admin/oauth/clients.get.ts, [clientId].patch.ts, [clientId]/revoke-tokens.post.ts
   - server/api/v1/admin/official-circulations.get.ts, [entryKey].delete.ts
   - server/api/v1/admin/passive-alerts.get.ts
   - server/api/v1/admin/server-metrics.get.ts
   - server/api/v1/admin/tasks.get.ts, tasks.post.ts
   - server/api/v1/admin/timetable-history/merge-candidates.get.ts, coverages/[coverageId].delete.ts
   - server/api/v1/admin/traffic.get.ts
   - server/api/v1/admin/webapp-tokens/revoke-all.post.ts
5. Their stores under server/services/admin*.ts and related task executor registry.

## Conventions

Create exactly:

- server/domain/admin/anomaly.ts -> getAdminAnomalyScan, postAdminAnomalyDeleteByType, postAdminAnomalyDeleteRoute
- server/domain/admin/configFiles.ts -> getAdminConfigFiles, postAdminConfigFiles, getAdminConfigFile, putAdminConfigFile
- server/domain/admin/dailyRoutes.ts -> getAdminDailyRoutes, postAdminDailyRoutes, deleteAdminDailyRoute, getAdminDailyRoutesTimetables
- server/domain/admin/membershipCodes.ts -> getAdminMembershipCodes, postAdminMembershipCodes
- server/domain/admin/oauth.ts -> getAdminOauthClients, patchAdminOauthClient, postAdminOauthClientRevokeTokens
- server/domain/admin/officialCirculations.ts -> getAdminOfficialCirculations, deleteAdminOfficialCirculation
- server/domain/admin/passiveAlerts.ts -> getAdminPassiveAlerts
- server/domain/admin/serverMetrics.ts -> getAdminServerMetrics
- server/domain/admin/tasks.ts -> getAdminTasks, postAdminTasks
- server/domain/admin/timetableHistory.ts -> getAdminTimetableHistoryMergeCandidates, deleteAdminTimetableHistoryCoverage
- server/domain/admin/traffic.ts -> getAdminTraffic
- server/domain/admin/webappTokens.ts -> postAdminWebappTokensRevokeAll

Domain functions: plain internal typed inputs/outputs; no H3Event; no headers/cookies; no executeApi; no wire formatting; version-independent validation throws ApiRequestError with today's exact status/errorCode/userMessage.

v1 handlers keep: query/body parsing, external boundary conversion, v1-specific unknown-field rejection, executeApi options, v1 response formatting.

## Key design points

- postAdminTasks: move the full typed task-variant parsing (regenerate_daily_export, refresh_route_info_now, refresh_train_circulation_now, refresh_all_routes_and_requeue_probe_now, detect_coupled_emu_group_now, run_qrcode_detection_now, dispatch_station_board_tasks_now) into the domain function. It accepts plain internal payload values and returns the created admin task result; the v1 adapter only validates the body is an object and passes fields through. Preserve exact error codes/messages for invalid types.
- config-files and daily-routes: preserve the exact admin behaviors including target names, file writes, validation messages.
- Do not modify train-provenance or users handlers (other agents own them).

## Constraints

Do not modify export handlers, auth/public/oauth/feedback/notifications domains, package.json, nuxt.config.ts, frontend, docs, proto files; no v2 routes/manifest.

## Validation

`pnpm typecheck:server` must pass for your files.

## Report

Files created/changed; all exported signatures; confirmation v1 unchanged; judgment calls; typecheck result.
