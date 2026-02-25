# 任务调度系统实现方案（配置化轮询 + 防重入 + 执行器注册）

## 摘要

在现有 `tasks` 表基础上，新增服务端常驻调度器：每隔配置间隔（默认 5 分钟）扫描到期任务（`executionTime <= now`），按时间顺序串行执行。  
执行器通过注册机制接入，任务执行函数返回 `Promise`；`resolve/reject` 均视为该任务本轮完成并出队。  
若上一轮扫描未结束，下一次定时触发直接跳过，避免并发重入。

## 已确认决策

1. 轮询间隔配置化，放在 `task.scheduler`。
2. 任务执行串行（`executionTime ASC, id ASC`）。
3. `executionTime` 使用秒时间戳。
4. 任务 Promise reject 时也删除该任务。
5. 单任务失败不影响同批次后续任务继续执行。

## 配置与接口变更

### 配置新增

- `data/config.json`
  - `task.scheduler.pollIntervalMs`（默认 `300000`）
- 同步更新：
  - `assets/json/configScheme.json`
  - `server/config.ts`（`Config` 类型 + 校验）

### 执行器注册 API

新增 `server/services/taskExecutorRegistry.ts`：

- `registerTaskExecutor(executorName: string, handler: (args: unknown) => Promise<void>): () => void`
- `getTaskExecutor(executorName: string): ((args: unknown) => Promise<void>) | null`

### 任务入队 API

新增 `server/services/taskQueue.ts`：

- `enqueueTask(executor: string, args: unknown, executionTime: number): number`
- 行为：`args` 序列化为 JSON 写入 `tasks.arguments`，返回 `task id`。

### 调度器启动入口

新增 `server/plugins/taskScheduler.ts`：

- Nitro 启动时调用 `startTaskScheduler()`。

## SQL 与数据库层变更

### 修正任务表建表 SQL

`assets/sql/tasks/createTable.sql`：

- 改为正确索引语法：
  - `CREATE INDEX IF NOT EXISTS executionTimeIndex ON tasks(executionTime);`

### 修正插入 SQL

`assets/sql/tasks/addTask.sql`：

- 改为显式列名：
  - `INSERT INTO tasks (executor, arguments, executionTime) VALUES (?, ?, ?)`

### 修正查询 SQL

`assets/sql/tasks/selectTasks.sql`：

- 增加排序保证：
  - `SELECT id, executor, arguments, executionTime FROM tasks WHERE executionTime <= ? ORDER BY executionTime ASC, id ASC`

### 删除 SQL 按 id 删除

新增 `assets/sql/tasks/completeTask.sql`：

- `DELETE FROM tasks WHERE id = ?`

说明：旧 `completeTasks.sql` 停用或保留但不再引用。

### 接入 task 数据库初始化

修改 `server/libs/database/task.ts`：

- 注册 `registerDatabaseInitializer('task', ensureTaskSchema)`
- 载入并执行 `assets/sql/tasks/createTable.sql`

## 调度器运行逻辑

新增 `server/services/taskScheduler.ts`：

1. 内部状态
- `timer: NodeJS.Timeout | null`
- `isChecking = false`
- `started = false`

2. 启动逻辑
- `startTaskScheduler()` 幂等（重复调用不重复启动）
- `setInterval(tick, pollIntervalMs)`
- 启动后立即 `void tick()` 执行一次

3. 防重入
- `tick()` 入口检查 `isChecking`
- 若 `true`：记录 skip 日志并返回
- 若 `false`：置 `isChecking = true`，在 `finally` 复位

4. 串行执行流程
- `now = Math.floor(Date.now() / 1000)`
- 查询到期任务（已排序）
- `for...of` 串行执行每条：
  - 解析 `arguments` JSON（失败记 error）
  - 取 executor（未注册记 error）
  - 调用 handler 并 `await`
  - 无论成功失败，最终按 `id` 删除任务
- 单条任务异常不影响后续任务

## 日志方案

logger 名：`task-scheduler`

- `info`
  - 调度器启动（间隔）
  - 每轮开始/结束（到期任务数、耗时）
  - 重入跳过（skip）
- `warn/error`
  - 参数 JSON 解析失败
  - executor 未注册
  - executor 执行失败（含 task id、executor、错误）

## 文件改动清单

### 修改

- `data/config.json`
- `assets/json/configScheme.json`
- `server/config.ts`
- `assets/sql/tasks/createTable.sql`
- `assets/sql/tasks/addTask.sql`
- `assets/sql/tasks/selectTasks.sql`
- `server/libs/database/task.ts`

### 新增

- `assets/sql/tasks/completeTask.sql`
- `server/services/taskExecutorRegistry.ts`
- `server/services/taskQueue.ts`
- `server/services/taskScheduler.ts`
- `server/plugins/taskScheduler.ts`

## 验收场景

1. 插入一条到期任务，下一轮扫描应执行并删除。
2. 插入多条任务，执行顺序应为 `executionTime ASC, id ASC`。
3. 构造长任务导致跨轮，下一轮应被 skip（无并发重入）。
4. 构造 reject 任务，失败后应删除，且后续任务继续执行。
5. 修改 `pollIntervalMs` 后重启，轮询频率变化。
6. 校验通过：
   - `pnpm run typecheck:server`
   - `pnpm build`

## 假设

1. 当前为单实例进程，不做跨进程锁。
2. `arguments` 一律 JSON 序列化。
3. 未注册 executor 视为失败并删除，防止死队列。
