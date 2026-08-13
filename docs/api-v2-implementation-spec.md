# OpenCRHTracker `/api/v2` 实施设计规格

> 状态：设计已确认，实施中。本文固化已完成 Grilling 访谈的最终选择，并在第 14 节记录维护者对剩余决策项的最终答复与自主决策。本轮起开始修改代码，但不会修改前端或公开文档。

## 1. 目标与硬边界

### 1.1 目标

新增完整的 `/api/v2/**`，镜像当前 `server/api/v1` 下的全部 100 个 HTTP 操作：53 GET、24 POST、5 PUT、6 PATCH、12 DELETE。v2 必须有 100 个真实静态文件路由，每个文件只绑定一个强类型 operation，并通过共享 `executeV2Operation` 完成统一传输处理。

### 1.2 不在范围内

- `server/routes` 中的 `/oauth/**`、`/.well-known/**`、sitemap 不镜像。
- 前端、`utils/docs`、README 和其他公开文档不修改。
- 不新增 v1 兼容层、弃用 header、sunset 逻辑、`X-OpenCRH-API-Version` 或 body `apiVersion`。
- 不通过 `useRequestFetch()` 或内部 HTTP 请求调用另一 API 版本。
- 不引入自动化测试框架或 Node test suite。

唯一允许改变 v1 行为的例外是两个导出接口：它们可随导出系统一起收紧为 CSV-only。

## 2. 现状基线与实现前置

当前 `server/api/v1` 文件路由数为 100。现有 `executeApi` 已集中处理身份、scope、配额、失败计费、CORS、公共响应头和 JSON envelope，但不承担 v2 的 Accept 协商、body codec、protobuf 编解码、HEAD 语义或 Vary/ETag 分离。因此 v2 应新增并逐步复用更底层的 domain service，而不是把 v1 handler 逐个复制后继续堆 wire 逻辑。

当前 `server/services/dailyExportStore.ts` 同时维护 CSV 与 JSONL，文件名为 `YYYYMMDD.{format}`；导出迁移必须先把领域服务收紧为单 CSV writer/reader，再接入 v2 导出路由。旧 JSONL 文件上线后不再识别、展示或读取，历史旧文件不由应用自动删除。

## 3. 分层架构

```text
真实 v2 文件路由（100 个）
        |
        v2OperationManifest（TypeScript 类型约束的权威索引）
        |
executeV2Operation
  ├─ method/path 参数解析
  ├─ Accept / Content-Type 协商
  ├─ 身份、scope、auth rate limit、CSRF、CORS、quota
  ├─ JSON/protobuf request codec
  ├─ domain operation/service 调用
  ├─ 资源映射、缓存、ETag、公共 headers
  └─ JSON envelope 或 protobuf oneof response codec
        |
共享 domain operation/service（v1 与 v2 共用）
        |
现有数据库与领域 store
```

### 3.1 Operation manifest

新增集中维护的 `server/utils/api/v2/v2OperationManifest.ts`，使用 discriminated union/泛型保证每项记录以下字段：

- 稳定 operation 名称；HTTP method；v2 path template；对应 request/data/response message 类型。
- request/response codec；required scopes；quota cost key 或固定/per-record cost；failure cost。
- cache policy；是否允许 HEAD；是否为 raw media；原始媒体能力（CSV、PNG、PDF）。
- body 是否允许为空；可接受 request media types；成功状态码和错误状态语义。

Manifest 是 method/path 与 codec 的唯一权威索引；`.proto` 不定义 service/RPC，也不重复维护 HTTP path。真实路由文件通过常量 operation 名称引用 manifest，禁止 catch-all 动态分派。

### 3.2 `executeV2Operation`

`executeV2Operation` 统一承担 URL/query/body 解析、codec 协商、身份、scope、rate limit、CSRF、quota、domain operation 调用、资源映射、缓存 headers 和响应编码。OPTIONS 由 CORS middleware 直接 204 返回；HEAD 复用 GET 的认证、协商、quota、状态和 headers 但抑制 body。规格之外的多重失败条件同时存在时，统一返回 JSON 400。

业务错误、解码错误、未知 enum、缺失必填字段和校验错误均进入统一错误包装。若 Accept 已选 protobuf，则这些错误必须返回该 operation 专属的 protobuf error response；协商失败 406 与 body media 不支持 415 使用 JSON 错误。

### 3.3 共享 domain 模块

共享领域逻辑统一放在新增的 `server/domain/**` 中，按领域聚类为模块文件：

- `records.ts`、`history.ts`、`timetable.ts`、`allocation.ts`、`search.ts`、`system.ts`
- `auth.ts`、`oauth.ts`、`feedback.ts`、`notifications.ts`、`exports.ts`
- `admin/anomaly.ts`、`configFiles.ts`、`dailyRoutes.ts`、`membershipCodes.ts`、`oauth.ts`、`officialCirculations.ts`、`passiveAlerts.ts`、`serverMetrics.ts`、`tasks.ts`、`timetableHistory.ts`、`traffic.ts`、`trainProvenance.ts`、`users.ts`

每个模块按 operation 导出 camelCase 领域函数（例如 `getAdminTasks`、`createAdminTask`、`deleteAdminDailyRoute`）。领域函数只接收普通内部类型参数（解析后的 `TrainCodeParts`、`EmuId`、`ServiceDay`、数字 ID、枚举等），不接收 `H3Event`，不进行外部字符串格式化，不设置 cookie/header；业务校验错误继续抛 `ApiRequestError`。cookie、CSRF、CORS、quota、auth rate limit 等传输行为留在 v1/v2 各自 wire adapter 与执行器中。v1 handler 重构后只保留外部字符串边界解析和 v1 响应格式化；v2 handler 只保留 v2 解析与 v2 消息构造。

## 4. 100 个 v2 路由清单

以下清单由当前 `server/api/v1` 100 个文件生成；v2 路径保持相同资源结构，将 `/api/v1` 替换为 `/api/v2`。文件名保留 Nuxt method suffix 规则；两个历史路径有明确命名修正：`history/[historyId]` 改为 `history/[timetableId]`，并且 train history 列表为全量无分页。

每个操作拥有稳定、唯一的 operation 名称，以及独立命名的 `XxxRequest`、`XxxData`、`XxxResponse` message。完整 100 项索引见 [api-v2-operation-index.md](./api-v2-operation-index.md)，该索引是 operation 命名、manifest 条目和 proto message 命名的共同权威。

### admin（45）

| Method | v2 path                                                   |
| ------ | --------------------------------------------------------- |
| POST   | `/api/v2/admin/anomaly-actions/delete-by-type`            |
| POST   | `/api/v2/admin/anomaly-actions/delete-route`              |
| GET    | `/api/v2/admin/anomaly-scan`                              |
| GET    | `/api/v2/admin/config-files`                              |
| POST   | `/api/v2/admin/config-files`                              |
| GET    | `/api/v2/admin/config-files/:target`                      |
| PUT    | `/api/v2/admin/config-files/:target`                      |
| GET    | `/api/v2/admin/daily-routes`                              |
| POST   | `/api/v2/admin/daily-routes`                              |
| DELETE | `/api/v2/admin/daily-routes/:id`                          |
| GET    | `/api/v2/admin/daily-routes/timetables`                   |
| GET    | `/api/v2/admin/membership-codes`                          |
| POST   | `/api/v2/admin/membership-codes`                          |
| GET    | `/api/v2/admin/oauth/clients`                             |
| PATCH  | `/api/v2/admin/oauth/clients/:clientId`                   |
| POST   | `/api/v2/admin/oauth/clients/:clientId/revoke-tokens`     |
| GET    | `/api/v2/admin/official-circulations`                     |
| DELETE | `/api/v2/admin/official-circulations/:entryKey`           |
| GET    | `/api/v2/admin/passive-alerts`                            |
| GET    | `/api/v2/admin/server-metrics`                            |
| GET    | `/api/v2/admin/tasks`                                     |
| POST   | `/api/v2/admin/tasks`                                     |
| DELETE | `/api/v2/admin/timetable-history/coverages/:coverageId`   |
| GET    | `/api/v2/admin/timetable-history/merge-candidates`        |
| GET    | `/api/v2/admin/traffic`                                   |
| GET    | `/api/v2/admin/train-provenance`                          |
| GET    | `/api/v2/admin/train-provenance/coupling-scan-tasks`      |
| GET    | `/api/v2/admin/train-provenance/coupling-scan`            |
| GET    | `/api/v2/admin/train-provenance/qrcode-scan-tasks`        |
| GET    | `/api/v2/admin/train-provenance/qrcode-scan`              |
| GET    | `/api/v2/admin/train-provenance/request-stats`            |
| GET    | `/api/v2/admin/train-provenance/station-board-tasks`      |
| GET    | `/api/v2/admin/train-provenance/station-board`            |
| GET    | `/api/v2/admin/train-provenance/station-platform-refresh` |
| GET    | `/api/v2/admin/users`                                     |
| GET    | `/api/v2/admin/users/:userId/memberships`                 |
| DELETE | `/api/v2/admin/users/:userId/memberships/:groupId`        |
| PUT    | `/api/v2/admin/users/:userId/memberships/:groupId`        |
| POST   | `/api/v2/admin/users/qq-ban-list`                         |
| DELETE | `/api/v2/admin/users/qq-ban-list/:qqNumber`               |
| POST   | `/api/v2/admin/users/quota/reset`                         |
| POST   | `/api/v2/admin/users/risk/clear`                          |
| GET    | `/api/v2/admin/users/security`                            |
| POST   | `/api/v2/admin/users/status`                              |
| POST   | `/api/v2/admin/webapp-tokens/revoke-all`                  |

### allocation、auth、debug、exports、exposed-config、feedback、health、history、notifications、oauth、records、search、timetable（55）

| Method | v2 path                                                   |
| ------ | --------------------------------------------------------- |
| GET    | `/api/v2/allocation/emu/:emuCode`                         |
| GET    | `/api/v2/auth/api-keys`                                   |
| POST   | `/api/v2/auth/api-keys`                                   |
| DELETE | `/api/v2/auth/api-keys/:revokeId`                         |
| GET    | `/api/v2/auth/authorizations`                             |
| DELETE | `/api/v2/auth/authorizations/:clientId`                   |
| DELETE | `/api/v2/auth/event-subscriptions`                        |
| GET    | `/api/v2/auth/event-subscriptions`                        |
| PUT    | `/api/v2/auth/event-subscriptions`                        |
| DELETE | `/api/v2/auth/favorites`                                  |
| GET    | `/api/v2/auth/favorites`                                  |
| PUT    | `/api/v2/auth/favorites`                                  |
| POST   | `/api/v2/auth/login`                                      |
| POST   | `/api/v2/auth/logout`                                     |
| GET    | `/api/v2/auth/me`                                         |
| GET    | `/api/v2/auth/memberships`                                |
| POST   | `/api/v2/auth/memberships/redeem`                         |
| PATCH  | `/api/v2/auth/password`                                   |
| POST   | `/api/v2/auth/qq-binding/send-code`                       |
| POST   | `/api/v2/auth/qq-binding/unbind`                          |
| POST   | `/api/v2/auth/qq-binding/verify`                          |
| POST   | `/api/v2/auth/register`                                   |
| GET    | `/api/v2/auth/settings`                                   |
| PATCH  | `/api/v2/auth/settings`                                   |
| GET    | `/api/v2/auth/subscriptions`                              |
| PUT    | `/api/v2/auth/subscriptions`                              |
| DELETE | `/api/v2/auth/subscriptions/:id`                          |
| PATCH  | `/api/v2/auth/subscriptions/:id`                          |
| GET    | `/api/v2/debug/echo-error`                                |
| GET    | `/api/v2/exports/daily/:date`                             |
| GET    | `/api/v2/exports/daily/index`                             |
| GET    | `/api/v2/exposed-config`                                  |
| GET    | `/api/v2/feedback/topics`                                 |
| POST   | `/api/v2/feedback/topics`                                 |
| DELETE | `/api/v2/feedback/topics/:id`                             |
| GET    | `/api/v2/feedback/topics/:id`                             |
| PATCH  | `/api/v2/feedback/topics/:id`                             |
| POST   | `/api/v2/feedback/topics/:id/messages`                    |
| GET    | `/api/v2/health`                                          |
| GET    | `/api/v2/history/emu/:emuCode`                            |
| GET    | `/api/v2/history/train/:trainCode`                        |
| POST   | `/api/v2/notifications/send`                              |
| GET    | `/api/v2/oauth/authorize/context`                         |
| GET    | `/api/v2/oauth/clients`                                   |
| POST   | `/api/v2/oauth/clients`                                   |
| DELETE | `/api/v2/oauth/clients/:clientId`                         |
| GET    | `/api/v2/oauth/clients/:clientId`                         |
| PATCH  | `/api/v2/oauth/clients/:clientId`                         |
| GET    | `/api/v2/records/daily`                                   |
| GET    | `/api/v2/search/index`                                    |
| GET    | `/api/v2/timetable/station/:stationName`                  |
| GET    | `/api/v2/timetable/train/:trainCode/circulation/image`    |
| GET    | `/api/v2/timetable/train/:trainCode/current`              |
| GET    | `/api/v2/timetable/train/:trainCode/history`              |
| GET    | `/api/v2/timetable/train/:trainCode/history/:timetableId` |

The counts above are 45 admin + 55 non-admin = 100. Method totals must remain 53 GET, 24 POST, 5 PUT, 6 PATCH, 12 DELETE.

## 5. Protobuf source tree and message rules

Authoritative sources live under `proto/opencrh/v2/**`, split by domain into approximately 12–14 files: `common.proto`, `identifiers.proto`, `mappings.proto`, `lookup.proto`, `timetable.proto`, `exports.proto`, `auth.proto`, `oauth.proto`, `feedback.proto`, `notifications.proto`, `system.proto`, plus multiple admin files.

已确定的 14 个源文件：

```text
proto/opencrh/v2/
  common.proto            ApiError、ApiMeta
  identifiers.proto       TrainCode
  mappings.proto          HistoricalTimetableSummary 及 stop 结构
  lookup.proto            allocation、search、current/station timetable
  timetable.proto         train history、history detail、circulation image
  exports.proto           daily export index / download
  auth.proto              全部 auth、api keys、authorizations、settings、
                          memberships、qq-binding、favorites、event subscriptions、
                          device subscriptions
  oauth.proto             clients、authorize context
  feedback.proto          全部 feedback topics/messages
  notifications.proto     notifications send
  system.proto            health、debug、exposed-config
  admin.proto             非 users、非 train-provenance 的 admin 操作
  admin_users.proto       users、memberships、qq-ban、quota、risk、security、status
  admin_provenance.proto  train-provenance 全部操作
```

Every HTTP operation owns three stable messages: `XxxRequest`, `XxxData`, `XxxResponse`. Empty operations still get operation-specific empty messages; never use `google.protobuf.Empty`. Every response defines `oneof outcome { XxxData data; ApiError error; }` and includes `ApiMeta { remain, cost, optional retryAfter }`; no protobuf `ok` field. 2xx emits data, 4xx/5xx emits error.

Use `google.protobuf.Struct/Value` only for already-open fields (`FeedbackMessage.meta`, admin audit/provenance `payload`, `taskArgs`, `detail`). Known admin task variants use a typed `oneof` covering all current variants. Public database IDs use `uint32`; `serviceDay` is uint32 epoch day; real instants are `int64` Unix seconds but JSON emits safe numbers. `TrainCode` is `{ prefix, number }`; proto fields are snake_case and JSON names are standard camelCase.

Proto3 `optional` represents nullable scalars. Unknown JSON/protobuf fields are ignored. Declared fields remain strict for type, requiredness, enum, format and range. Enums start at `*_UNSPECIFIED = 0` and never reuse numbers; unknown request enum values are 400, future response enum numbers remain forward-compatible.

## 6. URL, body, response and content negotiation

- URL/query remain human-readable: canonical `trainCode` (`D2212`), canonical `emuCode` (`CR400AF-C-2214`), `YYYYMMDD`, decimal resource IDs, and opaque cursors.
- Parse URL identities only at the domain boundary; structured bodies use raw storage types. Service-day body values are epoch-day integers; instants remain Unix seconds. Do not infer identity/date conversions inside dynamic `Struct`.
- Cursor format is `serviceDay:id` (example `20677:1024`); `nextCursor` is `''` when exhausted and current cursor is echoed.
- Default missing/empty/`*/*` Accept to JSON. Support JSON (including charset) and `application/x-protobuf`; choose highest q, tie-break JSON; q=0 is unacceptable. Other-only Accept returns JSON 406 `not_acceptable`.
- Body-bearing operations accept only JSON (including charset) and protobuf. Non-empty body without Content-Type or with another type returns JSON 415 `unsupported_media_type`. Empty body is allowed without Content-Type only for dedicated empty requests.
- Response codec follows Accept, not request Content-Type. Protobuf-negotiated decode/validation/business failures use the operation-specific protobuf error response.
- Add `Vary: Accept` without overwriting existing Vary. JSON/protobuf get distinct ETags; raw CSV/PNG/PDF retain media-specific ETag and Content-Type.
- HEAD has GET semantics, identical status/auth/quota/headers, no body, and no duplicate charge. OPTIONS remains middleware-only 204.

JSON remains `{ ok, data, error }`: success `true/object/''`; failure `false/user message/error code`; no `meta` in body. `remain`, `cost`, and `retry-after` stay authoritative response headers.

## 7. Resource mappings and timetable contracts

Only schema-declared top-level resource references produce mappings. `emuCodeMappings` is JSON `Record<string,string>` and protobuf `map<uint32,string>`; `timetableMappings` is JSON `Record<string,HistoricalTimetableSummary>` and protobuf `map<uint32,HistoricalTimetableSummary>`. Each timetable mapping contains only `startStation`, `endStation`, `startOffset`, `endOffset` and never includes `stops`; the map key is the `timetableId`. Numeric keys are ascending. Include only successfully parsed IDs actually referenced by the successful response. Omit the entire field when there are no references or all mappings are missing. Preserve raw IDs on missing data, log a server integrity error, and never emit `UNKNOWN`, null map values or convert the whole response to 500. Complete stops appear only in `GetCurrentTrainTimetableData` and `GetTrainTimetableHistoryDetailData`; a timetable detail that already contains complete content does not repeat `timetableMappings`.

Historical timetable is keyed by `timetableId`; coverage rows use `coverageId`; `historyId` disappears from v2. A stop contains `stationNo`, `stationName`, optional relative `arriveOffset`/`departOffset`, object `stationTrainCode`, `isStart`, `isEnd`. Offsets are seconds from service-day midnight, never absolute `arriveAt/departAt`.

`GET /api/v2/timetable/train/:trainCode/history` uses the existing non-paginated store query, returns all coverages with numeric IDs and integer `serviceDayStart/serviceDayEndExclusive`, no cursor/limit/nextCursor, no count cap, and deduplicated complete mappings. Cost is the existing per-record cost over all coverages; cache age derives from the earliest coverage service day, with the default policy when empty. Detail path is `/history/:timetableId`, keeps immutable caching, and uses separate JSON/protobuf ETags.

Records/history IDs are JSON numbers and protobuf uint32. EMU allocation paths accept external `emuCode`, while responses return canonical `emuId`, omit redundant `requestEmuId`, and attach mappings. Current timetable keeps both requested and canonical train fields, both as `TrainCode` objects. Unix-second ranges (`start/end`, `startAt/endAt`, `updatedAt`) stay instants, not service days.

## 8. Typed favorites and event subscriptions

Favorites use `FavoriteTarget.oneof`: `train { TrainCode }`, `emu { uint32 emu_id }`, `station { string station_name }`; remove generic `type + code`. Event subscriptions use `train { TrainCode }`, `emu { uint32 emu_id }`, `feedback { uint32 topic_id }`; `label` and `path` remain UI-derived strings only. EMU-bearing lists expose top-level `emuCodeMappings`.

收藏/事件订阅持久化已迁移为 v2 typed 表示：`user_profiles.data_json` 的 favorites 使用嵌套 `target`（train 含 TrainCode、emu 含 emuId、station 含 stationName），事件订阅使用 `user_event_subscriptions_v2` 表（`kind` + `emu_id`/`topic_id`/`train_prefix`/`train_number` + 规范化 `target_key`，保证唯一性与按目标反查）。迁移脚本为 `scripts/migrate-emu-storage-v2.mjs`（`pnpm migrate:auth-v2`，默认 dry-run、`--apply` 才写、apply 前保留 `.v1.bak`、解析不到的旧条目跳过并写入 `data/migrate-auth-v2-skipped.jsonl`）。v1 收藏/事件订阅路由（GET/PUT/DELETE）已删除，v1 行为不再保留。Deleting train/EMU favorites still attempts linked subscription deletion; missing subscription is ignored, other errors fail. Device Web Push `id` remains an independent decimal resource ID.

## 9. CSV-only exports

Remove JSONL serialization, generation, indexing, reading, counting, task-result fields and logs. Keep `data/exports/YYYYMMDD.csv`. The daily executor name, schedule and operations entry point stay unchanged; `writeDailyExportFiles` becomes a single CSV writer returning `{ filePath, total }` and logs only CSV. Add explicit, default-off `pnpm exports:v2:migrate` to rebuild historical CSV files for the service days actually present in the database using the same generator; do not auto-delete old JSONL, and after deployment the application must not recognize/read/display JSONL.

CSV columns are exactly `trainCode,emuCode,startStation,endStation,startTime,endTime`. This is the sole v2 external conversion exception: canonical uppercase train string and mapped canonical EMU string; do not output train prefix/number, emuId, serviceDay, timetableId or mapping blocks. Include UTF-8 BOM and existing safe CSV escaping. Compute times in Asia/Shanghai with each record's actual departure natural day as D=0: departure always `HH:MM`, same-day arrival `HH:MM`, next-day `HH:MM+1`, and so on without a day cap. Truncate seconds, never round. Invalid `startAt` yields empty `startTime`; invalid or earlier `endAt` yields empty `endTime` and a warning; never emit `00:00`, negative suffixes or raw timestamps. Sort by valid `startAt`, missing start last, then trainCode, emuCode, record ID stably.

The v2 index keeps the current `year`/`month` query and `selectedYear`, `selectedMonth`, `availableYears`, and `availableMonths` fields. Each index item contains only `serviceDay`; remove `formats`. Download removes `format` query, is fixed CSV, and keeps `binary`. Structured JSON data is `{ serviceDay, total, content }`; protobuf data is `{ uint32 serviceDay, uint32 total, bytes content }`, with bytes exactly the UTF-8+BOM CSV. `binary=true` returns `text/csv; charset=utf-8`, `Content-Disposition`, and original text. PNG/PDF and CSV raw/binary branches remain raw media; normal protobuf branches use operation-specific response messages with `bytes content` and metadata.

## 10. Tooling and generated code

- Runtime dependency: `@bufbuild/protobuf`.
- Fixed-version Buf CLI and codegen plugins are devDependencies; invoke through `pnpm exec`, never global installs.
- Generated ESM TypeScript is committed under `server/generated/proto/opencrh/v2/**`; generated headers state source and generator, and generated files are never hand-edited.
- Add `pnpm proto:generate` and `pnpm proto:check`; neither is hooked into build/dev/typecheck/postinstall/default commands.
- `proto:check` runs only Buf format/lint plus generated-code TypeScript typecheck. It does not regenerate-and-diff, drift-check, route coverage, or breaking-baseline checks.

已固定的精确版本（均为 devDependencies/dependencies 中的固定版本，不使用 `^`）：

```text
@bufbuild/protobuf        2.13.0  (dependencies)
@bufbuild/protoc-gen-es   2.13.0  (devDependencies)
@bufbuild/buf             1.72.0  (devDependencies)
```

脚本形态：

```json
{
    "proto:generate": "pnpm exec buf format -w proto && pnpm exec buf generate proto --template proto/buf.gen.yaml",
    "proto:check": "pnpm exec buf format --diff proto && pnpm exec buf lint proto && pnpm exec tsc -p server/generated/tsconfig.json --noEmit"
}
```

## 11. Phased implementation order

1. Freeze manifest naming and derive the 100-route inventory.
2. Extract domain operations from v1 handlers without changing v1 behavior; add v2 adapters only after each operation has a shared service boundary.
3. Introduce proto sources, Buf config, generated output, codec adapters, and `executeV2Operation` with negotiation/error/header behavior.
4. Implement public read operations, then authenticated writes, then admin/OAuth/feedback/system operations, preserving scope/cost keys.
5. Implement typed mappings, timetable/history shape changes, cursor format, and full-history special case.
6. Complete CSV-only export service migration, v1 export tightening, migration command, and raw-media branches.
7. Add all 100 concrete route files and verify each references exactly one manifest operation.
8. Run required checks and execute the manual matrix below before release.

## 12. Verification matrix

Required commands:

```text
pnpm typecheck
pnpm proto:check
```

Manual verification must cover, with expected status/body/headers recorded: public read; authenticated write; admin; OAuth; feedback; open `Struct`; JSON/protobuf success and errors; Accept q-values, 406, Content-Type and 415; corrupted protobuf; unknown fields; enums; cookie/API key identity; scope; quota and auth rate limit; CSRF; CORS; HEAD; OPTIONS; `Vary` and distinct ETags; EMU mappings and missing mappings; complete timetable mappings; unpaginated full timetable history; numeric record IDs; `serviceDay:id` cursors; CSV-only index/download; cross-day `HH:MM+D`; invalid times; stable CSV sort; PNG/PDF/CSV raw media; and intentional incompatibility of the two v1 export endpoints.

Each case must assert that v2 has no version header/body marker, JSON has no `meta`, protobuf uses the operation-specific `oneof`, and headers remain authoritative for quota metadata.

## 13. Explicit non-decisions / stop conditions

The implementation may choose exact package versions, the operation/message naming algorithm, and the ETag string format while preserving all behavioral requirements above. It must stop and ask the maintainer when any other needed detail is absent rather than inventing behavior. In particular, do not infer new scopes, change status semantics, choose additional dynamic `Struct` fields, add new task variants beyond currently known ones, alter cookie security attributes, or broaden route scope to `server/routes`. Persistent favorite/subscription schemas are v2 typed and migrated by `migrate:auth-v2`; further schema changes require the same explicit script pattern.

## 14. 已确认的实施决策（维护者答复 + 自主决策）

以下为维护者对实施前待确认项的最终答复，以及授权 Codex 自主决定后的固定值：

1. **Proto 源目录与文件拆分**：源目录固定在仓库根 `proto/opencrh/v2/**`；按第 5 节拆分 14 个文件，不允许再新增文件。生成目录固定在 `server/generated/proto/opencrh/v2/**`。
2. **manifest 位置**：权威索引固定在 `server/utils/api/v2/v2OperationManifest.ts`，条目可按领域放在 `server/utils/api/v2/manifestEntries/*.ts` 并由根文件扁平汇总导出 `V2_OPERATION_MANIFEST`。
3. **命名算法**：operation 名称 = `Verb + PascalCase(路径静态段) + 动态参数名`，但 `*Id` 形态、导出接口、站/车时刻表等按操作索引表的固定名称执行（见 [api-v2-operation-index.md](./api-v2-operation-index.md)）。message 名称固定为 `<OperationName>Request`、`<OperationName>Data`、`<OperationName>Response`。
4. **工具链版本**：`@bufbuild/protobuf@2.13.0`（依赖）、`@bufbuild/protoc-gen-es@2.13.0` 与 `@bufbuild/buf@1.72.0`（devDependencies），全部精确固定。
5. **ETag 格式**：结构化响应按 codec 区分，`"v2-json-<sha256 前 16 位>"` 与 `"v2-proto-<sha256 前 16 位>"`；原始媒体 `"v2-raw-<mediaType 斜杠转短横线>-<sha256 前 16 位>"`。hash 输入为最终响应 body 的完整字节（protobuf 为二进制字节，JSON 为最终序列化字符串字节，原始媒体为原始内容字节）。不实现 304 短路，只设置强 ETag。
6. **多重失败优先级**：同一请求同时存在多个失败条件时，统一返回 JSON 400（错误码取第一个检测到的失败条件）。
7. **v2 导出索引字段**：保留现有 `year`/`month` query 与 `selectedYear`、`selectedMonth`、`availableYears`、`availableMonths`；仅每项改为 `{ serviceDay }` 并删除 `formats`。
8. **`pnpm exports:v2:migrate` 范围**：按 `daily_emu_routes` 中实际存在的不同 `service_date` 逐个重建 `YYYYMMDD.csv`，不删除旧 JSONL。

另外自主确定的实现级决策：

- 共享 domain 模块布局见 3.3；v2 路由文件为 `server/api/v2/<path>.<method>.ts` 的真实文件，每个文件只调用 `executeV2Operation(event, '<OperationName>')`，禁止 catch-all。
- v2 JSON 与 protobuf 输出由 protobuf-es 生成的 message 驱动：handler 返回与 `XxxData` 字段一致的普通对象，codec 负责 `create`/`fromJson`/`toJson`/binary 编解码；JSON 不携带 `meta`，`remain/cost/retry-after` 继续只走响应头。
- `proto:check` 使用独立的 `server/generated/tsconfig.json` 只检查生成代码，避免把全仓 typecheck 混入。
