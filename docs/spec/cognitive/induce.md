# induce — 归纳（多节点 → 抽象节点 + 子图）

## 输入

| 参数 | 类型 | 来源 |
|------|------|------|
| `nodeIds` | `NodeId[]` | 前端用户框选的知识节点列表（≥2 个） |
| `parentGraph` | `GraphData` | graph_store 当前快照（被选节点所在的父图） |
| `registry` | `GraphRegistry` | 多图注册表，用于注册新建子图 |
| `nodeRadiusOverrides` | `NodeRadiusMap` | 前端预计算的半径覆盖表，用于 `distributeOnTiers` 和碰撞检测 |
| `allEdges` | `EdgeData[]` | graph_store 当前快照中的边，用于识别外部边和内部边 |

`InduceOperation` 类型：`{ type: 'induce', nodeIds: NodeId[] }`。

## 调用场景

| | |
|---|---|
| 调用方 | 前端 `operation_controller`（Cognition 模式） |
| 频率 | 一次性——用户框选多个节点后执行"归纳"命令时调用 |
| 前置要求 | `nodeIds.length >= 2`。所有目标节点 `role === 'knowledge'`。同一 `parentGraph` 内 |

**Phase 2 最大技术挑战**——三组原子操作跨两层（父图删除 + 子图创建 + 沟通节点创建）必须作为单一事务执行。任一环节失败则全部丢弃。

## 前置条件

### 语义预检 error

| 条件 | 校验方式 | 错误消息 |
|------|---------|---------|
| `nodeIds` 长度 ≥ 2 | `nodeIds.length >= 2` | `归纳操作至少需要两个节点。` |
| 所有目标节点存在于 `parentGraph` | 逐个 `parentGraph.nodes.find()` | `节点 ${nodeId} 在当前图谱中不存在。` |
| 所有目标节点 `role === 'knowledge'` | 逐个 `node.role` 检查 | `节点 ${nodeId} 不是知识节点，不能参与归纳。` |
| 不存在重边冲突 | 对每个未选邻居——若被选节点集中有多条边指向同一未选节点，检查这些边在归纳后的新拓扑中是否产生重边。当前策略：禁止（一票否决） | `节点 ${selectedA.id} 和 ${selectedB.id} 归纳后将对 ${neighbor.id} 产生重边，当前不支持此拓扑。` |

### 重边冲突详解

归纳操作中，被选节点集与未选邻居之间的外部边经过"共享沟通节点"策略压缩后，可能产生重边：

```
归纳前：  [被选A] ── [未选X]
          [被选B] ── [未选X]       ← 两条不同的边

归纳后：  [被选A] ── [沟通节点C_X]   ← 子图内，A连接C_X
          [被选B] ── [沟通节点C_X]   ← 子图内，B连接C_X（共享同一沟通节点）
          [抽象Z] ── [未选X]        ← 父图内，抽象节点连X（一条边）
```

当前策略：多条被选节点指向同一未选邻居 → 共享一个沟通节点，父图中抽象节点只连一条边到未选邻居。这是设计意图——不产生重边。

禁止的是另一种情况：归纳后**子图内**可能出现两条完全相同的边（相同 source/target + 相同 kind）。引擎在组装阶段检测到此情况时返回 error。

### 语义预检 warning

无。

### 原子操作校验（applyBatch 层）

| 校验项 | 说明 |
|------|------|
| `add_graph` | `graphId` 唯一性 |
| `add_node` | 每条 `add_node` 的 node 结构完整性、节点 ID 唯一性 |
| `add_edge` | 每条 `add_edge` 的 source/target 节点是否存在于目标图中 |
| `delete_node` | 待删除节点是否存在、是否有入边引用 |
| `update_node` | 目标节点是否存在 |

一票否决：任一 `validate` 失败 → 全部原子操作丢弃。

## 返回值

- **drafts 数量**：等于沟通节点数（每个外部未选邻居对应一个沟通节点）。每条 `DraftPosition`。前端用 drafts 渲染预览，判断按钮状态。
- **Draft 扩展字段**：无（沟通节点的位置信息已在 `DraftPosition.position` 中，无需额外 tier/angle 信息——与 `orbit` 一致）。
- **issues 典型清单**：见上方语义预检 + 原子操作校验的错误消息。

> **注意**：抽象节点自身的位置由形心计算得出，不属于"草稿"——它是确定的，直接出现在 `operations` 的 `add_node` 中。只有沟通节点的位置（`distributeOnTiers` 产出）是草稿，因为它们的环绕布局可能因碰撞而需要调整。

## 后置影响（图结构变化）

### 父图

| 操作 | 说明 |
|------|------|
| `delete_node`（× N） | 从父图中删除被选节点。节点本身不销毁——它们被移入子图 |
| `add_node`（× 1） | 新建抽象节点，`form: 'abstract'`，`childGraphId` 指向新子图。位置 = 选择集形心。`label` 由前端传入（用户命名）或自动生成 |
| `add_edge`（× M） | 抽象节点 ↔ 未选邻居。每条外部邻居一条边。`kind` 继承原边，`direction` 保持原样 |

- 被选节点之间的内部边随节点一起从父图删除。不留在父图。

### 子图（新建，`kind: 'subgraph'`）

| 操作 | 说明 |
|------|------|
| `add_node`（× N） | 原被选节点移入子图。`graphId` 改为子图 ID。`position` 保留原坐标（相对于子图坐标系） |
| `add_node`（× K） | 为每个外部未选邻居创建一个沟通节点。`role: 'reference'`，`kind: 'communication'`。`sourceGraphId = 父图 ID`，`sourceNodeId = 未选邻居 ID` |
| `add_edge`（× L） | 被选节点 → 沟通节点。原图中的外部边重新连接——每个被选节点与它原来连接的未选邻居对应的沟通节点之间创建边。`kind` 继承原边 |

### 常识层

不涉及。

## applyBatch 得到的原子操作序列

跨两层（父图 + 子图）的三组操作，全部属于同一事务。`applyBatch` 按 `registry` 中的图 ID 分别对父子两图各调一次：

```
事务 1（父图）：
    1. add_graph   graph = <新子图>
                    ↓ 以下操作都依赖子图 ID 存在
    2. add_node    node = <抽象节点, childGraphId = 新子图ID, position = 形心>
    3. delete_node nodeId = <被选节点[0]>    ← 顺序无依赖，可并行
    ...
    2+N. delete_node nodeId = <被选节点[N-1]>
    2+N+1. add_edge edge = <抽象节点 → 未选邻居[0]>
    ...
    2+N+M. add_edge edge = <抽象节点 → 未选邻居[M-1]>

事务 2（子图）：
    1. add_node    node = <被选节点[0], graphId = 子图ID>    ← 移入子图，position 不变
    ...
    N. add_node    node = <被选节点[N-1], graphId = 子图ID>
    N+1. add_node  node = <沟通节点[0], graphId = 子图ID>    ← 沟通节点放置在 distributeOnTiers 算出的位置
    ...
    N+K. add_node  node = <沟通节点[K-1]>
    N+K+1. add_edge  edge = <被选节点 → 沟通节点>            ← 原外部边的子图投影
    ...
    N+K+L. add_edge edge = <...>
```

> **跨图事务协调**：引擎层 `induce()` 持有 `GraphRegistry`，事务 1 和事务 2 的 `applyBatch` 都在 `induce()` 内部依次调用。若事务 2 失败，事务 1 的结果不回滚——这是当前单图 `applyBatch` 签名的已知限制。调用方应在调 `induce()` 前保存 undo snapshot。

## 事务语义

| | |
|---|---|
| 原子性边界 | 父图 ops（1 add_graph + 1 add_node + N delete_node + M add_edge）+ 子图 ops（N add_node + K add_node + L add_edge）。全部属于一个认知事务。一票否决 |
| 跨图回滚 | ⚠️ 已知限制：事务 1 在父图中已执行后，若事务 2 在子图中失败，父图变更不可自动回滚。当前防御策略：事务 1 中的原子操作全部通过 validate 后才执行；事务 2 的 ops 在事务 1 执行前已完成 dryRun 预判。在 validate-all-first 策略下此限制不触发 |
| dryRun 行为 | 事务 1 和事务 2 都 dryRun → 全部通过校验后跳过 execute → 返回两层的预判结果。前端在"归纳预览"弹窗中展示此结果 |
| 幂等性 | 否。执行后抽象节点已存在，`nodeIds` 中的节点已移入子图。再次调用会因"节点不存在于父图"而报 error |
| 可逆性 | 是。`createReversal` 可构造逆操作序列：解散子图 → 被选节点迁回父图 → 删除抽象节点 → 删除沟通节点 → 恢复原有边 |

## 位置安排策略

### 抽象节点（父图新增）

```ts
形心 = {
    x: (Σ node.position.x) / nodeIds.length,
    y: (Σ node.position.y) / nodeIds.length,
}
```

抽象节点创建在选择集的几何中心，视觉上坐落在被归纳集群的中点上。

### 沟通节点（父图 + 子图两侧）

父图中的沟通节点布局：

```ts
const center = { position: 形心, radius: 0 }  // 虚中心 centerRadius = 0
const tiers = [{ tier: 0, nodeIds: [所有沟通节点的 ID] }]  // 初始全在层级 0
const drafts = distributeOnTiers(center, communicationNodeSpecs, tiers, startAngle)
```

- 虚中心 `centerRadius = 0` — 抽象节点的外接圆在父图中仍需占地，但沟通节点环绕的中心点不占物理空间。
- `distributeOnTiers` 内部自动处理层级间距和碰撞。
- 沟通节点最终位置落定后写入 `add_node.position`。

子图中的沟通节点位置与父图中对应的沟通节点位置保持一致——它们是对偶关系。实现方式：子图 `add_node` 直接复用父图沟通节点的 `position`。

### 被选节点（迁入子图）

`position` 保留原坐标，不因迁入子图而改变。子图坐标系与父图坐标系相同（共享坐标空间）。

### 碰撞检测

`hasCollisionInDrafts` 检测父图中沟通节点草稿 vs 已有节点 + 草稿互碰。子图为空（只有被迁入节点和沟通节点），不存在碰撞风险——子图侧跳过碰撞检测。

## 残留问题

| # | 问题 | 当前 spec 取 | 状态 |
|---|------|------------|------|
| Q16 | 被选节点之间的内部边跟随下沉到子图还是留在父图？ | spec 取"跟随下沉"——内部边随节点一起移入子图，父图中不保留 | ⏳ 待确认 |
| Q17 | 抽象节点在父图中是否直接参与边结构（与子图内的沟通节点是否有边）？ | spec 取"是"——抽象节点通过沟通节点间接连接外部邻居。父图中是 `抽象节点 → 沟通节点` + `沟通节点 → 未选邻居`；子图中是 `被选节点 → 沟通节点` | ⏳ 待确认 |
| Q18 | 被选节点移入子图后，父图是否保留其旧位置的占位符？ | spec 取"否"——旧位置不留痕。抽象节点取代了它们的位置（形心） | ⏳ 待确认 |

---

## 附：操作前后对照

```
归纳前（父图）：
              [未选X]
              ↗   ↖
    [被选A] ── [被选B] ── [被选C]
       ↖                    ↗
         ──── [未选Y] ─────        ← Y 同时连接 A 和 C

归纳后（父图）：
    [未选X] ───────────────────── [未选Y]
       ↑                             ↑
       │                             │
    [沟通X'] ── [抽象Z(形心)] ── [沟通Y']

归纳后（子图, ownerNodeId = Z.id）：
    [沟通X'] ── [被选A] ── [被选B] ── [被选C] ── [沟通Y']
                  └──────────────────────────┘
                                ↑
                          原 A-C 内部边保留在子图
```

说明：
- 未选 X 同时连接了 A 和 B → 共享一个沟通节点 `沟通X'`（外部边共享）。
- 未选 Y 同时连接了 A 和 C → 共享一个沟通节点 `沟通Y'`。
- 被选节点之间的内部边（A-B, B-C, A-C）保留在子图。
- 父图中 `抽象Z` 通过沟通节点间接与未选节点关联。
