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