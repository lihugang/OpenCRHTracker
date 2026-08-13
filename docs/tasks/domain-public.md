# Task: public read domain extraction (agent domain_public)

Extract shared domain operations for public read APIs in /root/crhdata/OpenCRHTracker. v1 must keep EXACTLY its current external behavior (status, Chinese messages, response shapes, executeApi options). Work independently; do not ask questions.

## Read first

1. docs/api-v2-implementation-spec.md (sections 3.3, 7, 12, 13, 14)
2. docs/api-v2-domain-modules.md (module mapping)
3. docs/api-v2-operation-index.md (operation names)
4. These v1 handlers (13):
   - server/api/v1/records/daily.get.ts
   - server/api/v1/history/train/[trainCode].get.ts
   - server/api/v1/history/emu/[emuCode].get.ts
   - server/api/v1/timetable/train/[trainCode]/current.get.ts
   - server/api/v1/timetable/train/[trainCode]/history.get.ts
   - server/api/v1/timetable/train/[trainCode]/history/[historyId].get.ts
   - server/api/v1/timetable/station/[stationName].get.ts
   - server/api/v1/timetable/train/[trainCode]/circulation/image.get.ts
   - server/api/v1/allocation/emu/[emuCode].get.ts
   - server/api/v1/search/index.get.ts
   - server/api/v1/health.get.ts
   - server/api/v1/debug/echo-error.get.ts
   - server/api/v1/exposed-config.get.ts
5. Their stores/services, server/utils/internal/boundaries.ts, server/utils/date/*, server/utils/12306/trainCode.ts, server/utils/api/*, types/lookup.ts, types/about.ts

## Conventions

Create exactly:

- server/domain/records.ts -> `getDailyRecords`
- server/domain/history.ts -> `getTrainHistory`, `getEmuHistory`
- server/domain/timetable.ts -> `getCurrentTrainTimetable`, `getTrainTimetableHistory`, `getTrainTimetableHistoryDetail`, `getStationTimetable`, `getTrainCirculationImage` (you may also export `getTrainTimetableHistoryPaged` for v1)
- server/domain/allocation.ts -> `getEmuAllocation`
- server/domain/search.ts -> `getSearchIndex`
- server/domain/system.ts -> `getHealth`, `getDebugEchoError`, `getExposedConfig`

Domain functions: plain internal typed inputs/outputs (TrainCodeParts, EmuId, ServiceDay, numbers, strings, option objects); no H3Event; no headers/cookies; no executeApi; no external string formatting; version-independent validation throws ApiRequestError with today's exact status/errorCode/userMessage.

v1 handlers keep: query/router-param/body parsing, external boundary conversion, v1-specific unknown-field rejection, executeApi options, auth rate limit calls, v1 response formatting.

## Shape notes

- Records/history: domain returns raw numeric id, ServiceDay, timetableId (number|null), EmuId, TrainCodeParts; v1 formats strings.
- getTrainTimetableHistory: export `getTrainTimetableHistoryPaged` for v1 (existing paged store query + cursor/limit/nextCursor + coverage rows) and `getTrainTimetableHistory` for v2 full unpaged list. v1 handler behavior must stay identical.
- getTrainTimetableHistoryDetail: v1 route file stays [historyId]; domain treats param as timetableId (content id); v1 response stays byte-compatible (historyId key, offsets, external stationTrainCode strings).
- getCurrentTrainTimetable: domain returns schedule/supplement data with TrainCodeParts request/canonical codes, internalCode, allCodes, bureauCode, referenceModels, circulation, stops with TrainCodeParts; v1 formats strings.
- getStationTimetable: domain returns rows with TrainCodeParts, allCodes, times, platformNo, names, updatedAt, referenceModels; v1 cursor format untouched.
- getTrainCirculationImage: domain returns render result (cacheHit, binaryContent, binaryContentType, structured data); v1 rawSuccessResponse behavior unchanged.
- getEmuAllocation: domain returns canonical emuId + profile fields; v1 formats requestEmuCode + emuCode string and everything else exactly.
- getSearchIndex/getHealth/getDebugEchoError/getExposedConfig: move logic into domain; v1 output byte-identical.

## Constraints

Do not modify the two v1 export handlers, package.json, nuxt.config.ts, frontend, docs, proto files; do not create v2 routes/manifest.

## Validation

`pnpm typecheck:server` must pass for your files. Do not run full `pnpm typecheck`.

## Report

Files created/changed; exported signatures; confirmation v1 behavior unchanged (list judgment calls); typecheck result.
