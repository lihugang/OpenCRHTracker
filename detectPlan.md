# 车辆追踪与重联检测改造方案

## 1. 目标

在尽量复用现有代码的前提下，扩展当前 `schedule probe -> dispatch -> probe_train_departure` 链路，把“重联判断状态”从纯内存补充为“内存缓存 + EMUTracked 状态表 + 延迟检测任务”的组合流程。

本方案默认采用以下约束：

- `status` 表按 `trainCode + emuTrainSetNo + status` 保存当日状态
- 每天固定时间清空 `status` 表
- 重联检测任务按 `动车所 + 车型` 分组
- 重联检测冷却时间只保存在内存中，不做持久化
- 尽量复用现有 `probeAssetStore`、`probeRuntimeState`、`probeTrainDepartureTaskExecutor`、任务调度器和 `daily_emu_routes`

## 2. 现有代码复用原则

本次改造不新起一套平行流程，优先复用以下已有模块：

- `server/services/probeAssetStore.ts`
    - 继续负责加载和缓存 `emu_list.jsonl`、`qrcode.jsonl`
- `server/services/probeRuntimeState.ts`
    - 继续负责“当日已查询车次”“运行中车组”“最近一次观察结果”这三类内存状态
- `server/services/taskQueue.ts`
    - 继续负责普通任务和 singleton 启动任务入队
- `server/services/taskExecutors/probeTrainDepartureTaskExecutor.ts`
    - 继续作为主探测入口，不替换，只扩展
- `server/services/emuRoutesStore.ts`
    - 继续负责向 `daily_emu_routes` 写入结果
- `server/plugins/taskScheduleBootstrap.ts`
    - 继续负责启动时注册 executor 和补齐周期性任务

## 3. 数据库改造

### 3.1 新增 `status` 表

在 `EMUTracked` 数据库中新增 `status` 表，字段如下：

```sql
id INTEGER PRIMARY KEY AUTOINCREMENT,
train_code TEXT NOT NULL,
emu_train_set_no TEXT NOT NULL,
status INTEGER NOT NULL
```

状态枚举定义如下：

- `1`: 已写入数据库，但尚未完成重联检测
- `2`: 已完成重联检测，结论为单编组
- `3`: 已完成重联检测，结论为重联编组

索引要求如下：

- `idx_status_emu_train_set_no` on `(emu_train_set_no)`
- `idx_status_train_code` on `(train_code)`

### 3.2 SQL 与 service 封装

在 `assets/sql/emu/schema/` 和 `assets/sql/emu/queries/` 中补齐以下 SQL：

- 建表 SQL
- 按 `emu_train_set_no` 查询记录
- 按 `train_code` 查询记录
- 插入记录
- 按 `emu_train_set_no` 更新状态
- 按 `train_code` 更新状态
- 清空整表

在 `server/services/` 下新增状态表访问层，职责如下：

- 对外统一封装 `status` 表读写
- 对 `trainCode` 进行标准化
- 从完整 `emuCode` 中拆出 `emuTrainSetNo`
- 提供插入、查询、批量更新、清空能力

## 4. 主探测流程改造

主探测仍由 `probe_train_departure` 执行器负责，整体顺序如下：

### 4.1 基础流程

1. 保留当前入口参数结构：
    - `trainCode`
    - `trainInternalCode`
    - `allCodes`
    - `startAt`
    - `endAt`
    - `retry`
2. 保留现有“当日状态初始化”和“运行中车组过期清理”逻辑
3. 保留现有“同一车次当天只处理一次”的去重逻辑
4. 调用 `fetchEMUInfoByRoute(trainCode)` 获取主车组号
5. 如果当天时刻表不是今天，直接跳过，不写 `status`

### 4.2 通过资产判断是否可能重联

拿到主车组号后：

1. 通过 `loadProbeAssets()` 读取内存缓存中的 `emu_list`
2. 从主车组号中拆出 `model + trainSetNo`
3. 在 `emu_list` 中查找对应记录
4. 如果查不到：
    - 打 `warning`
    - 按“不可能重联”处理
5. 如果查到且 `multiple !== true`：
    - 按“不可能重联”处理
6. 如果查到且 `multiple === true`：
    - 进入可重联分支

### 4.3 不可能重联分支

如果当前车组判定为不可能重联：

1. 向 `status` 表插入当前车次记录，状态为 `2`
2. 向 `daily_emu_routes` 写入当前车次和主车组号的笛卡尔积
3. 更新现有运行中车组内存缓存
4. 记录当前主车组的最近观察结果为空重联结果
5. 标记该车次已查询

### 4.4 可重联分支

如果当前车组判定为可能重联：

1. 以当前 `emuTrainSetNo` 查询 `status` 表
2. 根据已有记录分三种情况处理

#### 情况 A: 存在 `status = 2`

说明该车组此前已经判断为单编组：

1. 将该 `emuTrainSetNo` 对应记录全部更新为 `2`
2. 插入当前车次记录，状态为 `2`
3. 将当前车次写入 `daily_emu_routes`
4. 更新内存运行态
5. 标记该车次已查询

#### 情况 B: 存在 `status = 3`

说明该车组此前已经判断为重联：

1. 根据已有记录反查本组已经识别出的车次
2. 将原先仍为 `1` 或 `2` 的记录补更新为 `3`
3. 当前车次插入一条 `status = 3` 记录
4. 如果已有重联车次缺记录，则补插对应记录
5. 将当前车次与已识别重联车组一起补写到 `daily_emu_routes`
6. 更新内存运行态
7. 标记该车次已查询

#### 情况 C: 无记录，或查询结果全部为 `status = 1`

说明该车组目前还没有最终结论：

1. 插入当前车次记录，状态为 `1`
2. 先把当前主车组写入 `daily_emu_routes`
3. 根据当前主车组在 `emu_list` 中对应的 `depot + model`，创建一个重联检测任务
4. 重联检测任务延迟执行时间来自配置项
5. 更新内存运行态
6. 标记该车次已查询

## 5. 重联检测任务设计

### 5.1 新增 executor

新增 `detect_coupled_emu_group` 执行器，任务参数为：

```ts
{
    depot: string;
    model: string;
}
```

### 5.2 冷却机制

新增一份仅内存的冷却状态，键为：

```text
${depot}#${model}
```

执行逻辑：

1. 每次任务启动时先读取该组上次执行时间
2. 如果距离现在小于配置的 `detectCooldownSeconds`，直接跳过
3. 否则继续执行，并在任务完成后刷新最近执行时间

### 5.3 检测流程

任务执行顺序如下：

1. 从 `probeAssetStore` 的内存缓存中筛选所有匹配 `depot + model` 的车组
2. 对每个候选车组：
    - 组装 `model + trainSetNo` 的 key
    - 从 `qrcodeByModelAndTrainSetNo` 中取畅行码
3. 如果候选车组缺少畅行码，直接跳过
4. 查询 `probeRuntimeState` 中的运行中车组状态
5. 如果该车组仍在运营过程中，跳过该车组检测
6. 对剩余候选车组调用 `fetchEMUInfoBySeatCode`
7. 根据返回结果识别当前候选车组实际挂在哪个车次/运行实例上
8. 将检测结果和 `status` 表中的现有记录合并处理

### 5.4 检测结果回写规则

对每个检测命中的车次：

1. 先按 `trainCode` 查询 `status` 表
2. 如果记录状态已为 `3`，直接跳过
3. 如果记录状态为 `1` 或 `2`：
    - 找出该车次对应的主控车 `emuTrainSetNo`
    - 再按主控车 `emuTrainSetNo` 查询整组状态
4. 如果最终结论为单编组：
    - 将整组相关记录更新为 `2`
5. 如果最终结论为重联：
    - 将整组相关记录更新为 `3`
    - 把新识别出的车次记录补入 `status` 表
    - 把新识别出的 `trainCode x emuCode` 组合补写到 `daily_emu_routes`

## 6. 状态清理任务设计

### 6.1 新增 executor

新增 `clear_daily_probe_status` 执行器，负责每天清空一次 `status` 表。

### 6.2 启动时补齐任务

在 `taskScheduleBootstrap` 中：

1. 注册 `clear_daily_probe_status`
2. 启动时使用 `reconcileSingletonPendingTask()` 补齐未来最近一次清理任务
3. 如果数据库中已有未来任务，则直接复用，不重复添加

### 6.3 执行逻辑

执行器运行时：

1. 清空 `status` 表
2. 根据配置中的每日执行时间，添加下一天的清理任务
3. 记录日志，便于后续排查

## 7. 配置项改造

在现有 `spider.scheduleProbe.coupling` 配置下新增：

- `statusResetTimeHHmm`
    - `status` 表每日清空时间，例如 `0000`
- `detectDelaySeconds`
    - 主探测发现待确认车组后，延迟多久执行重联检测任务
- `detectCooldownSeconds`
    - 同一 `depot + model` 分组的重联检测冷却时间

需要同步修改：

- `server/config.ts`
- `assets/json/configScheme.json`

## 8. 任务注册与启动改造

在 `taskScheduleBootstrap.ts` 中完成以下修改：

1. 注册新 executor：
    - `clear_daily_probe_status`
    - `detect_coupled_emu_group`
2. 将 `clear_daily_probe_status` 加入启动时自动补齐的 singleton 任务集合
3. `detect_coupled_emu_group` 不作为启动常驻任务，只在主探测发现待确认状态时按需创建

## 9. 需要新增或改动的主要代码位置

### 9.1 数据库与 SQL

- `assets/sql/emu/schema/`
- `assets/sql/emu/queries/`
- `server/libs/database/emu.ts`

### 9.2 状态与结果写入

- 新增 `status` 表 service
- 扩展 `server/services/emuRoutesStore.ts` 或同层新增独立状态 service

### 9.3 任务执行器

- `server/services/taskExecutors/probeTrainDepartureTaskExecutor.ts`
- 新增 `server/services/taskExecutors/detectCoupledEmuGroupTaskExecutor.ts`
- 新增 `server/services/taskExecutors/clearDailyProbeStatusTaskExecutor.ts`

### 9.4 启动与配置

- `server/plugins/taskScheduleBootstrap.ts`
- `server/config.ts`
- `assets/json/configScheme.json`

## 10. 验证方案

### 10.1 配置验证

- 新增配置项能够通过 `config.ts` 运行时校验
- `configScheme.json` 与运行时校验保持一致

### 10.2 数据库验证

- 首次启动时自动创建 `status` 表和索引
- `status` 表读写、批量更新、清空逻辑可正常执行

### 10.3 主探测验证

- 非今天的时刻表会直接跳过
- 非重联车组会写入 `status = 2`
- 可重联车组首次出现会写入 `status = 1` 并派发延迟检测任务
- 已知单编组车组再次出现时会复用 `status = 2`
- 已知重联车组再次出现时会复用 `status = 3` 并补齐数据

### 10.4 重联检测验证

- 同一 `depot + model` 在冷却时间内重复任务会跳过
- 冷却时间外可再次执行
- 检测为单编组时会把相关记录更新为 `2`
- 检测为重联时会把相关记录更新为 `3` 并补写 `daily_emu_routes`

### 10.5 定时清理验证

- 启动时若不存在未来清理任务，会自动补齐
- 执行清理后会自动添加下一天的清理任务

### 10.6 命令验证

实施完成后至少验证：

```bash
pnpm build
```

## 11. 默认实现约定

为了减少改动并贴合现有仓库结构，本方案默认采用以下实现约定：

- `emu_list` 分组只使用 `depot + model`，不引入 `bureau`
- 重联检测冷却状态仅保存在内存，进程重启后丢失
- `daily_emu_routes` 继续作为最终查询结果表，允许先写主车组，后续补写重联结果
- 主探测 executor 优先扩展现有逻辑，不拆成新的大规模 service 重构
