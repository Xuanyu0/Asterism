# deconstruct — 解构（原子 → 抽象）

## 输入

| 参数 | 类型 | 来源 |
|------|------|------|
| `nodeId` | `NodeId` | 前端用户右键/工具栏选中的目标节点 |
| `parentGraph` | `GraphData` | graph_store 当前快照（目标节点所在的父图） |

`DeconstructOperation` 的类型定义位于 `types/cognitive_operations.ts`：`{ type: 'deconstruct', nodeId: NodeId }`。

## 调用场景

| | |
|---|---|
| 调用方 | 前端 `operation_controller`（Cognition 模式） |
| 频率 | 一次性——用户选中一个原子实节点，执行"解构"命令时调用 |
| 前置要求 | 目标节点的 `role === 'knowledge'` 且 `kind === 'real'` 且 `form === 'atomic'`。虚节点（`kind === 'virtual'`）和抽象节点（`form === 'abstract'`）不可解构 |

`deconstruct()` 是认知操作中最简单的一个——不跨图搬运节点，不涉及多图事务协调，只做单节点身份转换 + 空子图创建 + 沟通节点生成。

## 前置条件

### 目标节点必须满足的条件（不满足则 error）

| 条件 | 校验方式 | 错误消息 |
|------|---------|---------|
| 目标节点存在于 `parentGraph` 中 | `parentGraph.nodes.find(node => node.id === nodeId)` 不为 `undefined` | `节点 ${nodeId} 在当前图谱中不存在。` |
| 目标节点的 `role === 'knowledge'` | 检查 `node.role` | `节点 ${nodeId} 不是知识节点，不能解构。` |
| 目标节点的 `kind === 'real'` | 检查 `knowledgeNode.kind`（narrow 后） | `节点 ${nodeId} 是虚节点，不能解构。` |
| 目标节点的 `form === 'atomic'` | 检查 `knowledgeNode.form`（narrow 后） | `节点 ${nodeId} 已是抽象节点，不能重复解构。` |

### warning

无。当前无 warning 级别的条件。

### 前置条件两阶段

deconstruct 的前置条件分两层：

1. **语义预检（compose 层）**：目标节点角色/形态校验。这些是认知语义层面的约束，在组装操作之前完成。
2. **原子操作校验（applyBatch 层）**：父图侧 `update_node` 的 `validate` 规则。子图不经过 `applyBatch`——子图对象在 compose 层直接构造，不存在"子图侧操作校验"。

任一阶段失败 → 整批丢弃。

## 返回值

- **drafts 数量**：0。deconstruct 不产生位置草稿——抽象节点继承原位置，沟通节点在空子图中初始聚集在原点附近。无位置预览需求，前端确认按钮不依赖碰撞检测。
- **Draft 扩展字段**：无。不返回 `ComposeResult` 的 drafts 字段（空数组）。
- **issues 典型清单**：见上方"前置条件"中的四条 error 消息。
- **新增返回字段 `childGraph`**：compose 层直接构造的完整子图对象（含沟通节点）。前端 `operation_controller` 在 `applyBatch` 父图操作后，调 `graphStore.registerNewGraph(childGraph)` 将子图持久化并注册到 Registry。

> **设计理由**：`executeOperation` 签名是 `(graph, op) → graph`——单图进，单图出。创建新图不是对已有图的变换，无法通过此接口表达。子图由 compose 层直接构造，经 `registerNewGraph` 写入持久化。

## 后置影响（图结构变化）

### 父图

- **节点**：目标节点的 `form` 从 `'atomic'` 变为 `'abstract'`，`childGraphId` 指向新创建的子图 ID。`position` / `label` / `degree` 不变。
- **边**：不变。原节点连接的边全部保留在父图，`kind` / `direction` / `source` / `target` 原样不动。

### 子图（新建，`kind: 'subgraph'`，`ownerNodeId === nodeId`）

- **节点**：为原节点的每个邻居创建一个沟通节点（`role: 'reference'`，`kind: 'communication'`）。沟通节点的 `sourceGraphId` 指向父图，`sourceNodeId` 指向对应的邻居节点，`label` 继承邻居的 `label`。
- **边**：空。新创建的子图不含任何边。沟通节点之间不自动连接。

> **设计意图**（A2 定案：父图层保留 + 子图继承）：
> - 父图层边保持不动——用户从父图看拓扑结构不变。
> - 子图创建沟通节点作为"入口标记"——用户打开子图时能看到有哪些外部节点与此抽象概念关联。
> - 子图内部不自动生成边——内部结构由用户后续在子图中手动构建。

### 常识层

不涉及。

## applyBatch 得到的原子操作序列

父图侧仅一条 `update_node`：

```
applyBatch(parentGraph, [update_node])
```

```
1. update_node
   node = {
       ...原节点,
       form: 'abstract',
       childGraphId: <新子图 ID>,
   }
```

子图不经过 `applyBatch`——`executeOperation` 的签名是 `(graph, op) → graph`，单图进单图出。创建新图不是单图变换，不能由此接口表达。子图由 compose 层在内部直接构造完整对象，交给 `registerNewGraph` 写入持久化和 Registry。

compose 层内部构造的子图对象：

```
childGraph: {
    id: <新生成的子图 ID>,
    kind: 'subgraph',
    title: <目标节点的 label>,
    parentGraphId: <父图 ID>,
    ownerNodeId: <目标节点 nodeId>,
    nodes: [
        // 每个邻居一个沟通节点（直接构造，不走 add_node）
        { id: <新生成 ID>, graphId: <子图 ID>,
          role: 'reference', referenceKind: 'communication',
          label: neighbor.label,
          sourceGraphId: <父图 ID>, sourceNodeId: neighbor.id,
          position: { x: 0, y: 0 }, abstractionLevel: 0, degree: 0 },
        ...
    ],
    edges: [],
}
```

**执行流程**：

```
deconstruct() 返回 { operations, issues, childGraph }
    ↓
operation_controller:
    1. applyBatch(parentGraph, operations)         ← 父图 update_node
    2. graphStore.registerNewGraph(childGraph)     ← 子图持久化 + 注册
```

## 事务语义

| | |
|---|---|
| 原子性边界 | 一条 `update_node` + `registerNewGraph`：父图 `applyBatch` 失败 → 子图不写入。子图写入失败 → 父图不回滚，但此场景概率极低（`registerNewGraph` 无校验，仅 `saveGraph` + `registerGraph`） |
| dryRun 行为 | 逐条 validate 父图 ops，全通过后跳过 execute |
| 幂等性 | 否。`form === 'abstract'` 的节点不可再次解构 |
| 可逆性 | 是。`createReversal` 逆操作：删除子图（`delete_graph` + `unregisterGraph`）、回退 `form` 为 `'atomic'`、清除 `childGraphId`

## 位置安排策略

### 抽象节点

不移动。`position` 保持原值。原子 → 抽象的转换是身份变化，不影响几何位置。

### 沟通节点（子图内）

新建沟通节点初始聚集在子图原点 `{ x: 0, y: 0 }`。所有沟通节点坐标完全相同，视觉上互相重叠。

**这不是 bug——是刻意的设计决策：**

**1. 空子图没有边，arrangement 操作无法通过边校验。**

arrangement 操作不限制节点角色——引用节点也可以当 center 或 satellite。它们的校验条件是**边**：`orbit` 要求卫星与中心间存在 `kind === 'real'` 的边，`path` 要求有向实边。空子图没有边，任何 arrangement 操作都无法通过前置校验。

沟通节点之间不会自动互连（它们只是外部邻居的投影，彼此没有语义关系）。等用户在子图中添加知识节点并连边后，arrangement 操作才有可用的边拓扑。

**2. 重叠是 UI 信号。**

用户首次打开子图时看到一堆节点叠在原点，视觉上自然知道"这些节点需要排列"。不放置到一个"看起来还行"的随机位置，是因为随机位置会掩饰"还没排好"的事实。重叠是诚实的——它告诉用户"这是未完成状态，你来动手"。

**3. 碰撞检测不适用于此场景。**

`hasCollisionInDrafts` 的语义是"草稿位置是否侵犯已有节点的空间"，用于防止移动操作破坏现有布局。空子图没有已有节点需要保护，检测"草稿 vs 已有节点"没有意义。草稿之间的互碰（多个沟通节点堆在同一点）在空子图语境下不是碰撞——它们是平等的未排列实体，用户打开子图后自然会用 arrangement 操作分开它们。

**4. 后续排列路径。**

正确的 workfow：

```
解构后子图：沟通节点堆在原点
    ↓
用户打开子图，添加知识节点、连边
    ↓
子图有了知识节点和边结构
    ↓
用户用 orbit / path / move 围绕某个知识节点排列沟通节点
```

沟通节点堆在原点不是"等用户排它们"，而是"等用户先构建子图的内部结构"。内部结构定下来之后，排列操作才有参照物。

### 已有节点

不受影响的节点位置不变。

---

## 残留问题

| # | 问题 | 状态 |
|---|------|------|
| Q15 | 下沉复制边时，子图内是否需要创建沟通节点之间的边（如原图中两个邻居之间有边）？ | ✅ 已确认：否 |

**决策理由**：沟通节点是外部邻居在子图内的投影，作用是让子图内的知识节点通过它们与外部世界连通。沟通节点之间不需要互连——它们各自引用不同的外部源节点，彼此在子图内没有独立的语义关系。若用户想查看两个邻居之间的连接，应回到父图查看原边，而不是在子图内复制一份。

---

## 附：操作前后对照

```
解构前（父图）：
    [B] ── [A(atomic)] ── [C]
              │
             [D]

解构后（父图）：
    [B] ── [A(abstract)] ── [C]
              │
             [D]

解构后（子图, ownerNodeId = A.id）：
    [B']  [C']  [D']      ← 三个沟通节点，引用 B/C/D
    无内部边
```

其中 `B'` 的 `sourceNodeId = B.id`，`sourceGraphId = 父图ID`，`graphId = 子图ID`。
