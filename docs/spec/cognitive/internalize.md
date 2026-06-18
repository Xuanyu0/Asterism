# internalize — 内化（转移节点至常识层）

## 输入

| 参数 | 类型 | 来源 |
|------|------|------|
| `nodeIds` | `NodeId[]` | 前端用户框选的待内化节点列表 |
| `parentGraph` | `GraphData` | graph_store 当前快照（被选节点所在的父图） |
| `commonLayer` | `GraphData` | graph_store 中的常识层图（`kind: 'commonLayer'`，`parentGraphId = 主图谱 ID`） |
| `registry` | `GraphRegistry` | 多图注册表，由 graph_store 传入 |
| `nodeRadiusOverrides` | `NodeRadiusMap` | 前端预计算的半径覆盖表，用于 `scatterInCircle` 碰撞检测 |

`InternalizeOperation` 类型：`{ type: 'internalize', nodeIds: NodeId[] }`。

## 调用场景

| | |
|---|---|
| 调用方 | 前端 `operation_controller`（Cognition 模式） |
| 频率 | 一次性——用户框选节点后执行"内化"命令时调用 |
| 前置要求 | `commonLayer` 已存在（应用初始化时创建）。常识层的 `parentGraphId = 主图谱 ID`，`kind = 'commonLayer'` |

内化操作是认知层面的"收纳"——将确认已内化的知识节点从工作区（父图/子图）转移到常识层，清空其边结构，节点本身保留。

## 前置条件

### 语义预检 error

| 条件 | 校验方式 | 错误消息 |
|------|---------|---------|
| `nodeIds` 非空 | `nodeIds.length >= 1` | `内化操作至少需要一个节点。` |
| 至少存在一个知识节点 | 遍历 `nodeIds`，在 `parentGraph` 或其子图中查找，跳过引用节点。全为引用节点 → error | `所有目标节点均为引用节点，不存在可内化的知识节点。引用节点已在原图中自动删除。` |
| 目标知识节点存在于对应图中 | 逐个查找 | `节点 ${nodeId} 在当前图谱及其子图中均不存在。` |

**引用节点自动删除**：`nodeIds` 中的引用节点（`role === 'reference'`）在原图中直接删除，不转移至常识层。引用节点是外部知识的投影，不是可内化的知识实体。此行为不是 error——引擎静默处理，不阻塞确认。

### 语义预检 warning

| 条件 | 校验方式 | 警告消息 |
|------|---------|---------|
| 目标节点是抽象节点（`form === 'abstract'`） | 检查 `knowledgeNode.form` | `节点 ${nodeId} 是抽象节点，其子图内的沟通节点将被一并删除。` |

### 原子操作校验（applyBatch 层）

一票否决。校验项包括节点存在性、边删除的 source/target 有效性。

## 返回值

- **drafts**：不返回。常识层无边，自动尝试放置，无需位置预览。
- **issues 典型清单**：见上方语义预检 + 原子操作校验的错误/警告消息。

## 后置影响（图结构变化）

### 父图（及子图）

对每个被内化的节点：

1. **若为原子节点（`form === 'atomic'`）**：
   - `delete_edge` — 删除连接到该节点的所有边（父图 + 子图，如有）。
   - `delete_node` — 从父图中删除该节点。

2. **若为抽象节点（`form === 'abstract'`）**：
   - `delete_edge` — 删除父图中连接到该节点的所有边。
   - 递归处理子图：子图内的沟通节点（`referenceKind === 'communication'`）一并删除——常识层没有边的概念，沟通节点失去存在意义。
   - 递归处理子图：子图内的普通边全删。
   - 子图内的知识节点**位置不动**——它们的坐标不因内化而改变，仅断边。
   - `delete_node` — 从父图中删除该抽象节点。
   - 子图本身**不删除**——仅清空其节点和边。子图 ID 保留，用户后续可重新往里添加内容。

3. **若为引用节点（`role === 'reference'`）**：
   - `delete_node` — 从原图直接删除。不创建常识层副本。引用节点是外部知识的投影，不是可内化的实体。

### 常识层（`commonLayer`）

- `add_node`（× N）— 每个被内化的节点（含抽象节点的子图内知识节点）在常识层中创建副本。`graphId` 改为常识层 ID，`position` 由 `scatterInCircle` 在常识层中随机找空位。其他字段（`label` / `degree` / `abstractionLevel`）保留原值。
- **无边** — 常识层不创建任何边。

### 边

全部删除。父图、子图、沟通连接——任何与内化节点关联的边全部移除。常识层没有边结构。

### 节点度数

所有度数归零——节点迁入常识层后 `degree = 0`。

## applyBatch 得到的原子操作序列

顺序：先删边，再删节点，最后在常识层建新节点。边必须在节点删除前清理完毕（外键约束）。

```
事务 1（父图） — applyBatch(parentGraph, parentOps, registry)：
    引用节点：  delete_node（直接删除，不转移）
    知识节点：  delete_edge（所有连接边）→ delete_node

事务 2（子图，如有抽象节点） — applyBatch(childGraph, childOps, registry)：
    普通边：    delete_edge（子图内全删）
    沟通节点：  delete_node
    子图内知识节点：  delete_node（节点本身，常识层重建）

事务 3（常识层） — applyBatch(commonLayer, commonOps, registry)：
    知识节点：  add_node（graphId = 常识层ID，position = scatterInCircle，degree = 0）
```

> **跨图事务协调**：internalize() 依次调三次 `applyBatch`。子图 ops 独立于父图——按图分组保证 `delete_edge` 的 source/target 存在于对应图中。

## 事务语义

| | |
|---|---|
| 原子性边界 | 全部操作（父图 delete_edge + delete_node × N + 子图 delete_edge + delete_node × K + 常识层 add_node × M）构成一个认知事务。一票否决 |
| dryRun 行为 | 所有步骤 dryRun 预判 → 全通过后执行。前端在"内化预览"弹窗中展示将删除的边数、沟通节点数 |
| 幂等性 | 否。执行后节点已移入常识层，原位置不再存在。再次调用会因"节点不存在"报 error |
| 可逆性 | 是。`createReversal` 可构造逆操作序列：从常识层删除节点 → 在父图重建节点和边 → 恢复沟通节点。undo snapshot 保存执行前的完整图状态 |

## 位置安排策略

### 常识层中的节点

节点逐个放置。使用 `scatterInCircle` 随机散布，半径逐步递增，保证永不失败：

```ts
const placedDrafts: { nodeId: NodeId; position: NodePosition }[] = []

for (const node of internalizedNodes) {
    let radius = R0

    while (true) {
        const position = scatterInCircle({ x: 0, y: 0 }, radius)
        // 检测是否与常识层已有节点 + 同批已放置节点碰撞
        if (!hasCollisionAt(node.id, position, commonLayer.nodes, nodeRadiusOverrides)
            && !hasCollisionInDrafts([{ nodeId: node.id, position }], placedDrafts, nodeRadiusOverrides)) {
            placedDrafts.push({ nodeId: node.id, position })
            break
        }
        radius += R0
    }
}
```

- 无重试上限——每次碰撞将散布半径扩大 R0，迟早找到空位。
- 同时检测与常识层已有节点和同批已放置节点的碰撞。
- 常识层无边，随机位置不破坏任何拓扑信息。

### 子图内保留的节点

抽象节点的子图内知识节点**位置不动**——它们被迁入常识层后保留原坐标。仅边被删除，坐标不重构。

### 已有节点

不受影响的节点位置不变。

---

## 附：操作前后对照

```
内化前（父图）：
    [X] ── [A(atomic)] ── [Y]
    [B(abstract)] ── [Z]
     │
    [子图：沟通C ── 知识D ── 知识E]

内化后（父图）：
    [X]  [Y]               ← A 消失，边 X-A / A-Y 删除
    [Z]                    ← B 消失，边 B-Z 删除

内化后（常识层）：
    [A']  [D']  [E']       ← A/D/E 的新副本，随机散布
    无边

    [子图]                  ← 保留（空），沟通节点 C 已删除
```

其中 `A'` 的 `graphId = 常识层ID`，`position = scatterInCircle产出`。
