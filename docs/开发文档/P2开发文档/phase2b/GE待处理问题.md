# Phase 2b — 发现：GE 待处理问题

> 来源：oracle 架构评审（session: ora-1），评审范围 `packages/graph-engine/`。
> 评审结论：7.5/10，核心设计决策正确，若干结构性修正可降低维护成本。

## 待修复问题

| #   | 发现                                                                                                                                         | 位置                                                       | 建议修复                                                                                                             | 严重度 | 状态   |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------ | ------ |
| 1   | `types/cognitive_operations.ts` 是死类型文件（64 行），定义并从 index.ts 导出，但引擎内部零消费                                              | `packages/graph-engine/src/types/cognitive_operations.ts`  | 引擎不应持有自己不消费的类型。移除或标注 `@Phase 4 保留`（若为前端类型标签则移出引擎包）                             | 中     | 待处理 |
| 2   | `core/checkers/registry.ts` 是死代码（25 行），`DEFAULT_RULES` 零引用，已被 `global_rules_table.ts` 的 `DEFAULT_GLOBAL_RULES_TABLE` 完全替代 | `packages/graph-engine/src/core/checkers/registry.ts`      | 删除，保留 `global_rules_table.ts` 为唯一 rules entry                                                                | 中     | 待处理 |
| 3   | `compose/pipeline.ts` 位置错层，它是整个引擎的唯一执行入口（三阶段事务流水线），语义属于 `core/`，不应放在 compose/ 下                       | `packages/graph-engine/src/compose/pipeline.ts`            | 移动到 `core/pipeline.ts`，更新所有 import 路径                                                                      | 中     | 待处理 |
| 4   | `createReversal` 中 delete_node 找不到被删节点时静默返回 `[]`，undo 变为静默 no-op，用户感知不到失败                                         | `packages/graph-engine/src/core/reversal.ts:113-143`       | 返回 `{ reversals, error? }` 结构或抛异常，让调用方感知失败                                                          | 低     | 待处理 |
| 5   | `induce()` 单函数 443 行，包含语义预检、形心计算、碰撞重试、子图构造、抽象节点放置、父图 ops 组装、边投影 5 个独立子任务，无法隔离测试       | `packages/graph-engine/src/compose/cognitive/induce.ts:88` | 拆为 `validateInducePreconditions()` / `computeCentroid()` / `placeCommunicationNodes()` / `buildInduceOperations()` | 低     | 待处理 |

## 可以改进的地方

- **cognitive compose 函数返回类型不统一**
  - 位置：`compose/cognitive/deconstruct.ts`、`induce.ts`、`internalize.ts`、`diverge.ts`
  - 描述：arrangement 全部统一返回 `ComposeResult<D>`，但 4 个 cognitive 函数各有 ad-hoc 结构（有的 `{ operations, issues }`，有的 `{ operations: { child, parent }, issues }`）。新增 cognitive 操作时不知道该仿照哪个模式
  - 建议：统一 cognitive 返回契约，或明确选择不统一是因为它们属不同类别（区分"纯位置预览"和"跨图数据返回"）
  - 状态：待评估

- **`abstractionLevel` 字段无消费**
  - 位置：`packages/graph-engine/src/types/graph_data.ts:101`
  - 描述：`NodeBase.abstractionLevel` 始终 `= 0`，引擎无任何逻辑消费它
  - 建议：标注 `@reserved` 或移除。裸露无行为的字段会腐蚀类型的可信度
  - 状态：待评估

- **`hasCollisionAt` 仅返回布尔值，不暴露距离/临近信息**
  - 位置：`packages/graph-engine/src/infrastructure/collision.ts:111`
  - 描述：碰撞检测只返回"碰了 / 没碰"两个状态，前端实时预览时（move 工具 mousemove 每帧检测）红色高亮突然出现/消失，UX 不够平滑。若能区分"安全距离"、"接近（黄色预警）"、"碰撞（红色）"三级信息，交互体验更自然
  - 建议：`hasCollisionAt` 返回 `{ blocked: boolean; clearance?: number }` 或新增 `hasProximityWarning` 函数
  - 状态：待评估

## 已知隐患（已标记但尚未解决）

| 发现                                            | 位置                                                                             | 影响范围                                                                         | 状态           |
| ----------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------- |
| `new Date().toISOString()` 隐式时间戳（15+ 处） | `core/execute.ts:72,82,164,207,262,291,305,326,347` 等                           | 若未来升级 Event Sourcing 需全部提升为外部传入参数                               | 已知，低优先级 |
| `Math.random()` 碰撞重试非确定性                | `infrastructure/placement.ts:141-142`、`internalize.ts:244` while(true) 重试循环 | 无法为"重试 N 次全失败"这个边界写确定性测试。当前测试用确定性位置避开 retry 路径 | 已知，低优先级 |

## 不确定事项

- **`spi/persistence.ts` 的归属**
  - 描述：SPI 接口定义只有接口声明，引擎内部零消费（100% 由前端 graph_store 实现）。当前更像前端接口而非引擎 SPI
  - 影响：Phase 3 AI Runtime 可能需要它；若不需要，它不属于引擎包
  - 状态：待确认

- **`findPeerGraph` 依赖前端注入 graphIds**
  - 位置：`compose/cognitive/diverge.ts:204`
  - 描述：引擎的跨图搜索能力不完整——`graphIds` 由前端注入而非引擎自身持有。对纯函数引擎是合理的，但意味着"引擎独立完成跨图操作"目前不成立
  - 状态：保留现状，Phase 3 重新评估
