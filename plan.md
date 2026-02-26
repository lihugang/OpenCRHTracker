# OpenCRHTracker 总体实施计划（Phase A 定稿 + Phase B 定稿）

## 一、项目总目标
1. 追踪每辆动车组在每一天的运用情况（当日跑了哪些线路/车次）。
2. 提供统一 API 和 UI 查询能力：按车组号查历史、按车次号查历史。
3. 提供全量记录导出能力（CSV、JSON）。
4. API-first：前端只调用 API，不绕过后端直连数据。

## 二、总体路线图（总计划）
1. Phase A：基础协议与配置基线（已定稿）。
2. Phase B：账号、Key、配额与查询协议（已定稿）。
3. Phase C：数据层与采集任务（待你后续详细说明）。
4. Phase D：查询性能与导出工程化。
5. Phase E：上线、灰度、监控与持续迭代。

## 三、Phase A（基础协议与配置基线）定稿

### 3.1 目标与交付
1. 统一 API 响应体、错误码体系、响应头语义。
2. 建立 token-cost 引擎的基础能力（不依赖采集业务）。
3. 扩展配置中心（`user`、`api`、`quota`、`cost`）并落地 schema 严格校验。
4. 提供可验证占位 API：`health`、`quota/me`、`debug/echo-error`。

### 3.2 统一 API 契约（强约束）
1. 成功响应体：`{ ok: true, data: xxx, error: '' }`
2. 失败响应体：`{ ok: false, data: '用户可读的错误信息', error: '英文错误代码' }`
3. 失败请求必须同时返回：
- 合适的 HTTP 错误状态码
- JSON `error` 业务错误码（下划线命名）
4. 错误映射策略：一对多映射（同一 HTTP 码可对应多个 `error` 码）。

### 3.3 响应头规范
1. 所有 API 都返回：
- `remain`: 当前身份剩余 token（整数）
- `cost`: 本次请求消耗 token（整数）
2. 额度不足时额外返回：
- `Retry-After`（秒）
- 按 token 缺口精确计算，不使用固定值。

### 3.4 配额状态与恢复
1. 当前阶段配额状态存储在内存。
2. 服务重启后额度重置到上限。
3. 不做并发限制。
4. `/api/v1` 允许演进（保留版本前缀，但允许增量调整）。

### 3.5 配置与 Schema
1. `data/config.json` 新增：
- `user`
- `api`
- `quota`
- `cost`
2. `assets/json/configScheme.json` 同步新增并启用严格模式。
3. 严格模式要求：关键字段缺失时启动失败。
4. `cost` 支持固定 cost 与按记录数计费规则（含向上取整）。

### 3.6 Phase A 占位 API
1. `GET /api/v1/health`
- 用于验证统一成功结构与 `remain/cost` 头。
2. `GET /api/v1/quota/me`
- 返回当前身份配额状态。
3. `GET /api/v1/debug/echo-error?code=`
- 用于验证统一失败结构与错误映射。
- 仅开发环境启用，生产关闭。

### 3.7 Phase A 验收标准
1. 成功请求：统一成功响应体 + `remain/cost` 头。
2. 失败请求：HTTP 错误状态码 + JSON `error` 同时存在。
3. `error` 统一下划线命名（如 `invalid_param`、`quota_exceeded`）。
4. 超额请求返回 `429` 且含 `Retry-After`。
5. schema 严格校验生效（缺字段启动失败）。
6. 重启后额度按规则回到上限。

## 四、Phase B（账号、Key、配额与查询协议）定稿

### 4.1 范围
- 范围内：`users`、`api_keys`、token-cost 配额、Key 管理 API、查询/导出协议。
- 范围外：`run_observations`、`daily_emu_routes`、`ingestion_batches`、`export_audits`、采集流程与索引设计。

### 4.2 数据库设计（SQLite / `data/emu.db`）
1. `users`
- `username TEXT PRIMARY KEY`
- `salt TEXT NOT NULL`
- `password_hash TEXT NOT NULL`
- `created_at INTEGER NOT NULL`
- `last_login_at INTEGER`

2. `api_keys`
- `key TEXT PRIMARY KEY`
- `user_id TEXT NOT NULL`（对应 `users.username`）
- `created_at INTEGER NOT NULL`
- `revoked_at INTEGER`
- `expires_at INTEGER NOT NULL`
- `daily_token_limit INTEGER NOT NULL`

备注：按当前决策，`api_keys.key` 明文存储；`users` 不含 `status` 字段。

### 4.3 身份与额度归属
1. 未带 Key：匿名身份，额度按 IP。
2. 带有效 Key：登录身份，额度按用户（`user_id`）。
3. 配额跟用户走，不跟具体 Key 走。
4. API 不带 Key 也可访问，但按匿名额度计算。

### 4.4 Token 规则与 cost
1. 额度上限
- 匿名：`20`
- 登录用户：`1000`

2. 恢复规则
- 每小时统一恢复 `+100` token。

3. API 调用 cost（配置化）
- `POST /api/v1/auth/login`：`2`
- `POST /api/v1/auth/api-keys`（签发）：`10`
- `GET /api/v1/auth/api-keys`（脱敏列表）：`2`
- `DELETE /api/v1/auth/api-keys/:key`（撤销）：`1`
- `GET /api/v1/history/emu/:emuCode`：`0.05 token/条记录`（请求总成本向上取整）
- `GET /api/v1/history/train/:trainCode`：`0.05 token/条记录`（请求总成本向上取整）
- `GET /api/v1/records/daily`：`0.05 token/条记录`（请求总成本向上取整）
- `GET /api/v1/exports/daily`：`100`
- `GET /api/v1/quota/me`：`1`

### 4.5 查询与导出协议
1. 时间参数统一
- `startDate/endDate` 改为 `start/end`
- 单位：Unix 秒级时间戳

2. 游标协议
- 列表查询统一 `cursor + limit`
- 排序固定：`ts desc, id desc`
- `limit` 默认 20，最大 200
- 返回 `nextCursor`，为空表示到底

3. 导出范围
- 仅保留单日导出：`GET /api/v1/exports/daily?date=<YYYYMMDD>&format=csv|json`
- 区间导出不做

### 4.6 Phase B 验收标准
1. 匿名与 Key 用户命中不同额度池（IP vs user）。
2. Key 列表接口只返回脱敏 key。
3. `start/end` 秒级语义正确。
4. 按 `ceil(记录数 * 0.05)` 计算 cost 正确。

## 五、Phase C（采集阶段）待定决策
1. 采集来源优先级与容灾策略。
2. 调度频率、批次并发与重试上限。
3. 原始观测表、聚合表、审计表结构。
4. 幂等键与去重规则（车组/车次/时间窗口）。
5. 回填策略（是否补历史、补多久、补失败重跑）。
6. 数据质量规则（冲突处理、可信度评估）。

## 六、全局验收清单
1. 所有 API 响应头都包含 `remain/cost`。
2. 失败请求都满足“HTTP 错误码 + JSON error”。
3. 额度不足返回 `429` 且带 `Retry-After`。
4. 配置改动可通过 schema 严格校验。

## 七、说明
当前文档是“总计划 + 两阶段定稿”。
- Phase A：可作为基础设施任务直接实施。
- Phase B：在 Phase A 底座之上实施。
- Phase C：等待你下一轮采集细节后再展开成可实现级规格。

## 八、Phase C（数据层与采集任务）定稿（覆盖第五节“待定决策”）

### 8.1 目标与范围
1. 基于 `schedule.json` 的今日开行信息，自动生成并执行“发车采集任务”。
2. 按车次采集车组信息，并识别重联场景，形成可查询的结构化记录。
3. 在业务层完成去重与降载，减少重复调用 12306 并降低封禁风险。
4. 为 Phase B 已定义查询接口提供真实数据来源（`history/emu`、`history/train`、`records/daily`、`exports/daily`）。

### 8.2 已确认策略（本阶段固定）
1. 调度精度沿用当前任务轮询（5 分钟级）；不新增秒级 worker。
2. 重联识别采用“混合策略”：
- 优先复用上一班次重联状态（间隔阈值内）。
- 仅在不确定时做同所同型号候选枚举 + 畅行码核验。
3. 在路状态采用内存态（进程内）存储，服务重启后允许自然失效。
4. 候选枚举上限配置化，默认 `200`。
5. 去重采用业务去重（不改 `tasks` 表结构）：
- 今日已查询车次集合；
- 在路车组集合。
6. 车次去重主键采用 `internalCode`，空值回退 `trainCode + startAt`。
7. “今日已查询车次”按自然日切换清空。
8. 单车次任务启用“任务级重试”：
- 任务参数包含 `retry`。
- 查询失败且 `retry > 0` 时，重新推入 `tasks`，并将 `retry` 减 1。
- `retry` 默认值由配置提供，默认 `5`。
9. `emu.db` 仅保留查询数据，不保留审计/原始观测等附加信息。

### 8.3 配置项新增与默认值
1. `data/config.json` 新增/调整：
- `spider.params.routeProbeCarCode`（必填非空，默认可给 `CR400AF-C-2214`）。
- `spider.scheduleProbe.dailyTimeHHmm` 默认值调整为 `0200`（保留可配置）。
- `spider.scheduleProbe.coupling.candidateCap`：默认 `200`。
- `spider.scheduleProbe.coupling.reuseWithinSeconds`：默认 `3600`（1 小时）。
- `spider.scheduleProbe.coupling.runningGraceSeconds`：默认 `900`（到点后清理缓冲，避免抖动）。
- `spider.scheduleProbe.probe.defaultRetry`：默认 `5`。
2. `assets/json/configScheme.json` 与 `server/config.ts` 同步新增严格校验。
3. 代码注释要求：
- 在 `fetchEMUInfoByRoute.ts` 调用处补英文注释，明确 `carCode` 为 required placeholder，不能为空，值本身不影响结果。

### 8.4 任务编排（Task Executors）
1. 保留现有：
- `build_today_schedule`
- `generate_route_refresh_tasks`
- `refresh_route_batch`
2. 新增：
- `dispatch_daily_probe_tasks`：负责按今日开行生成“发车采集任务”。
- `probe_train_departure`：执行单车次采集、重联判定、结果入库与状态维护。
3. 触发时机：
- 服务启动时入队 `build_today_schedule` 与 `dispatch_daily_probe_tasks`。
- `build_today_schedule` 成功后再次入队 `dispatch_daily_probe_tasks`（确保有最新时刻表）。
- `dispatch_daily_probe_tasks` 每日按 `dailyTimeHHmm` 自我续期（与 build 同步策略）。
4. `probe_train_departure` 任务参数标准化：
- 必填：`trainCode`、`startAt`、`endAt`、`retry`。
- 可选：`trainInternalCode`、`allCodes`。
- 参数总长度需受控（现有 `tasks.arguments` 长度上限为 `511` 字符）。

### 8.5 `dispatch_daily_probe_tasks` 规则
1. 读取 `schedule` 状态文件，仅处理 `isRunningToday=true` 且 `startAt` 非空条目。
2. 先按“同交路合并”降载：
- 主键：`internalCode`；
- 备用键：`code + startAt`。
3. 对每个唯一主键只入队一条 `probe_train_departure`。
4. 入队 `executionTime`：
- `startAt > now`：按 `startAt` 入队；
- `startAt <= now`：立即入队（补偿启动延迟/重启场景）。
5. 参数中携带：
- `trainCode`
- `trainInternalCode`（可空）
- `allCodes`（用于双车次号同交路判定）
- `startAt`
- `endAt`
- `retry`（默认取 `spider.scheduleProbe.probe.defaultRetry`）

### 8.6 进程内状态（业务去重核心）
1. `queriedTodayTrainKeys: Set<string>`
- 存储已查询车次键；
- 键规则：`internal:<internalCode>` 或 `fallback:<trainCode>@<startAt>`；
- 跨日自动清空。
2. `runningEmuState: Map<string, RunningMeta>`
- Key 为 `emuCode`；
- Value 至少包含：`trainKey`、`startAt`、`endAt`、`lastSeenAt`；
- 过期清理规则：`now > endAt + runningGraceSeconds` 自动移除。
3. `lastTrainObservation: Map<string, LastObservationMeta>`
- Key 为 `trainInternalCode`（空值时回退 `fallback` 键）；
- 用于“上一班次 < 1 小时”快速复用重联信息。

### 8.7 `probe_train_departure` 执行流程
1. 计算当前 `trainKey`，若命中 `queriedTodayTrainKeys` 直接跳过。
2. 发起单次查询（本任务不再做循环重试）：
- 调用 `fetchEMUInfoByRoute` 获取主车组（主样本）。
3. 若查询失败：
- 当 `retry > 0`：立即重新入队 `probe_train_departure`，参数 `retry = retry - 1`。
- 当 `retry = 0`：记录失败日志后结束，不再重试。
4. 若查询成功：
- 主车组写入 `runningEmuState`（标记在路）。
- 优先走上一班次复用；不满足条件时再走候选枚举核验。
5. 候选枚举核验（仅当复用不可用/不可信）：
- 基于主车组在 `emu_list.jsonl` 判断是否存在重联可能（`multiple=true`）。
- 若可能，取“同型号 + 同动车所”候选集合。
- 过滤 `runningEmuState` 中仍在路的候选车组。
- 按 `candidateCap` 截断候选列表。
- 对候选依次执行 `qrcode.jsonl -> seatCode -> fetchEMUInfoBySeatCode`。
- 返回交路命中当前 `trainInternalCode` 或命中 `allCodes` 时，判定为重联成员。
6. 将最终查询结果落库（见 8.8），并更新 `lastTrainObservation`。
7. 将 `trainKey` 写入 `queriedTodayTrainKeys`，避免重复查询。

### 8.8 数据库落地（`data/emu.db`）
1. 新增并初始化 `EMUTracked` schema（当前仓库尚未注册该库初始化器）。
2. 仅保留一个查询表 `daily_emu_routes`（不再新增 `run_observations`、`ingestion_batches` 等表）。
3. `daily_emu_routes` 最小字段：
- `id`
- `train_code`
- `emu_code`
- `start_at`（秒级时间戳）
- `end_at`（秒级时间戳）
4. 唯一键建议：
- `(train_code, emu_code, start_at)`（用于幂等写入与压缩重复数据）。
5. 索引建议：
- `idx_train_start`：`(train_code, start_at DESC, id DESC)`
- `idx_emu_start`：`(emu_code, start_at DESC, id DESC)`
- `idx_start_id`：`(start_at DESC, id DESC)`

### 8.9 双车次号优化（必须实现）
1. 交路层唯一键优先用 `internalCode`，避免同交路双车次重复采集。
2. `allCodes` 作为同交路别名集合，参与重联核验匹配。
3. 对外查询按 `trainCode` 命中；采集阶段按 `internalCode` 去重，确保“少查一次网、少触发风控”。
4. 为兼容双车次查询，在不增加字段的前提下，可按 `allCodes` 回写多条 `train_code` 记录（网络请求仍只做一次）。

### 8.10 API 对接计划
1. `GET /api/v1/history/train/:trainCode`
- 由占位返回改为读 `daily_emu_routes`，支持 `start/end + cursor + limit`。
2. `GET /api/v1/history/emu/:emuCode`
- 按车组查询历史交路，排序与分页协议与 Phase B 一致。
3. `GET /api/v1/records/daily`
- 返回当日记录列表（由 `start_at` 过滤日期范围生成）。
4. `GET /api/v1/exports/daily`
- 基于同一数据源导出 JSON/CSV。

### 8.11 失败与降级策略
1. `fetchEMUInfoByRoute` 失败：
- `retry > 0` 时立即重入队列，`retry` 减 1。
- `retry = 0` 时终止重试，仅记日志。
2. 候选枚举超上限：记录 `candidate_cap_reached`，保留主样本并结束。
3. `qrcode` 缺失或 `seatCode` 查询失败：跳过该候选，继续下一候选，不中断整趟任务。
4. 写库命中唯一键冲突：视为幂等成功，不报错中断。
5. 数据资产缺失（`emu_list.jsonl`/`qrcode.jsonl`）：降级为“仅主样本 + 复用策略”运行。

### 8.12 Phase C 验收标准
1. 每日可按时刻表自动入队并执行发车采集。
2. 同交路双车次号仅触发一次真实查询（内部以 `internalCode` 去重）。
3. 同一自然日内重复触发同车次任务会被业务去重拦截。
4. 在路车组会被候选枚举跳过，不参与重联暴力探测。
5. 当 `上一班次间隔 < 1 小时` 时可复用重联状态，并维持在路状态正确更新。
6. 单车次任务失败后可按 `retry` 机制重入队列，且每次重试次数正确递减。
7. `retry` 默认值来自配置，默认 `5`。
8. `emu.db` 仅保留最小查询字段（`train_code`、`emu_code`、`start_at`、`end_at`）。
9. `history/emu`、`history/train`、`records/daily`、`exports/daily` 返回真实数据库数据。
10. `EMUTracked` 数据库可自动建表，服务重启后可继续采集。
