# 列车编组位置识别与重联状态同步 Spec

## 文档状态

本文档记录已确认的产品决策、代码现状和实现约束，是后续实现列车编组位置识别功能的任务 spec。本文档只描述设计，不代表功能已经实现。

设计讨论通过多轮问题确认完成。未在本文档中明确的行为不得由实现者自行推断；需要扩展时必须先更新本文档。

## 目标

在现有列车编组状态位模型上增加以下能力：

1. 在 `probeTrainDeparture` 任务中读取 `getCarDetail` 返回的 `content.data.coachPicList[0].pictureName`。
2. 使用车厢图片名称的前两位识别重联 II 位置。
3. 在重联扫描中解释 `trainRepeat`/`repeat` 的值：`0` 单组、`1` 重联 I、`2` 重联 II。
4. 在当前直接车组观测、车型约束、重联扫描和历史继承之间执行确定的优先级仲裁；provenance 只用于审计，不参与 detect 运行时仲裁。
5. 在同一现有车次组内，对 `trainCodes x emuIds` 的笛卡尔积同步列车 `status`。
6. 在上一组车终到后的两小时内继承编组位置；新观测不被未知值覆盖，明确冲突时以新观测为准并报告 warning。
7. 保留可追溯的 warning 和 provenance 事件。

## 非目标

- 本任务不实现故障探测。
- 本任务不实现热备探测。
- 本任务不新增独立的编组位置数据库列；位置继续编码在现有 `daily_emu_routes.status` 中。
- 本任务不让 `probeTrainDeparture` 为了补齐另一组车而额外查询 `getCarDetail`。
- 本任务不改变无关的 v1 API 契约或 CSV 格式。
- 本任务不把 `detectCooldownSeconds` 误用为按车次的状态锁定 TTL。

## 已确认的讨论问答

### 状态与来源

**Q1：位置是否独立于 status？**

回答：现有 `status` 已有编组位置枚举量，继续使用现有 status 位模型，不增加平行字段。

**Q2：`pictureName` 非 `09` 怎么办？**

回答：置为未知；不能因为不是 `09` 就直接判定单组。

**Q3：车型规则和 getCarDetail 冲突怎么办？**

回答：按直接观测优先处理。数据保证正常情况下不会出现此冲突；实现仍需按既定优先级报告 warning。

**Q4：repeat 异常值怎么办？**

回答：置为未知并报告 warning。

补充：现有 status 编码没有“既不知道单组/重联事实、也不知道位置”的独立值。单个 emu、车型未知且 repeat 非法时，保留默认的 `0x00`（未确认状态），不得把它解释为已确认单组；“当前 repeat 观测未知”由 warning/provenance 表达。只有已有两组事实时，才使用重联位置未知的 `0x03`。

**Q5：重联配对使用什么规则？**

回答：沿用现有车次组规则，不创建新的配对算法。现有组由 `TodayScheduleProbeGroup`、`trainInternalCode`、`startAt` 和其中的 `allCodes`/安全车次集合定义。

**Q6：两组 repeat 冲突怎么办？**

回答：确认采用“组事实优先、当前有效扫描位置优先、现有 status 仅作不足时的锚点、冲突报告 warning”的规则。若已经识别一组为重联 II，另一组就是重联 I；无法唯一确定时为重联、位置未确定。detect 不读取历史 provenance 来恢复 direct II 来源。

**Q7：继承值和新观测冲突怎么办？**

回答：新观测为准并报告 warning。未知新观测不是冲突，不应清除已有的明确 I/II 位置。

**Q8：status 同步范围是什么？**

回答：同步同一重联组内每个车次的 `status`，使用现有 `trainCodes x emuIds` 笛卡尔积。

**Q9：时间窗口过期后怎么办？**

回答：允许重新分组和重新探测。绑定只在上一组车终到后的两小时内有效。

**Q10：状态编码如何使用？**

回答：严格使用现有五位状态编码，见下文“状态编码”。

**Q11/Q15：锁定和继承窗口是多少？**

回答：默认是上一组车 `endAt` 后两小时，即 7200 秒。当前配置中的 `detectCooldownSeconds=3600` 不是这个窗口。

实现应新增语义独立的配置项，建议放在 `spider.scheduleProbe.coupling` 下并命名为 `statusBindingWindowSeconds`，默认值为 `7200`。不得复用或改变 `detectCooldownSeconds` 的含义。

**Q12：笛卡尔积如何保留 I/II？**

回答：同一个 emu 在所有相关 trainCode 上保持同一个位置；不同 emu 分别写各自的 I/II status，不能把整个笛卡尔积写成同一个位置。

**Q13：warning 如何报告？**

回答：写服务端 `logger.warn`，同时写 provenance 结构化事件；warning payload 至少包含来源、旧值、新值、repeat、pictureName 和组键等上下文。

**Q14/Q20：getCarDetail 何时、查几组？**

回答：在 `probeTrainDeparture` 任务中按当前车次查询。该接口返回当前车次对应的一组车数据；不得为了发现另一组而额外查询。位置观测与之后的重联扫描必须解耦。

**Q16/Q18：pictureName 如何解析？**

回答：对去除首尾空白后的字符串检查前两位，只有两位数字且等于 `09` 才命中重联 II；空值、缺少 `coachPicList[0]`、不足两位或非数字均为未知并 warning。

**Q17：继承窗口的边界？**

回答：使用上一组车的 `endAt`，只有 `0 < currentStartAt - previousEndAt <= 7200` 时才允许继承；同一服务日和现有运行组关系内执行。缺失 `endAt` 不猜测。

**Q19：两组车中出现 repeat=0 怎么办？**

回答：两组事实优先，不拆组；若当前扫描没有提供明确位置，且现有 status 中只有一组是 confirmed II，则另一组补为 I；否则保持“重联，位置未确定”，并报告 warning。detect 不从 provenance 恢复历史 getCarDetail 位置。

补充：两组事实同样高于单个 emu 的 `non_multiple` 车型标记。出现该冲突时不拆组，继续按重联组仲裁，并报告 model/group conflict warning。

**Q21：fault/hot-spare 如何处理？**

回答：当前直接复制完整 `status`，fault 和 hot-spare 也一起复制。未来实现独立故障/热备探测后，再拆分为按领域更新。

**Q22：`09` 是否直接确认？**

回答：听取实现建议，采用直接确认：`09` 直接写已确认重联 II（`0x07`）。

**Q23：未知新观测是否覆盖继承位置？**

回答：保留继承的位置；未知不覆盖已知 I/II。

**Q24：完整 status 复制的粒度？**

回答：按同一 emu 复制到所有相关 trainCode；不同 emu 只分别确定其 formation position，不能把一个 emu 的 fault/hot-spare 位污染到另一个 emu。

**Q25：车型资产缺失是否判单组？**

回答：听取实现建议，不判单组。只有明确车型匹配为 `non_multiple` 时才确认单组；资产缺失、`multiple` 或 `unknown` 继续进入位置探测/重联扫描流程。

## 代码现状

### getCarDetail

`server/utils/12306/network/fetchEMUInfoByRoute.ts` 已调用：

```text
https://mobile.12306.cn/wxxcx/openplatform-inner/miniprogram/wifiapps/appFrontEnd/v2/lounge/open-smooth-common/trainStyleBatch/getCarDetail
```

响应类型已经声明 `content.data.coachPicList[].pictureName`，但当前成功结果只向上层返回车次和 `carCode` 对应的 emu，图片名称被丢弃。实现需要将位置观测结果随当前车次的 route probe 结果向 `probeTrainDepartureTaskExecutor` 传递。

`probeEmuByTrainCodes` 当前会尝试候选车次，返回第一个成功的 route probe。该行为属于“当前车次的一组观测”，不要改成为了补齐重联组而遍历另一组。

### status 模型

`server/utils/emuRouteStatus.ts` 已有位置位和编码：

| Bits | Mask | Meaning |
| --- | ---: | --- |
| `bit0` | `0x01` | Formation result is confirmed |
| `bit1..bit2` | `0x06` | Formation position |
| `bit3` | `0x08` | Fault flag |
| `bit4` | `0x10` | Hot-spare flag |

| Semantic state | Value |
| --- | ---: |
| Unconfirmed single formation | `0x00` |
| Confirmed single formation | `0x01` |
| Unconfirmed coupled formation, position unknown | `0x02` |
| Confirmed coupled formation, position unknown | `0x03` |
| Unconfirmed coupled formation I | `0x04` |
| Confirmed coupled formation I | `0x05` |
| Unconfirmed coupled formation II | `0x06` |
| Confirmed coupled formation II | `0x07` |

实现不能把 `0x09` 当成重联 II；`0x09` 是 `0x01 | 0x08`，即已确认单组加 fault 位。`pictureName` 的 `09` 是字符串前缀，不是 status 数值。

### 车型匹配

现有资产逻辑通过车厢数判断车型是否可重联：明确 `non_multiple` 时只能单组，应写 `0x01`。资产缺失不等于 `non_multiple`，不得再直接写已确认单组。

### 重联扫描

重联扫描由 `server/services/taskExecutors/detectCoupledEmuGroupTaskExecutor.ts` 执行，畅行码返回字段实际为 `trainRepeat`，当前主要作为原始字符串记录，尚未解释为位置状态。现有执行器在两组以上时统一写 `0x03`，需要改为按以下规则解析：

| `repeat` | 单独观察时的语义 |
| ---: | --- |
| `0` | 单组 |
| `1` | 重联 I |
| `2` | 重联 II |
| 其他、缺失、非法 | 未知并 warning |

当同一现有车次组已经形成两个 emu：

- 两组绑定优先于单条 `repeat=0`，不能拆成两个单组。
- 一组已确定为 II 时，另一组补为 I。
- 没有任何可信 I/II 证据时，两个 emu 均写“已确认重联、位置未确定” `0x03`。
- `repeat` 与现有 status 的位置不一致时，以当前有效 repeat 为准并 warning；当前扫描无法确定位置时，才使用现有 status 的唯一 II 锚点。

### 历史继承

`tryReuseHistoricalRouteStatus` 当前通过 `getLatestConfirmedDailyRouteByEmuCodeBefore` 向历史无限回溯，并在 `collectKnownStatusGroup` 中把 I/II 折叠成位置未知。两项都必须修改：

1. 查询上一组车的结束时间，只有 `0 < currentStartAt - previousEndAt <= statusBindingWindowSeconds` 且满足同一服务日/现有运行组关系时才可继承。
2. 收集 status 时保留每个 emu 的独立完整 status，不得把 I/II 归一化成 `0x03`。
3. 新观测未知时保留继承的明确位置。
4. 新观测明确给出不同位置时覆盖继承值，并报告新旧值冲突 warning。

## 来源优先级与仲裁

在 `probeTrainDeparture` 的单次任务内，按以下优先级处理同一 emu 的位置：

1. 当前 `getCarDetail` 明确 `pictureName` 前缀 `09`。
2. 当前任务中的车型、重联组事实和其他直接观测。
3. 两小时窗口内继承的上一组完整 status。
4. 未知、缺失或非法输入。

在 `detect_coupled_emu_group` 中只使用运行数据，不读取 provenance：

1. 当前有效 `repeat` 和两组事实得到的明确位置。
2. 当前 `daily_emu_routes.status` 中唯一且一致的 confirmed II，用于补出配对 I。
3. 无法唯一确定时写 confirmed coupled unknown。

约束：

- 未知值不能覆盖已有明确位置。
- 明确的新位置覆盖继承值，并 warning。
- detect 中当前 repeat 与既有位置冲突时，当前有效 repeat 胜出，并报告位置冲突 warning。
- 两组事实不能被单条 `repeat=0` 拆散。
- provenance 只记录事件和 warning，不得成为 detect 形成结果的必要输入；provenance 未启用、无历史事件或历史事件已清理时，detect 仍必须得到相同结果。

这里的“未知值”指当前来源没有给出新的编组事实，不能用这种输入清除已有明确状态。状态值 `0x03` 不属于这种空白输入；它表示“已确认重联，但 I/II 位置未知”，包含明确的两组事实。因此在重复状态行合并时，`0x01` 与 `0x03` 的结果保持为 `0x03`，符合“两组事实优先于单组”的规则，同时必须报告单组与重联事实冲突。纯状态读取函数保持无副作用；探测仲裁和维护合并等具有上下文的写入路径负责报告 warning。

## 笛卡尔积同步契约

现有 `persistProbeTrackingRows` 已按 `trainCodes x emuIds` 双层循环写入。扩展后必须保留这一覆盖范围，但输入不能再只有一个适用于整个笛卡尔积的标量 status。

推荐的逻辑输入为：

```ts
Map<EmuId, number> statusByEmu
```

对每个 `trainCode` 和每个 `emuId`：

1. 取该 emu 的完整 status。
2. 写入所有确认过的位，包括 formation position、confirmed、fault、hot-spare。
3. 同一 emu 在所有 trainCode 上写相同的完整 status。
4. 不把 emu A 的 fault/hot-spare 或其他状态复制给 emu B。

如果由重联关系推断另一 emu 的 I/II，必须只改变该 emu 的 formation position/确认结果，其他领域位按该 emu 自己的现有 status 保留，除非当前任务明确要求完整 status 覆盖。

## Warning 与 provenance

以下情况必须同时产生 `logger.warn` 和 provenance 结构化事件：

- `coachPicList[0]` 缺失。
- `pictureName` 前缀非法或不足两位。
- `repeat` 缺失、非法或不在 `0/1/2`。
- 两组事实与 `repeat=0` 冲突。
- 两组事实与车型 `non_multiple` 冲突。
- 当前 repeat 与既有 status 的位置冲突。
- 新明确位置覆盖两小时继承的位置。
- 两组无法唯一确定 I/II。

warning payload 至少应包含：

- 当前车次组键（train internal code、startAt、service date）；
- 相关 trainCode 和 emuId；
- 来源名称（`getCarDetail`、`coupling_scan_repeat`、`model`、`historical_inheritance`、`status_aggregation`）；
- 原始 `pictureName` 和 `repeat`；
- 旧 status/位置与新 status/位置；
- 仲裁后的结果和原因。

不要为了增加 warning 而改变无关 API 返回契约。现有 provenance 事件和 logger 是本任务的报告面。

## 实现边界与建议落点

### `fetchEMUInfoByRoute.ts`

- 保留现有接口请求和 `carCode` 解析。
- 从 `coachPicList[0].pictureName` 派生一个明确的 route formation observation。
- 区分 `coupled_ii` 与 `unknown`，不要把非 `09` 映射为 single。
- 将原始 `pictureName` 和派生结果向调用者传递，供 provenance 使用。

### `probeTrainDepartureTaskExecutor.ts`

- 只处理当前车次返回的一组 emu。
- 将 `09` 观测写为 `0x07`。
- 对明确 `non_multiple` 写 `0x01`。
- 资产缺失、`multiple`、`unknown` 进入未确认/后续扫描流程。
- 历史继承按 `statusBindingWindowSeconds`（默认 7200 秒）的 `endAt -> startAt` 窗口限制。
- 当前观测为未知时保留继承的明确位置。
- 当前观测明确冲突时覆盖并记录 warning。
- `09` 写入当前 II 后仍执行本地历史组继承和当前运行组自动合并；已知配对 emu 按 I 同步，不额外请求接口。

### `detectCoupledEmuGroupTaskExecutor.ts`

- 解释 `trainRepeat` 的 `0/1/2`。
- 在两组绑定场景下按组事实和当前 status 中唯一的 II 位置推断另一组 I。
- 当前有效 repeat 与既有位置冲突时使用当前扫描并 warning；不得查询 provenance 恢复历史 direct II。
- 将每个 emu 的 status 传给按 emu 分组的笛卡尔积持久化。
- 不再无条件把所有重联结果归一化为 `0x03`。

### `probeTrackingMutations.ts` 与 route store

- 支持 `trainCodes x emuIds` 使用 `statusByEmu`。
- 同一 emu 的完整 status 复制到所有相关 trainCode。
- 更新 status 时保留本任务要求复制的全部位。
- 保持现有事务、通知和 mutation 语义，不引入第二套状态存储。

### `emuRouteStatus.ts`

- 复用已有常量和 codec。
- 不在业务代码中散落新的数值字面量。
- 使用按位 helper 读写 formation position 和 confirmed 位。
- 当前任务直接复制完整 status；未来故障/热备探测完成后再拆分领域更新。

## 验收标准

### getCarDetail

- `pictureName=09...` 的当前 emu 最终状态为 `0x07`。
- `pictureName` 非 `09` 不会被判成单组。
- 缺失或非法 `pictureName` 产生 warning，并允许流程继续。
- departure 任务不会额外查询另一组 emu。

### 车型与单组

- 明确 `non_multiple` 的车型写 `0x01`。
- 资产缺失不写 `0x01`，而是进入后续位置探测/重联扫描。

### repeat 与重联

- 单组扫描的 `repeat=0` 写确认单组。
- 单组扫描的 `repeat=1/2` 分别写确认重联 I/II。
- 两组扫描时，一组 II 可补另一组 I。
- 两组中出现 `repeat=0` 不拆组；没有唯一的当前 II repeat 时写位置未确定并 warning。
- 非法 repeat 写未知并 warning。
- repeat 与既有 status 冲突时当前有效 repeat 胜出并 warning；扫描不足时唯一的现有 II 可补另一组 I。

### 继承与同步

- 只继承上一组 `endAt` 后 7200 秒以内的记录。
- 超过两小时、缺失 endAt 或不满足现有组关系时不继承。
- 未知新观测不清除继承的 I/II。
- 明确新位置覆盖继承位置并 warning。
- 所有相关 trainCode x emuId 行都存在，并按 emu 写入对应完整 status。
- fault 和 hot-spare 位在本任务中随完整 status 一起复制。

### 验证命令

实现完成后至少执行：

```bash
pnpm typecheck:server
pnpm typecheck
```

并补充手工验证：

1. 构造 `09`、非 `09`、缺失图片列表三种 getCarDetail 响应。
2. 构造 repeat `0/1/2`、非法值和两组冲突组合。
3. 验证上一组终到后 7199 秒、7200 秒、7201 秒的继承边界。
4. 验证多个 trainCode 和两个 emu 的笛卡尔积，每个 emu 的 status 在所有车次上一致且两组位置不同。
5. 验证包含 fault/hot-spare 位的 status 在同步后仍保持。
6. 检查 logger 和 provenance 中存在 warning 的完整上下文，并确认删除或禁用 provenance 事件不会改变 detect 结果。

## 当前实现风险

- 当前 `collectKnownStatusGroup` 和 `getTrackedGroupStatus` 会把 I/II 折叠成位置未知，必须在状态聚合前改造。
- 当前 `persistProbeTrackingRows` 只接收单个 status，无法表达两个 emu 的不同位置，必须扩展输入契约。
- 当前历史查询没有时间上限，必须增加基于上一组 `endAt` 的过滤。
- 当前 getCarDetail 的 `pictureName` 没有从网络工具层传出。
- 当前 `detectCooldownSeconds=3600` 是按铁路局+车型的扫描冷却，不得当成 7200 秒车次状态继承窗口。
