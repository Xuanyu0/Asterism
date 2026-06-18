# induce — 归纳（多节点 → 抽象节点 + 子图）

## 输入

| 参数 | 类型 | 来源 |
|------|------|------|
| `nodeIds` | `NodeId[]` | 前端用户框选的节点列表（≥2 个）。知识节点（atomic/abstract/virtual）和启发引用节点均可参与。沟通节点除外 |
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
| 前置要求 | `nodeIds.length >= 2`。目标节点不能是沟通节点（`referenceKind === 'communication'`）。知识节点和启发引用节点均可参与。同一 `parentGraph` 内 |

**Phase 2 最大技术挑战**——三组原子操作跨两层（父图删除 + 子图创建 + 沟通节点创建）必须作为单一事务执行。任一环节失败则全部丢弃。

## 前置条件

### 语义预检 error

| 条件 | 校验方式 | 错误消息 |
|------|---------|---------|
| `nodeIds` 长度 ≥ 2 | `nodeIds.length >= 2` | `归纳操作至少需要两个节点。` |
| 所有目标节点存在于 `parentGraph` | 逐个 `parentGraph.nodes.find()` | `节点 ${nodeId} 在当前图谱中不存在。` |
| 目标节点不能是沟通节点（`referenceKind === 'communication'`） | 逐个检查 `node.role === 'reference' && node.referenceKind === 'communication'` | `节点 ${nodeId} 是沟通节点，不能参与归纳。沟通节点是父图邻居在子图中的透明投影，不应被二次归纳。` |
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

- **drafts**：不返回。归纳的沟通节点在子图内，用户当前视图为父图，无可预览的位置草稿。
- **childGraphData**：compose 层构造的完整子图对象（含被选节点 + 沟通节点 + 边）。调用方在 `applyBatch` 子图 ops 后将其作为初始 graph 传入。
- **issues 典型清单**：见上方语义预检 + 原子操作校验的错误消息。

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

执行顺序：**先子图，后父图**。子图先落位被选节点和沟通节点，碰撞检测在子图内完成（对象只有被选节点，不涉及父图）。父图再做删除和重建。

```
事务 1（子图） — applyBatch(newChildGraph, [...], registry)：
    1. add_graph   graph = <空子图>
    2. add_node (×N)  被选节点移入子图，position 不变
                    ↓ 至此子图只有被选节点，collision context 清晰
    3. add_node (×K)  沟通节点，distributeOnTiers 算位置
                      + hasCollisionInDrafts 检测是否碰被选节点
                      碰 → 调整 D₀ / tier 重排，不碰 → 写入
    4. add_edge (×L)  被选节点 → 沟通节点（原外部边的子图投影）

事务 2（父图） — applyBatch(parentGraph, [...], registry)：
    1. add_node    node = <抽象节点, childGraphId = 子图ID, position = 形心>
    2. delete_node (×N)  被选节点从父图删除
    3. add_edge (×M)  抽象节点 → 未选邻居
```

> **碰撞检测**：沟通节点的位置在子图内计算——`distributeOnTiers` 以形心为虚中心（centerRadius=0）、被选节点为卫星，均分圆周。`hasCollisionInDrafts` 检测沟通节点草稿是否与被选节点草稿互碰。碰撞时调整 D₀ 或增开新层级重排，最多重试 N 次。全失败则报 error。
>
> **跨图事务协调**：induce() 依次调两次 `applyBatch`。validate-all-first 策略下，两批操作的校验在 execute 之前全部完成。若子图执行成功、父图执行失败，子图已创建的节点不回滚，调用方应在调 induce() 前保存 undo snapshot。

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

形心是首选项。但被选节点删除后，父图中剩余节点可能恰好落在形心位置。

**迭代策略**：
1. 以形心为初始候选位置。
2. `hasCollisionAt` 检测抽象节点是否与父图剩余节点碰撞。
3. 碰撞时 `scatterInCircle(形心, R0)` 随机散布重试，最多 N 次。全失败则报 error。

### 沟通节点（子图内）

沟通节点均分圆周，轨道半径包裹所有被选节点：

```ts
// distributeOnTiers 内部 D0 = centerRadius + maxSatR + R0
// 将 centerRadius 设为 maxSelectedDist 即得 idealOrbitRadius
const vCenter = { position: centroid, radius: maxSelectedDist }
const satelliteSpecs = neighbors.map((n, i) => ({ id: commNodeIds[i], radius: R0 }))
const tiers = [{ tier: 0, nodeIds: commNodeIds }]
const positions = distributeOnTiers(vCenter, satelliteSpecs, tiers, 0)
```

位置落定后写入子图 `add_node.position`。

### 被选节点（迁入子图）

`position` 保留原坐标，不因迁入子图而改变。子图坐标系与父图坐标系相同（共享坐标空间）。

### 碰撞检测

在子图内完成。此时子图只有被选节点（已通过 `add_node` 迁入），collision context 干净。

**1. 计算理想轨道半径**：

```ts
// 被选节点中离形心最远的距离（节点外接圆边缘）
const maxNodeDist = max(
    selectedNodes.map(node =>
        distance(node.position, centroid) + nodeRadius(node)
    )
)
// 理想轨道半径 = 包裹所有被选节点 + 沟通节点最大半径 + 间隙 R0
const idealOrbitRadius = maxNodeDist + maxCommRadius + R0
const D0 = idealOrbitRadius  // 层级间距即理想轨道半径（初始全在 tier 0）
```

**2. 生成草稿 + 碰撞检测**：

1. `positionOnCircle` 以形心为中心、`idealOrbitRadius` 为半径均分圆周。
2. `hasCollisionInDrafts` 检测沟通节点草稿是否与被选节点重叠。
3. 碰撞时 `orbitRadius += R0` 重试——轨道半径逐步外扩。最多重试 N 次。
4. 全失败则报 error，整批丢弃。

父图侧：抽象节点以形心为起点，`hasCollisionAt` 检测是否碰剩余节点。碰撞则 `scatterInCircle(形心, R0)` 随机散布重试。

## 残留问题

| # | 问题 | 状态 |
|---|------|------|
| Q16 | 被选节点之间的内部边跟随下沉到子图还是留在父图？ | ✅ 已确认：跟随下沉 |
| Q17 | 抽象节点在父图中如何与未选邻居连接？ | ✅ 已确认：直接连接，不经过沟通节点。沟通节点只存在于子图内 |
| Q18 | 被选节点移入子图后旧位置如何处理？ | ✅ 已确认：旧位置不留痕，抽象节点取代了它们的位置 |

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
    [未选X] ── [抽象Z(形心)] ── [未选Y]

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
- 父图中 `抽象Z` 直接连接未选邻居，沟通节点只在子图内。
