# `/api/v2` 实施工程简报（子代理专用）

本文件是子代理并行实施时必须遵守的工程契约。行为规格以 `docs/api-v2-implementation-spec.md`、`docs/api-v2-operation-index.md`、`docs/api-v2-domain-modules.md` 为权威；本文件只补充实现级文件布局、命名、模板与工作流，不改变行为规格。

## 1. 硬边界

- 不修改前端（`app.vue`、`components/`、`pages/`、`composables/`、`service-worker/`）、`utils/docs/**`、README 或其他公开文档。
- 不修改 `server/routes/**`（OAuth、`.well-known`、sitemap 不属于 v2）。
- 不新增 scope、不改变 v1 行为，唯一例外是两个 v1 导出接口收紧为 CSV-only。
- 收藏/事件订阅持久化改为 v2 typed 表示：`user_profiles.data_json` 的 favorites 使用嵌套 `target`（train/emu/station），事件订阅使用 `user_event_subscriptions_v2` 表（kind + emu_id/topic_id/train_prefix/train_number + target_key）。迁移由 `scripts/migrate-emu-storage-v2.mjs`（`pnpm migrate:auth-v2`，默认 dry-run、`--apply` 才写）负责；v1 收藏/事件订阅路由已删除，v1 行为不再保留。
- 不使用 `useRequestFetch()` 或内部 HTTP 请求在 v1/v2 间调用。
- 不提交 Git；不要运行 git 命令。所有文件直接写入工作区。
- 不要启动子代理；所有工作自己做。
- 遇到规格未覆盖且无法自行决定的细节：停止该子任务，把问题写进 final 回复，不要猜测。
- 代码风格：4 空格缩进、LF、单引号、分号、UTF-8、文件末尾换行；改完自己运行 `pnpm exec prettier --write <自己负责的文件>`。

## 2. 目录布局

```text
proto/opencrh/v2/                        protobuf 权威源（固定 14 个文件，不新增）
server/generated/proto/opencrh/v2/**     生成 ESM TS（只由 pnpm proto:generate 生成，不手改）
server/domain/**                         共享 domain 函数（v1/v2 共用）
server/utils/api/v2/                     执行器与 manifest
server/utils/api/v2/manifestEntries/*.ts manifest 条目（按领域）
server/utils/api/v2/adapters/*.ts        v2 wire adapter（URL/query/body → domain → data 对象）
server/api/v2/**                         100 个薄路由文件
```

## 3. Protobuf 约定

- 每个源文件：`syntax = "proto3";`、`package opencrh.v2;`；跨文件用 `import "opencrh/v2/xxx.proto";`。
- 固定 14 个文件，各自归属见 `docs/api-v2-implementation-spec.md` 第 5 节；不新增文件。
- 每个 operation 定义 `<OperationName>Request`、`<OperationName>Data`、`<OperationName>Response` 三个 message，operation 名以 `docs/api-v2-operation-index.md` 为准。
- `XxxResponse` 统一结构：

```proto
message XxxResponse {
    ApiMeta meta = 1;
    oneof outcome {
        XxxData data = 2;
        ApiError error = 3;
    }
}
```

- `ApiError`、`ApiMeta`、`TrainCode`、`TimetableStop`、`HistoricalTimetableSummary` 已在 `common.proto`、`identifiers.proto`、`mappings.proto` 定义，直接 import 复用，不得重复定义。
- 字段规则：
    - 数据库 ID（emuId、记录 ID、coverageId、timetableId、topicId、subscription ID、revokeId、clientId、userId、qqNumber、groupId 等）一律 `uint32`；JSON 输出 number。
    - `serviceDay`、`serviceDayStart`、`serviceDayEndExclusive` 等语义为服务日的字段一律 `uint32`（epoch day）。
    - 真实时间点（Unix 秒，如 start/end、startAt/endAt、updatedAt、activeFrom、expiresAt、arrive_offset/depart_offset、start_offset/end_offset、remain/cost/retry_after）一律 `int64`。
    - 可空标量用 `proto3 optional`，绝不用 0/-1/空字符串当哨兵。
    - 字段名 snake_case；JSON 由 protobuf-es 自动输出 camelCase。
    - 有限集合用 enum，零值命名 `<PREFIX>_UNSPECIFIED = 0`，值名使用与 v1 JSON 完全一致的小写 snake_case（已关闭 ENUM_VALUE_UPPER_SNAKE_CASE lint）。示例：`enum FavoriteKind { favorite_kind_unspecified = 0; train = 1; emu = 2; station = 3; }`。JSON 输入/输出就是这些小写字符串；未知 enum 字符串输入由 fromJson 抛错 → 400。
    - `google.protobuf.Struct` 只允许出现在规格明确开放的字段：`FeedbackMessage.meta`、admin 审计/溯源 `payload`、`taskArgs`、`detail`。整个 request/data/response 不允许用 Struct 代替。
    - 分页 cursor/nextCursor 是不透明字符串；无下一页时 `nextCursor` 为 `''`，仍回显当前 `cursor`。
- 已知管理员任务变体（`regenerate_daily_export`、`refresh_route_info_now`、`refresh_train_circulation_now`、`refresh_all_routes_and_requeue_probe_now`、`detect_coupled_emu_group_now`、`run_qrcode_detection_now`、`dispatch_station_board_tasks_now`）用强类型 oneof，字段名/类型对照现有 `adminTaskStore`/v1 handler 的 payload。
- `GetTrainTimetableHistoryData`：每项含 `coverage_id`、`timetable_id`、`service_day_start`、`service_day_end_exclusive`、起终点/起止 offset（可空）、start/end Unix 秒（可空）等，无 cursor/limit/nextCursor。
- `GetTrainTimetableHistoryDetailData`：`timetable_id` + 完整时刻表内容（起终站、start/end offset、完整 `TimetableStop` 列表）；`timetableMappings` 不重复出现在详情里。
- v2 中不再出现 `historyId`、`requestEmuId`、`type + code` 泛化收藏、`targetType + targetId` 泛化订阅、JSONL/`formats`。
- 收藏/订阅持久化也使用上述 typed 表示（不再是 `type + code` / `targetType + targetId` 字符串），由 `migrate-emu-storage-v2.mjs` 的 auth 迁移步骤转换旧数据。

## 4. Domain 函数约定

- 文件与导出函数名以 `docs/api-v2-domain-modules.md` 为准。
- 签名自己设计，但必须满足：不接收 `H3Event`、不设置 cookie/header、不做外部字符串格式化（返回 `ServiceDay`、`EmuId`、`TrainCodeParts`、数字 ID、内部枚举等内部类型）。
- 输入解析/业务校验（含 ApiRequestError）放入 domain 函数；v1/v2 adapter 只做外部格式初检（正则、非空）和 wire 格式化。
- 已有 service/store 直接复用（`server/services/**`、`server/libs/**`、`server/utils/**`），不要复制数据库逻辑。
- 与现有 v1 行为保持一致：错误码、userMessage、HTTP 状态、scope、cost 不变。

## 5. V2 adapter 与 manifest 条目模板

v2 路由文件（由总控生成，不要自己创建）：

```ts
import { defineEventHandler } from 'h3';
import executeV2Operation from '~/server/utils/api/v2/executeV2Operation';

export default defineEventHandler((event) => {
    return executeV2Operation(event, 'GetDailyRecords');
});
```

adapter 文件按领域放在 `server/utils/api/v2/adapters/<domain>.ts`，导出 `async function <OperationCamel>V2Adapter(ctx): Promise<Record<string, unknown>>`。`ctx` 来自 `server/utils/api/v2/V2Types.ts` 的 `V2OperationContext<XxxRequestSchema>`，包含 `event`、`identity`、`params`、`query`、`request`（已解码的 request message，body 字段用 `ctx.request.xxx` 读）。

生成的 message 类型与 schema 常量分离：`XxxRequest` 是类型，`XxxRequestSchema` 是 `GenMessage` 常量；manifest 条目里填 `xxxRequestSchema`/`xxxDataSchema`/`xxxResponseSchema`。adapter 返回普通对象即可（`int64` 字段传 number 运行时合法；TS 类型是 bigint，所以 adapter 返回类型用 `Record<string, unknown>`，需要时用 `create(DataSchema, {...} as never)` 或局部类型断言）。

manifest 条目按领域放在 `server/utils/api/v2/manifestEntries/<domain>.ts`：

```ts
import { defineV2Operation } from '~/server/utils/api/v2/V2Types';
import {
    GetDailyRecordsRequestSchema,
    GetDailyRecordsDataSchema,
    GetDailyRecordsResponseSchema
} from '~/server/generated/proto/opencrh/v2/lookup_pb';
import { getDailyRecordsV2Adapter } from '~/server/utils/api/v2/adapters/lookup';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';

export const getDailyRecordsEntry = defineV2Operation({
    operationName: 'GetDailyRecords',
    method: 'GET',
    pathTemplate: '/api/v2/records/daily',
    requestSchema: GetDailyRecordsRequestSchema,
    dataSchema: GetDailyRecordsDataSchema,
    responseSchema: GetDailyRecordsResponseSchema,
    requiredScopes: [API_SCOPES.records.daily.read],
    cors: true,
    cost: {
        kind: 'perRecord',
        key: 'recordsDaily',
        count: (data) => data.items.length
    },
    cache: (data) => getDailyResponseCacheControlMaxAge(data.date),
    bodyMode: 'none',
    handler: getDailyRecordsV2Adapter
});
```

`defineV2Operation`、`V2OperationContext`、`V2ManifestEntry` 由总控提供；条目最终由总控汇总进 `server/utils/api/v2/v2OperationManifest.ts`。manifest 条目文件之间不得互相依赖，只 import `V2Types` 与生成的 message 类型。

## 6. V2 数据形状要点（相对 v1 的差异）

- 记录/历史列表：`id`/`coverageId`/`timetableId` 输出 number；`serviceDate` → `serviceDay`（epoch day）；`emuCode` → `emuId`（number）+ 顶层 `emuCodeMappings`；`trainCode` → `TrainCode` 对象。
- 当前时刻表：`requestTrainCode` 与 `trainCode` 都是 `TrainCode` 对象。
- 收藏：`FavoriteTarget.oneof`（train 含 TrainCode、emu 含 emuId、station 含 stationName）；事件订阅 oneof 同理；EMU 相关列表附 `emuCodeMappings`。
- 映射：`emuCodeMappings` JSON 为 `Record<string,string>`（key 是十进制 emuId 字符串），proto 为 `map<uint32,string>`；`timetableMappings` JSON 为 `Record<string,HistoricalTimetableSummary>`，proto 为 `map<uint32,HistoricalTimetableSummary>`，map key 是 `timetableId`，值只含 `startStation/endStation/startOffset/endOffset`，不含 stops；按数值 key 升序；无引用或全部缺失时整个字段省略；缺失时保留原始 ID 并 `console.error` 记录完整性错误，响应仍成功。
- 资源引用收集：只收集本 operation schema 顶层明确声明映射字段且 data 实际引用的 ID。

## 7. 内容协商与错误（执行器行为，adapter 只需配合）

- Accept 缺省/空/`*/*` → JSON；支持 JSON（含 charset）与 `application/x-protobuf`；q 值高者胜，相同取 JSON，q=0 不可接受；仅声明其他类型 → JSON 406。
- 有 body 的接口只接受 JSON 与 protobuf；非空 body 缺 Content-Type 或类型不符 → JSON 415。空 body 对专属空 request 可缺 Content-Type。
- 请求 Content-Type 不决定响应格式；响应只看 Accept。
- Accept 已协商 protobuf 时，业务/解码/校验错误用该 operation 的 protobuf error response（`error` 分支 + meta）；406/415 用 JSON；多个失败同时存在时统一 JSON 400（错误码取第一个）。
- HEAD 复用 GET 语义，抑制 body，不重复扣费；OPTIONS 由 middleware 204。
- 结构化响应合并 `Vary: Accept`；JSON/protobuf 使用不同 ETag；原始 CSV/PNG/PDF 保持各自媒体 ETag 与 Content-Type。

## 8. CSV 导出合同（exports 子任务专用）

- `dailyExportStore.ts` 只保留 CSV：删掉 JSONL 类型/序列化/索引/读取/计数；`writeDailyExportFiles` 改为 `writeDailyExportCsv(date, rows): { filePath: string; total: number }`，只写 `data/exports/YYYYMMDD.csv`，日志只记录 CSV。
- 固定列 `trainCode,emuCode,startStation,endStation,startTime,endTime`；带 UTF-8 BOM；现有安全 escaping。
- `trainCode` 用 canonical 大写字符串；`emuCode` 用 mapping 表 canonical 字符串；不输出 trainPrefix/trainNumber、emuId、serviceDay、timetableId、映射区块。
- 时间按 Asia/Shanghai，以该记录实际始发自然日为 D=0：始发总是 `HH:MM`；终到同日 `HH:MM`、次日 `HH:MM+1`、多日 `HH:MM+D`；秒直接截断；startAt 无效 → startTime 空；endAt 无效或早于 startAt → endTime 空并写告警（logger.warn）。
- 排序：有效 startAt 升序，缺失始发放末尾，再按 trainCode、emuCode、记录 ID 稳定排序。
- v2 索引保留 `year`/`month` query 与 `selectedYear`/`selectedMonth`/`availableYears`/`availableMonths`；每项只有 `serviceDay`，删除 `formats`；索引项日期从文件名 `YYYYMMDD.csv` 解析。
- 下载：删除 `format` query，固定 CSV；`binary=true` 返回 `text/csv; charset=utf-8` + Content-Disposition + 原始文本；结构化 JSON `{ serviceDay, total, content }`；protobuf `{ uint32 service_day, uint32 total, bytes content }`。
- v1 导出两个 handler 同步收紧为 CSV-only（删除 format 参数；`format` query 传 jsonl 时按 v1 现有校验返回 400）。
- `scripts/migrate-daily-exports-v2.mjs`：显式命令（package.json 已加 `pnpm exports:v2:migrate`），按数据库 `daily_emu_routes` 实际存在的不同 service_date 重建 `YYYYMMDD.csv`（用同一 generator），不删除旧 JSONL；脚本参考现有 `scripts/migrate-*.mjs` 的仓库根定位方式，直接打开 `data/config.json` 指定的数据库文件（先读 `server/libs/database.ts` 了解库文件路径约定）。

## 9. 工作流与验收

1. 先读三个权威文档和本简报；再读自己负责的全部 v1 handler 与相关 service。
2. 先写/重构 domain 函数并重构 v1 handler（保持 v1 行为不变）；再写 proto 文件；等待总控执行 `pnpm proto:generate` 后写 v2 adapter 与 manifest 条目。
3. 每次改动后对自己负责的文件运行 prettier；尽量让 `pnpm typecheck:server` 中自己文件的错误归零（其他代理正在改的文件报错可忽略，但要在 final 里说明）。
4. 不要运行 `pnpm typecheck`（全仓检查由总控最终统一执行）。
5. final 回复必须包含：完成清单、改动文件列表、未决问题、验证结果（typecheck:server/prettier/buf 状态）。
