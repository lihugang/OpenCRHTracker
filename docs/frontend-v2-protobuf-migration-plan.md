# Frontend v2 Protobuf Migration Plan

## 1. Document Status

- Status: confirmed design, ready for implementation.
- Scope: migrate all functional frontend API calls to `/api/v2`, use Protocol Buffers for structured traffic, rewrite the train/EMU detail data flow, update the affected v2 timetable contract, and retire undocumented v1 routes.
- Manual testing: performed by the project owner after implementation.
- Required automated validation: `pnpm proto:check` and `pnpm typecheck`.
- Explicitly excluded: API documentation migration, performance measurement, bundle-size measurement, and backward compatibility for the not-yet-released v2 contract.
- Existing worktree note: deleted legacy v2 design/task documents are pre-existing user changes and must not be restored as part of this work.

## 2. Goals

1. Move every functional frontend request from the v1 API to the semantically corresponding v2 operation.
2. Use `application/x-protobuf` for every structured v2 request and response.
3. Keep raw PNG, PDF, and CSV responses in their native media formats.
4. Share one generated protobuf TypeScript tree between the Nuxt client, SSR runtime, and server API implementation.
5. Preserve current UI behavior and domain-facing DTOs where practical, while isolating protobuf details at the transport and mapping boundaries.
6. Preserve SSR request identity, cookies, quota-bucket resolution, and server timing.
7. Preserve CSRF protection for browser-side mutations.
8. Eliminate the train/EMU history N+1 timetable-detail request pattern.
9. Make the timetable coverage endpoint return complete deduplicated historical timetable content and remove the v2 timetable-detail endpoint.
10. Keep only v1 endpoints that are actually exposed by the current API documentation.

## 3. Non-Goals

- Do not migrate `components/docs/**`, `utils/docs/**`, or `pages/docs/**` to v2 in this phase.
- Do not update the API Playground to use protobuf in this phase.
- Do not require old browsers or non-modern `fetch`/`ArrayBuffer` environments.
- Do not add automatic fallback from protobuf/v2 to JSON/v1.
- Do not benchmark latency, payload size, or client bundle size.
- Do not redesign the train, EMU, or station detail UI.
- Do not read, migrate, or probe the old IndexedDB historical-timetable cache.
- Do not make v1 endpoints support protobuf.
- Do not preserve compatibility for the unreleased v2 timetable-detail operation.

## 4. Confirmed Decision Register

This section records every decision from the design interview. Later decisions supersede earlier implementation details where noted.

### Q1 - Migration Scope

- Decision: migrate all functional frontend API calls in one implementation to v2.
- Meaning: functional code in `components/`, `composables/`, `pages/`, `layouts/`, and non-documentation `utils/` must not call `/api/v1` after migration.
- Rationale: the requested end state is a complete frontend migration, and some v1 routes already no longer exist.
- Exception: documentation code and display-only text are excluded.

### Q2 - Protobuf Boundary

- Decision: all browser/SSR-to-backend structured API traffic uses protobuf.
- Rationale: the target architecture is a consistent typed binary protocol rather than selective optimization.
- Exception: native PNG, PDF, and CSV branches remain raw media.

### Q3 - Browser Runtime and Code Generation

- Decision: first use the repository's actual protobuf schema/toolchain, then use generated TypeScript messages with the existing `@bufbuild/protobuf` runtime.
- Repository fact: Buf, `protoc-gen-es`, and `@bufbuild/protobuf` are already pinned.
- Implementation consequence: no hand-written protobuf wire encoding or decoding.

### Q4 - Server Format Support

- Decision: v2 continues to support both JSON and protobuf through `Accept` and `Content-Type` negotiation.
- Frontend behavior: functional frontend requests explicitly select protobuf.
- Rationale: JSON remains useful for external clients and transport-level errors, while the migrated frontend uses protobuf consistently.

### Q5 - SSR Request Path

- Decision: SSR and browser code use the same logical v2 client API.
- SSR requirement: internal `/api` requests use `useRequestFetch()`.
- Rationale: preserve request identity, cookies, quota-bucket resolution, and server timing.

### Q6 - Failure Fallback

- Decision: no fallback to v1 or JSON.
- Rationale: fallback would hide protocol errors and produce ambiguous monitoring and duplicate requests.
- Consequence: invalid protobuf or unexpected media types fail visibly through the unified error model.

### Q7 - Browser Compatibility

- Decision: support current mainstream desktop and mobile browsers with modern `fetch`, `Headers`, `ArrayBuffer`, and `Uint8Array` support.
- Consequence: no legacy browser polyfill work is required.

### Q8 - Success Criteria

- Decision: prioritize functional equivalence, protocol correctness, and type correctness.
- Explicit exclusion: no performance or bundle-size acceptance target.

### Q9 - Generated Code Location

- Decision: move generated protobuf code to `shared/generated/proto/opencrh/v2/**`.
- Rationale: a single client/server-safe generated tree avoids duplicated output and server-only imports in the browser.

### Q10 - Unified Frontend Request Entry

- Decision: introduce a unified v2 API client rather than patching global `$fetch` behavior or duplicating protocol code at call sites.
- CSRF note: the client must select `$csrfFetch` for browser-side mutations.

### Q11 - Raw Media Exception

- Decision: structured APIs use protobuf; raw circulation PNG/PDF and daily CSV downloads retain their native formats.
- Rationale: native media supports direct browser preview/download and avoids unnecessary protobuf wrapping.

### Q12 - `int64` Representation

- Decision: convert protobuf `bigint` values directly to frontend `number` values at the mapping boundary.
- Contract assumption: the backend guarantees values do not exceed JavaScript's safe integer range.
- Consequence: do not add per-field overflow branches or move UI domain types to `bigint`.

### Q13 - Contract Adaptation

- Decision: preserve existing page-facing domain DTOs where practical and map v2 protobuf messages into those DTOs.
- Rationale: protobuf messages are transport contracts, not the UI's long-term domain model.

### Q14 - Error Normalization

- Decision: transport errors from protobuf, JSON, HTTP, timeout, and network layers are normalized by the unified client.
- Consequence: pages do not inspect response `Content-Type` or decode protobuf themselves.

### Q15 - Documentation Playground

- Decision: do not migrate documentation or the API Playground in this phase.
- Consequence: documentation may continue to use v1 JSON examples temporarily.

### Q16 - Functional Acceptance Scope

- Decision: migrate ordinary user flows, authentication, mutations, admin pages, OAuth, feedback, favorites, subscriptions, exports, and raw media.
- Static acceptance: functional source must contain no `/api/v1` request paths.
- Documentation paths are excluded from that static check.

### Q17 - Browser CSRF Handling

- Decision: browser `POST`, `PUT`, `PATCH`, and `DELETE` requests use `$csrfFetch`; browser `GET` and `HEAD` requests use the tracked read fetch.
- Consequence: the client must preserve the protobuf body and protocol headers while allowing the CSRF integration to add its token/header.

### Q18 - SSR Mutation Handling

- Decision: SSR requests, including mutations, use `useRequestFetch()` in the current request context.
- Consequence: SSR does not depend on browser-only `$csrfFetch` behavior.

### Q19 - Client Operation Metadata

- Decision: create a client-safe operation registry.
- The registry contains HTTP method, path template, request schema, response schema, body mode, and raw-media metadata.
- It must not import the server manifest because that manifest depends on server-only code.

### Q20 - GET Request Encoding

- Decision: GET/HEAD parameters remain human-readable URL path/query values; no protobuf request body is used.
- Response: still requested and decoded as protobuf.

### Q21 - Mapper Organization

- Decision: organize message-to-domain mapping by feature/domain.
- Transport responsibilities: request construction, encoding, response decoding, media validation, and error normalization.
- Mapper responsibilities: `TrainCode` formatting, ID mapping, enum mapping, `bigint` conversion, service-day conversion, and page DTO construction.

### Q22 - Error Compatibility Shape

- Decision: retain compatibility with the existing `{ ok, data, error }` API result shape where current callers depend on it, while adding structured status/code information to transport exceptions.
- Rationale: minimize unrelated UI rewrites.

### Q23 - Functional Source Coverage

- Decision: migrate all functional calls in components, composables, pages, layouts, and utilities.
- Exclusion: documentation implementation and display text.

### Q24 - Generated Files in Git

- Decision: generated files remain committed.
- Action: remove `server/generated/proto`, generate and commit `shared/generated/proto`, and make `proto:generate` the only generation entry point.

### Q25 - Registry Coverage

- Decision at the time: register all 100 v2 operations.
- Superseding decision: after deleting `GetTrainTimetableHistoryDetail`, register all remaining 99 operations.
- Rationale: registry completeness should be auditable even when not every operation currently has a frontend caller.

### Q26 - Existing Fetch Semantics

- Decision: pass through applicable existing request options such as `retry`, `signal`, query values, cache options, and hooks.
- Protected options: callers cannot override `Accept`, structured `Content-Type`, encoded request body, or structured response mode.

### Q27 - Protocol Validation

- Decision: use strict protocol validation.
- Fail when a structured response has an invalid `Content-Type`, an empty/invalid protobuf body, a mismatched response schema, or an undecodable payload.
- Allowed exception: protocol-defined JSON transport errors such as 406/415 are explicitly parsed.

### Q28 - Successful Return Shape

- Decision: expose mapped success as `{ ok: true, data, error: '' }` and mapped business failure as `{ ok: false, data: message, error: code }` where compatibility is needed.
- Pages do not receive raw protobuf `oneof` values.

### Q29 - Raw Media Transport

- Decision: add a `requestRaw` branch to the same v2 client.
- Shared behavior: SSR fetch selection, cookies, timing, query construction, cancellation, and error handling.
- Difference: do not decode protobuf for successful native media responses.

### Q30 - Documentation Exclusion Rule

- Decision: exclude `components/docs/**`, `utils/docs/**`, `pages/docs/**`, and pure display strings.
- Any non-documentation utility used by real application functionality remains in scope.

### Q31 - Automated Validation

- Decision: run only `pnpm proto:check` and `pnpm typecheck` as required automated validation.
- Do not require `pnpm build` for this task.
- Also perform a static functional-source search for remaining `/api/v1` calls.

### Q32 - Train/EMU Detail UI Scope

- Decision: preserve the current layout and interaction model.
- Keep: history list, infinite scrolling, current/history timetable modal, prediction, favorites, subscriptions, allocation, circulation preview, and export actions.
- Rewrite: data acquisition, normalization, caching, and state orchestration.

### Q33 - Main History Data Source

- Decision: use `GetTrainHistory` and `GetEmuHistory` as the sole main-list data sources.
- Use top-level `emuCodeMappings` and `timetableMappings` to build list rows.
- Delete the per-record `hydrateTrainHistoryRecords()` / `hydrateEmuHistoryRecords()` detail-request chain.
- Historical timetable content is requested only when the user opens the timetable modal.

### Q34 - History Pagination

- Decision: retain cursor-based infinite scrolling.
- Default frontend page size: 100 records for both train and EMU history.
- Merge behavior: normalize each page using that page's mappings, deduplicate by record ID, preserve stable descending ordering, and ignore stale responses after target changes.

### Q35 - Missing Mapping Behavior

- Decision: preserve records whose EMU or timetable mapping is missing.
- Display missing fields as `-` or the existing empty placeholder.
- Do not filter the record or fail the entire page.

### Q36 - Opening a Historical Record

- Decision: carry the clicked row's `timetableId` into the timetable modal and prefer that historical version.
- Special rule: if the referenced historical content is equivalent to the current timetable, select and display the current timetable instead.
- If the row has no usable `timetableId`, fall back to current timetable behavior.

### Q37 - Coverage Selector

- Decision: request the non-paginated coverage list once when the timetable modal opens.
- Use `coverageId` as coverage identity and `timetableId` as content identity.
- Display coverage service-day start/end labels in the selector.

### Q38 - Historical Detail Cache Key

- Initial decision: key immutable historical detail by `timetableId`.
- Superseding decision: remove the v2 detail endpoint and old detail cache entirely; complete content arrives in the coverage response.
- Remaining rule: `timetableId` remains the content identity inside the in-memory coverage model.

### Q39 - Current/Coverage Request Timing

- Initial recommendation was lazy current loading.
- Final decision: when the user opens the timetable modal, request current timetable and full coverage concurrently.
- Partial success is allowed as defined by Q45.

### Q40 - Shared Detail-History State

- Decision: create one shared train/EMU detail history composable/state machine.
- Differences between train and EMU records belong in domain mappers, not duplicate pagination implementations.

### Q41 - Complete Coverage Mapping Shape

- Decision: coverage rows retain `coverageId`, `timetableId`, and service-day bounds; complete timetable content is returned once per `timetableId` in a top-level map.
- Avoid embedding duplicate full content in every coverage row.

### Q42 - Reusable Historical Content Message

- Decision: replace the operation-specific detail data message with a reusable `HistoricalTimetableContent` message.
- It contains content identity, summary fields, and full stops.

### Q43 - Current/Historical Equality Strategy

- Decision: compare normalized timetable content rather than adding/depending on a shared `timetableId` in current data.
- Ignore `wicket`, `platformNo`, and `distance` because historical timetable content does not contain them.

### Q44 - Duplicate Current Version in Selector

- Decision: when clicked historical content equals current content, initially select current and hide the duplicate historical version from the selector.

### Q45 - Concurrent Request Partial Failure

- Decision: current and coverage are independent data sources.
- Current failure with coverage success: allow historical viewing.
- Coverage failure with current success: allow current viewing.
- Both fail: show the modal's overall error state.

### Q46 - Old Historical Cache

- Decision: remove the old detail-request cache path.
- Do not inspect or migrate existing IndexedDB data; leave old browser data untouched.
- Do not write new coverage data into the old store.
- Use only current-lifecycle/in-memory request deduplication and normal HTTP caching for the new flow.

### Q47 - Default Page Size

- Decision: train history and EMU history default to 100 records per page.
- Extension: station timetable also defaults to 100 records per page.
- Do not globally change every paginated API's default.

### Q48 - Remove v2 Timetable Detail Operation

- Decision: completely remove `GetTrainTimetableHistoryDetail` because v2 is not deployed.
- Remove: proto request/data/response, operation name, manifest entry, route file, operation-index entry, related imports, and generated code.
- Remaining v2 operation count: 99.

### Q49 - v1-to-v2 Relationship

- Clarified decision: existing documented v1 public endpoints remain and continue to map to the same shared domain functionality as their v2 equivalents.
- They do not internally issue HTTP requests to v2.
- Undocumented v1 routes are retired.

### Q50 - Summary and Full Content Messages

- Decision: keep `HistoricalTimetableSummary` lightweight for history/records/admin mappings and add `HistoricalTimetableContent` for the coverage endpoint.
- `GetTrainTimetableHistoryData.timetableMappings` becomes `map<uint32, HistoricalTimetableContent>`.

### Q51 - Equality Comparison Fields

- Decision: compare normalized stop content using:
  - `stationNo`
  - `stationName`
  - `stationTrainCode`
  - `arriveOffset`
  - `departOffset`
  - `isStart`
  - `isEnd`
- Ignore `wicket`, `platformNo`, and `distance`.
- Derive route-level start/end values from stops rather than comparing separate duplicated summary fields.

### Q52 - Inconclusive Equality

- Decision: be conservative.
- If current fails or cannot be normalized reliably, keep the historical option and do not classify it as current.

### Q53 - Missing Full Content in Coverage

- Decision: retain the coverage row and omit only the missing `timetableMappings` entry.
- Frontend: show the coverage but disable opening/selecting unavailable content.
- Server: log an integrity error without converting the entire response to 500.

### Q54 - In-Memory Modal Cache

- Decision: cache/deduplicate current and coverage requests for the current modal lifecycle.
- This is not old-data probing and does not use the legacy IndexedDB store.

### Q55 - Station Pagination

- Decision: station first page uses `limit=100`, retains `nextCursor`, infinite scrolling, deduplication, and focus-train auto-pagination.

### Q56 - Final Registry Size

- Decision: the client registry covers all remaining 99 v2 operations.
- Admin and raw-media operations are included.
- Documentation Playground is not wired to the registry in this phase.

### Q57 - Shared Output Path

- Decision: use `shared/generated/proto/opencrh/v2/**`.

### Q58 - Generated Type Check

- Decision: move the generated-code TypeScript project to `shared/generated/tsconfig.json` and update `proto:check` accordingly.

### Q59 - Meaning of Public v1

- Decision: public means the endpoint is included in the application's current API documentation, not that it is read-only, unauthenticated, or outside `/admin`.
- Source of truth: the endpoint set produced by `PUBLIC_DOCS_API_SLUGS` in `utils/docs/apiDocs.ts`.

### Q60 - Client Failure Semantics

- Decision:
  - HTTP 2xx with protobuf `outcome=data`: return mapped success.
  - HTTP 2xx with protobuf `outcome=error`: return the compatible business-failure envelope.
  - HTTP non-2xx protobuf business error: normalize into the same API failure when decodable and expected by the existing caller contract.
  - JSON 406/415 and other defined JSON transport errors: parse and throw `V2ApiError`.
  - Network, timeout, invalid media type, empty body, or protobuf decoding failures: throw `V2ApiError` with operation/status/code/cause details.

### Q61 - Exact Documented v1 Set

- Decision: retain the 12 v1 routes currently exposed by `PUBLIC_DOCS_API_SLUGS`:
  1. `GET /api/v1/auth/me`
  2. `GET /api/v1/records/daily`
  3. `GET /api/v1/timetable/train/:trainCode/current`
  4. `GET /api/v1/timetable/train/:trainCode/circulation/image`
  5. `GET /api/v1/timetable/train/:trainCode/history`
  6. `GET /api/v1/timetable/train/:trainCode/history/:historyId`
  7. `GET /api/v1/timetable/station/:stationName`
  8. `GET /api/v1/history/train/:trainCode`
  9. `GET /api/v1/history/emu/:emuCode`
  10. `GET /api/v1/allocation/emu/:emuCode`
  11. `GET /api/v1/exports/daily/index`
  12. `GET /api/v1/exports/daily/:date`
- All other v1 API route files are undocumented and must be retired.
- Important distinction: the documented v1 timetable detail route remains even though the unreleased v2 timetable detail operation is removed.

### Q62 - Documentation During v1 Retirement

- Decision: leave documentation source unchanged in this phase, even if non-public OpenAPI definitions or examples reference retired v1 operations.
- Only the 12 actually exposed documented endpoints are guaranteed to remain usable.

### Q63 - v1 Response Format

- Decision: retained v1 endpoints remain JSON-only and preserve their existing v1 response contracts.
- Protobuf is introduced for frontend v2 traffic, not retrofitted onto v1.

## 5. Target Architecture

```text
Vue page/component/composable
        |
        | operation name + params/query/body + mapper
        v
domain-specific frontend API module
        |
        v
shared v2 operation registry (99 operations)
        |
        v
useV2Api / v2ApiClient
        |-- browser GET/HEAD ----------> tracked $fetch
        |-- browser mutations ---------> $csrfFetch
        |-- SSR all methods -----------> useRequestFetch()
        |
        |-- structured ----------------> protobuf encode/decode
        `-- raw PNG/PDF/CSV -----------> Blob/ArrayBuffer/text
```

### 5.1 Layer Responsibilities

`shared/generated/proto/**`:

- Generated schemas and TypeScript message types only.
- Safe for browser, SSR, and server imports.
- Never manually edited.

Client operation registry:

- Defines operation name, HTTP method, route template, request schema, response schema, body mode, and raw-media behavior.
- Contains all 99 operations.
- Contains no H3, database, domain, auth identity, or server-manifest imports.

Transport:

- Expands route params with `encodeURIComponent`.
- Encodes query values using the existing human-readable v2 contract.
- Creates protobuf request messages and serializes them with `toBinary()` for body-bearing methods.
- Sets `Accept: application/x-protobuf` for structured operations.
- Sets `Content-Type: application/x-protobuf` only when a protobuf body is present.
- Reads structured responses as bytes and decodes with the operation-specific response schema.
- Validates `oneof outcome` and normalizes failures.
- Preserves fetch cancellation, retry, hooks, and SSR timing behavior.

Domain API modules/mappers:

- Convert generated messages to existing UI/domain DTOs.
- Convert `TrainCode` objects to canonical strings.
- Convert `bigint` to `number`.
- Convert epoch service days to `YYYYMMDD` where existing UI expects it.
- Resolve numeric EMU IDs through `emuCodeMappings`.
- Resolve timetable IDs through summary/full-content mappings.
- Convert response enums to existing string unions, preserving unknown values safely.

Pages/composables:

- Work with mapped DTOs and compatible API envelopes.
- Do not import generated response schemas directly unless implementing a domain mapper.
- Do not set protobuf headers or response types.

## 6. Protobuf and Server Contract Changes

### 6.1 Move Generated Output

Update `proto/buf.gen.yaml`:

```yaml
version: v2
plugins:
    - local: protoc-gen-es
      out: shared/generated/proto
      opt:
          - target=ts
```

Actions:

1. Generate into `shared/generated/proto/opencrh/v2/**`.
2. Add `shared/generated/tsconfig.json`.
3. Update every server import from `~/server/generated/proto/...` to `#shared/generated/proto/...` or the repository-standard shared alias.
4. Delete tracked files under `server/generated/proto/**` after imports are migrated.
5. Update `proto:check` to typecheck `shared/generated/tsconfig.json`.

### 6.2 Historical Timetable Messages

Keep the lightweight summary:

```proto
message HistoricalTimetableSummary {
  optional string start_station = 1;
  optional string end_station = 2;
  optional int64 start_offset = 3;
  optional int64 end_offset = 4;
}
```

Add full content in `mappings.proto`:

```proto
message HistoricalTimetableContent {
  uint32 timetable_id = 1;
  optional string start_station = 2;
  optional string end_station = 3;
  optional int64 start_offset = 4;
  optional int64 end_offset = 5;
  repeated TimetableStop stops = 6;
}
```

Change timetable coverage data:

```proto
message GetTrainTimetableHistoryData {
  TrainCode train_code = 1;
  repeated TrainTimetableHistoryCoverage items = 2;
  map<uint32, HistoricalTimetableContent> timetable_mappings = 3;
}
```

Remove:

- `GetTrainTimetableHistoryDetailRequest`
- `GetTrainTimetableHistoryDetailData`
- `GetTrainTimetableHistoryDetailResponse`
- `GetTrainTimetableHistoryDetail` operation name
- `/api/v2/timetable/train/:trainCode/history/:timetableId` route
- Manifest entry and adapter dedicated to the detail operation

### 6.3 Coverage Adapter

The coverage domain/adapter must:

1. Load all coverage rows for the train code.
2. Preserve every coverage row.
3. Deduplicate referenced positive `timetableId` values.
4. Resolve full content for each distinct ID.
5. Emit content mappings keyed by numeric `timetableId`.
6. Log missing content and omit only that mapping entry.
7. Keep response cost based on the number of coverage rows unless the project explicitly changes the cost contract elsewhere.
8. Preserve coverage cache policy based on the earliest coverage service day.

### 6.4 Operation Count and Generated Routes

- Change the authoritative count from 100 to 99 wherever executable checks or generators depend on it.
- Remove the detail row from the operation index source used by `generate-v2-routes.mjs`, if that index is retained/reintroduced.
- Ensure route-generation scripts do not recreate the deleted detail route.
- Do not restore the currently deleted legacy design documents merely to edit their counts.

## 7. Unified v2 Client Design

### 7.1 Registry Shape

The exact names may follow local conventions, but the registry needs equivalent information:

```ts
interface V2ClientOperation<
    TRequestSchema extends DescMessage,
    TResponseSchema extends DescMessage
> {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    pathTemplate: string;
    requestSchema: TRequestSchema;
    responseSchema: TResponseSchema;
    bodyMode: 'none' | 'optional' | 'required';
    responseKind: 'protobuf' | 'raw';
    rawContentTypes?: readonly string[];
}
```

The registry should be split by protobuf domain to keep imports tree-shakeable and reviewable, then flattened into one typed map.

### 7.2 Request API

The client should expose two logical methods:

```ts
request<TDomain>(operationName, input, mapper, options)
requestRaw(operationName, input, options)
```

`input` contains distinct `params`, `query`, and protobuf `body` values. This prevents accidental mixing of URL fields and body fields.

### 7.3 Fetch Selection

Structured and raw requests use this selection matrix:

| Runtime | Method | Fetch implementation |
|---|---|---|
| Browser | GET/HEAD | tracked `$fetch` |
| Browser | POST/PUT/PATCH/DELETE | `useNuxtApp().$csrfFetch` |
| SSR | Any | tracked wrapper around `useRequestFetch()` |

The SSR wrapper must retain the current timing hooks from `useTrackedRequestFetch.ts`.

### 7.4 CSRF Requirements

- Do not manually duplicate the CSRF cookie/token algorithm.
- Let `$csrfFetch` add the configured CSRF header for browser mutations.
- Ensure the protobuf `Uint8Array` body survives the wrapper unchanged.
- Ensure transport-owned `Accept` and `Content-Type` headers are merged with, not replaced by, CSRF headers.
- Keep existing `nuxt-security` route exceptions such as `/api/v2/notifications/send` unchanged unless separately required.

### 7.5 Structured Response Handling

1. Force byte-oriented response handling.
2. Inspect the HTTP status and `Content-Type`.
3. For expected protobuf responses, require `application/x-protobuf`.
4. Decode with the exact operation response schema.
5. Require `outcome.case` to be `data` or `error`.
6. Map `data` through the operation/domain mapper.
7. Convert `error` to the compatible failure envelope where appropriate.
8. Parse JSON only for protocol-defined JSON errors or infrastructure responses.

### 7.6 Error Type

Introduce a stable error class similar to:

```ts
class V2ApiError extends Error {
    operation: V2OperationName;
    status: number | null;
    code: string;
    userMessage: string;
    cause?: unknown;
}
```

`getApiErrorMessage()` must recognize this error directly while retaining current v1/envelope support for documented v1 and any untouched non-v2 paths outside the migration scope.

### 7.7 Raw Responses

Raw media calls:

- Use the registry path and method.
- Set an appropriate media `Accept` value when useful.
- Do not set protobuf `Content-Type` for GET downloads.
- Validate a successful content type against allowed types.
- Return `Blob`, `ArrayBuffer`, `Uint8Array`, or text according to caller needs.
- On non-success responses, inspect content type and decode protobuf/JSON error bodies when possible before falling back to a transport error.

## 8. Shared Mapping Utilities

### 8.1 Train Codes

Add one reusable formatter for generated `TrainCode` messages:

```ts
function formatProtoTrainCode(value: TrainCode): string {
    return `${value.prefix}${value.number}`.toUpperCase();
}
```

Also add request-body construction from normalized external strings where body messages require a structured train code. URL train codes remain strings.

Review the existing client lookup regex because it currently accepts multi-letter prefixes and suffix forms that may exceed the server's v2 canonical parser. The frontend should not silently construct an invalid structured `TrainCode`; URL validation and body conversion should share canonical rules.

### 8.2 Service Days

Add utilities for:

- epoch service day to `YYYYMMDD`
- epoch service day to Shanghai midnight Unix seconds
- `YYYYMMDD` to epoch service day when required for request bodies
- stable display labels and cache keys

Do not treat epoch service day as Unix seconds.

### 8.3 Mapping Lookups

- EMU mapping: `Record<number, string>` lookup by `emuId`.
- Timetable summary mapping: lookup by `timetableId` for history list rows.
- Full content mapping: lookup by `timetableId` for coverage selector/content.
- Missing entries return `null`; they do not fabricate `UNKNOWN` codes.

### 8.4 Enum Conversion

Map protobuf enum numbers to the existing UI string unions for circulation, auth issuer/status, subscription types, and admin states.

- Known values map explicitly.
- Unknown response values must not crash decoding.
- Unknown values should map to an existing neutral/unknown UI representation or be omitted where the current DTO allows it.

## 9. Train and EMU Detail Rewrite

### 9.1 New Main History Composable

Replace or substantially rewrite `useRecentHistoryList()` as a unified train/EMU state machine.

Inputs:

- target type: `train` or `emu`
- normalized external code
- optional date range where a consumer such as future prediction needs one
- page size, defaulting to 100 for detail pages

State:

- initial loading/error/success/empty
- normalized items
- next cursor
- loading-more state
- load-more error
- request version or abort signal
- seen record IDs

Per-page algorithm:

1. Call `GetTrainHistory` or `GetEmuHistory` with `limit=100` and the current cursor.
2. Decode protobuf and map the top-level requested identity.
3. For each record, resolve the opposite-side display code:
   - train history: `emuId -> emuCodeMappings[emuId]`
   - EMU history: structured `TrainCode -> canonical string`
4. Resolve timetable summary from `timetableMappings[timetableId]` when present.
5. Convert `serviceDay` to `YYYYMMDD` and Shanghai day start.
6. Compute absolute list `startAt/endAt` as day start plus summary offsets.
7. Preserve records with missing mappings, using null/empty display fields.
8. Deduplicate by numeric record ID.
9. Merge pages using the existing stable time-descending behavior.
10. Ignore responses belonging to a previous target/request version.

Delete the list-time use of:

- `hydrateTrainHistoryRecords()`
- `hydrateEmuHistoryRecords()`
- `fetchHistoricalTimetableContentWithCache()`
- the six-worker per-record timetable detail fan-out

### 9.2 History List UI

Keep the existing table/card UI and infinite-scroll sentinel.

Adjust row model:

- record ID may be normalized to string for Vue keys, but its source is numeric.
- retain numeric `timetableId | null`.
- retain normalized `serviceDate`, `startAt`, `endAt`, stations, and opposite code.
- opening a row passes `timetableId` and the relevant service day into the modal.

### 9.3 Timetable Modal Request Model

When opened, start current and coverage requests concurrently:

```text
open modal
  |-- GetCurrentTrainTimetable
  `-- GetTrainTimetableHistory (all coverages + all full contents)
```

The modal state must represent independent results:

- current: idle/loading/ready/empty/error
- coverage: idle/loading/ready/empty/error
- selection: current or `timetable:<id>`
- requested initial timetable ID from the clicked history row

Overall state rules:

- both loading with no usable data: loading
- either side ready: render usable data and surface the other side's non-blocking error where appropriate
- both empty: empty
- both failed: error

### 9.4 Coverage Normalization

Normalize each coverage into:

```ts
interface HistoricalTimetableOption {
    coverageId: number;
    timetableId: number;
    serviceDayStart: number;
    serviceDayEndExclusive: number;
    sourceKey: `timetable:${number}`;
    content: HistoricalTimetableData | null;
}
```

If multiple coverages reference the same `timetableId`, selector presentation may group or deduplicate identical content entries while retaining enough coverage-range information for labels. The implementation should preserve the chronological coverage meaning and avoid duplicate selector entries that show the same content without additional useful range information.

### 9.5 Current/Historical Equality

Normalize current and historical stops to one comparison shape:

```ts
interface ComparableTimetableStop {
    stationNo: number;
    stationName: string;
    stationTrainCode: string;
    arriveOffset: number | null;
    departOffset: number | null;
    isStart: boolean;
    isEnd: boolean;
}
```

To derive current offsets reliably, expose or retain the current schedule's service day in the frontend current-timetable DTO. The v1 public response must remain unchanged; this may be a v2-only field or an adapter-side value if the server domain already exposes the active service day.

Comparison procedure:

1. Normalize station text and train-code text consistently.
2. Convert current absolute arrival/departure timestamps to offsets from the current schedule's Shanghai service-day midnight.
3. Compare stop count and every listed field in order.
4. Ignore wicket, platform, distance, reference models, bureau information, circulation, and current-only metadata.
5. If required service-day or stop data is unavailable, return `inconclusive`, not `equal`.

When equal:

- select current initially;
- hide the duplicate historical option;
- continue allowing other genuinely different historical versions.

### 9.6 Remove Old Detail Cache

Remove functional imports and calls to `utils/lookup/historicalTimetableContentCache.ts`.

Preferred cleanup:

- delete the utility if no remaining functional callers exist;
- delete obsolete `useHistoricalTimetableContent.ts` hydration helpers if no other feature uses them;
- do not open or delete the existing browser IndexedDB database;
- do not add a migration probe;
- do not reuse stale version-1 entries.

### 9.7 Future Assignment Prediction

The prediction algorithm may remain, but its data acquisition must be rewritten to consume normalized v2 history pages and top-level summary mappings.

Requirements:

- no historical timetable detail fan-out;
- preserve the existing date-window semantics;
- keep fetching cursor pages until the required range is exhausted or `nextCursor` is empty, rather than assuming one page is sufficient;
- use a page size appropriate to the prediction window, capped by the API maximum;
- normalize service day plus summary offsets into absolute timestamps before matching;
- update or version module caches so v1 DTOs cannot be confused with v2-normalized DTOs.

### 9.8 EMU Allocation

Map `GetEmuAllocationData` to the existing modal DTO:

- `emuId` remains internal to the mapper unless needed by favorite/subscription operations.
- canonical display code comes from `emuCodeMappings[emuId]`.
- fallback display code is the requested normalized URL code if the mapping is missing.
- retain all existing profile and coach-layout fields.

### 9.9 Favorites and Event Subscriptions

Replace generic v1 `type + code` payloads with typed protobuf oneofs.

Train targets:

- parse/construct structured `TrainCode` in request bodies;
- format structured codes in responses.

EMU targets:

- request payloads require numeric `emuId`;
- obtain IDs from relevant v2 mappings or a maintained lookup result;
- responses resolve IDs through top-level `emuCodeMappings`.

Station targets:

- use the typed station-name branch.

Feedback subscription targets:

- use numeric topic IDs.

Preserve the current behavior where enabling a subscription can first create the related favorite.

## 10. Station Detail Migration

### 10.1 Initial and Subsequent Pages

- Call `GetStationTimetable` with `limit=100`.
- Retain current cursor and infinite-scroll behavior.
- Normalize all structured train codes immediately.
- Convert optional `bigint` timestamps to numbers/null.
- Preserve reference models and existing row presentation.

### 10.2 Focus Train Auto-Pagination

Keep the current behavior that automatically loads additional pages until:

- the target focus train is found;
- `nextCursor` is empty;
- the target changes;
- the request is cancelled or fails.

Deduplicate records while auto-paging so the larger page size does not introduce duplicate Vue keys or repeated rows.

## 11. Other Functional Migration Areas

### 11.1 Search

- Replace the incorrect/legacy `/api/v1/search` call with the `GetSearchIndex` v2 operation at `/api/v2/search/index`.
- Keep the existing suggestion DTO and cache behavior unless invalidation changes are required for correctness.

### 11.2 Authentication and User Dashboard

Migrate:

- login/register/logout/me
- memberships and redemption
- password and QQ binding
- settings
- API keys
- authorizations
- OAuth clients
- favorites
- event subscriptions
- push subscription devices

All browser mutations go through the protobuf-aware CSRF path.

### 11.3 Feedback

Migrate list/detail/create/reply/update/delete operations.

- Convert `google.protobuf.Struct` fields using the protobuf runtime's structured JSON helpers rather than manual stringification.
- Preserve existing page DTOs and optimistic/loading behavior.

### 11.4 Admin

Migrate every current admin request to its matching registry operation.

- Keep query/path/body responsibilities consistent with the v2 manifest.
- Map generated enums and `Struct` payload fields deliberately.
- Preserve current request cancellation, refresh, and modal behavior.

### 11.5 OAuth Authorization

- Migrate the context read to v2 protobuf.
- Keep the existing non-API OAuth authorization submission route if it is outside `/api/v1` and governed by its current CSRF contract.
- Do not accidentally convert `/oauth/token` or other non-v2 protocol endpoints into protobuf operations.

### 11.6 Daily Exports

- Structured export index uses protobuf.
- Raw date download remains CSV.
- Remove v1 `format` assumptions where v2 is CSV-only.
- Use `requestRaw` and validate `text/csv`.

### 11.7 Circulation Image and PDF

- Change the operation/path to v2.
- Keep `binary=true` raw response behavior.
- PNG callers consume Blob/bytes as before.
- PDF preview consumes ArrayBuffer as before.
- Error bodies are decoded through the unified client rather than assuming JSON.

## 12. v1 Retirement Policy

### 12.1 Retained Documented Routes

Retain exactly the 12 routes listed under Q61. Their behavior remains:

- current v1 URL and query contract;
- JSON envelope;
- current status codes and Chinese error messages;
- current scopes, quota costs, cache headers, and raw-media branches;
- shared domain implementation where already used.

Do not make these route handlers call `/api/v2` over HTTP. Both versions may call shared domain functions directly.

### 12.2 Retired Undocumented Routes

All other `server/api/v1/**` route files are retired. In implementation terms, remove the route files rather than adding redirects, protobuf, or automatic version fallback.

This includes undocumented v1 routes in these areas:

- admin
- login/register/logout and other undocumented auth operations
- settings, API-key management, authorizations, favorites, event subscriptions, and device subscriptions
- OAuth client management and authorize context
- feedback
- notifications
- health/debug/exposed-config/search when not part of the documented set

Before deletion, mechanically derive the retained file list from `PUBLIC_DOCS_API_SLUGS` and route metadata. Do not infer public status merely from path names.

### 12.3 Documentation Caveat

Documentation source is not migrated in this phase. It may still contain dormant OpenAPI definitions or examples for retired v1 endpoints. The runtime guarantee applies only to the 12 endpoints actually exposed by the current documentation filter.

## 13. Detailed Execution Sequence

### Phase 1 - Establish a Clean Inventory

1. Record the pre-existing worktree status.
2. Build a machine-readable list of functional `/api/v1` call sites, excluding documentation paths.
3. Build the exact 12-file retained v1 route list from current documentation slugs.
4. Build the current v2 operation list and identify the single detail operation to remove.
5. Identify every import of `server/generated/proto`.

Exit condition:

- inventories are complete;
- no user-owned deletions or unrelated edits are reverted.

### Phase 2 - Change the Protobuf Contract

1. Add `HistoricalTimetableContent`.
2. Change the coverage mapping value type to full content.
3. Remove the detail request/data/response messages.
4. Remove the detail operation from operation names, manifest, adapters, and routes.
5. Update executable operation-count assumptions from 100 to 99.
6. Update the coverage adapter to return deduplicated complete content.
7. Keep summary mappings unchanged for history, records, and admin operations.

Exit condition:

- proto source is internally consistent;
- the server manifest has 99 operations;
- no v2 detail route exists.

### Phase 3 - Move Generated Code to Shared

1. Change Buf output.
2. Generate shared protobuf TypeScript.
3. Add shared generated tsconfig.
4. Update all server imports.
5. Remove the old generated tree.
6. Update package scripts.

Exit condition:

- server and frontend can import the same generated schemas;
- generated code is committed in one place.

### Phase 4 - Implement Client Registry and Transport

1. Add the 99-operation client registry.
2. Add path/query construction.
3. Add protobuf request encoding.
4. Add protobuf response decoding and strict content-type validation.
5. Add `V2ApiError`.
6. Add browser read, browser CSRF mutation, and SSR fetch selection.
7. Integrate current SSR timing hooks.
8. Add raw-media handling.
9. Extend `getApiErrorMessage()`.

Exit condition:

- one read, one mutation, one SSR request, and one raw request can be represented without feature-specific protocol code.

### Phase 5 - Implement Shared Domain Mappers

1. Train-code formatter/parser helpers.
2. Service-day conversion helpers.
3. `bigint` conversion helper.
4. mapping-resolution helpers.
5. common outcome/envelope helpers.
6. enum conversion helpers.

Exit condition:

- UI modules can consume normalized DTOs without generated-message knowledge.

### Phase 6 - Rewrite Lookup and Timetable Flows

1. Migrate search.
2. Rewrite train/EMU history pagination with page mappings and `limit=100`.
3. Delete the N+1 history hydration path.
4. Rewrite current timetable mapping.
5. Rewrite coverage loading to one complete response.
6. Add concurrent current/coverage modal orchestration.
7. Add clicked `timetableId` initial selection.
8. Add current/historical content equality comparison.
9. Remove old IndexedDB detail-cache usage.
10. Migrate circulation raw media.
11. Migrate allocation.
12. Migrate future prediction acquisition.
13. Migrate favorites/event subscriptions used by lookup pages.
14. Change station page size to 100 and migrate station mapping.

Exit condition:

- train, EMU, and station pages use v2 only;
- opening history rows does not issue per-record timetable detail requests;
- current and history remain independently viewable on partial failure.

### Phase 7 - Migrate Remaining Functional Areas

Migrate in bounded domain groups:

1. auth and dashboard
2. OAuth
3. feedback
4. exports
5. admin core
6. admin users
7. admin provenance/tasks/maintenance
8. notifications and remaining system configuration reads used by functionality

For each group:

- register/verify operation metadata;
- add mapper coverage;
- replace request call sites;
- preserve existing request options and UI state;
- remove obsolete v1-only DTO adaptation when no longer referenced.

### Phase 8 - Retire Undocumented v1 Routes

1. Recompute the documented 12-route allowlist.
2. Remove every other `server/api/v1/**` route file.
3. Keep shared domain functions still used by v2 or documented v1.
4. Remove v1-only utilities only when no retained route uses them.
5. Do not change retained v1 response contracts.

### Phase 9 - Static Cleanup

1. Search functional directories for `/api/v1`.
2. Confirm remaining occurrences are documentation-only or display-only.
3. Search for old detail operation names and route paths.
4. Search for imports from `server/generated/proto`.
5. Search for active imports of the old historical detail cache/hydration utilities.
6. Confirm the client registry contains exactly 99 unique operations.

### Phase 10 - Automated Validation

Run:

```bash
pnpm proto:check
pnpm typecheck
```

Do not claim manual browser verification. The project owner will perform it.

## 14. Expected File Areas

Likely modified or added areas include:

- `proto/buf.gen.yaml`
- `proto/opencrh/v2/mappings.proto`
- `proto/opencrh/v2/timetable.proto`
- `shared/generated/proto/opencrh/v2/**`
- `shared/generated/tsconfig.json`
- `package.json`
- `server/utils/api/v2/operationNames.ts`
- `server/utils/api/v2/manifestEntries/lookup.ts`
- `server/utils/api/v2/adapters/lookup.ts`
- `server/utils/api/v2/resourceMappings.ts` or a new full-content mapping helper
- `server/api/v2/timetable/train/[trainCode]/history/[timetableId].get.ts` (deleted)
- all server imports currently targeting `server/generated/proto`
- a new client-safe v2 registry under `shared/` or `utils/api/v2/`
- a new v2 transport composable/client
- domain mapper modules under `utils/api/v2/` or another established client utility location
- `composables/useTrackedRequestFetch.ts`
- `utils/api/getApiErrorMessage.ts`
- lookup/history/timetable/station/future-prediction composables
- lookup modals/components where selected timetable identity must be passed
- auth/dashboard/feedback/admin functional callers
- undocumented `server/api/v1/**` route files (deleted)

Exact placement should follow existing Nuxt auto-import and utility conventions and avoid introducing duplicate helpers.

## 15. Validation Checklist

### 15.1 Static Checks

- No functional frontend request path contains `/api/v1`.
- Documentation paths may still contain `/api/v1`.
- No client code imports server-only modules.
- No import targets `server/generated/proto`.
- No v2 timetable-detail operation remains.
- Registry contains 99 unique operation names and method/path pairs.
- Only the 12 documented v1 route handlers remain under `server/api/v1`.
- No functional lookup code calls the old history-detail cache.

### 15.2 Type and Proto Checks

- `pnpm proto:check` passes.
- `pnpm typecheck` passes.

### 15.3 Owner Manual Verification

The owner should verify at minimum:

1. Train detail first load and 100-record pagination.
2. EMU detail first load and pagination.
3. Missing mapping placeholders.
4. Historical row opens the intended timetable.
5. Historical content equal to current selects current and hides the duplicate.
6. Current missing but historical available.
7. Coverage missing but current available.
8. Station first 100 rows, infinite load, and focus-train auto-load.
9. Current timetable, circulation, PNG export, PDF preview/export.
10. Future assignment prediction for train and EMU targets.
11. EMU allocation modal.
12. Favorites and event subscriptions for train, EMU, and station targets.
13. Login/register/logout/settings/API keys/OAuth flows.
14. Feedback flows.
15. Admin pages and mutations.
16. CSV export index and download.
17. SSR-loaded pages preserve authenticated identity and quota behavior.
18. Browser mutations pass CSRF validation.
19. Retained documented v1 endpoints still return their existing JSON shapes.
20. Undocumented v1 endpoints are no longer routable.

## 16. Main Risks and Controls

### Generated Code Accidentally Pulls Server Modules into the Client

Control: generated messages live under `shared/`; the client registry never imports the server manifest or adapters.

### CSRF Wrapper Alters Binary Bodies or Headers

Control: test the transport shape through TypeScript and owner browser verification; merge headers and let `$csrfFetch` add only its CSRF material.

### `bigint` Escapes into Vue or Date Arithmetic

Control: mapper boundary converts every protobuf `int64` before returning a domain DTO.

### Missing Resource Mappings Remove Legitimate History Rows

Control: preserve rows and represent missing display fields explicitly.

### Current/Historical Equality Produces False Positives

Control: compare the complete shared stop field set, require reliable service-day normalization, and treat incomplete comparisons as inconclusive.

### Registry and Server Manifest Drift

Control: keep a 99-operation static completeness check or generation script that consumes client-safe metadata, without importing server runtime code into the client.

### Retiring the Wrong v1 Endpoint

Control: derive the allowlist mechanically from `PUBLIC_DOCS_API_SLUGS`; do not classify routes by directory or authentication.

### Old IndexedDB Data Interferes with New Responses

Control: never read the old store in the new flow. Leaving stale browser data physically present is acceptable because it is unreachable.

### Future Prediction Misses Records Beyond the First Page

Control: paginate until the requested time window is complete or `nextCursor` is exhausted.

## 17. Definition of Done

The implementation is complete when all of the following are true:

1. Shared generated protobuf code is the sole generated TypeScript source.
2. The v2 server exposes 99 operations and no timetable-detail operation.
3. Coverage responses include deduplicated full historical timetable content.
4. The frontend has a typed 99-operation registry and a unified protobuf/raw transport.
5. Browser mutations retain CSRF protection.
6. SSR internal requests use `useRequestFetch()` and retain timing/identity behavior.
7. Functional frontend code contains no v1 API calls.
8. Train/EMU history no longer performs per-record timetable detail requests.
9. Train/EMU history and station timetable default to 100 rows per page.
10. Timetable modal concurrently loads current and coverage and supports partial success.
11. Old historical detail cache data is neither read nor migrated.
12. Only the 12 documented v1 route handlers remain, JSON-only.
13. `pnpm proto:check` passes.
14. `pnpm typecheck` passes.
15. Manual verification is explicitly handed to the project owner.
