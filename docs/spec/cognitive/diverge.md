# diverge — 发散（有向虚边 + 启发节点 + 镜像）

## 输入

| 参数 | 类型 | 来源 |
|------|------|------|
| `sourceNodeId` | `NodeId` | 用户点击的第一个节点，或在搜索浮空窗中选定的节点 |
| `targetNodeId` | `NodeId` | 用户点击的第二个节点，或在搜索浮空窗中选定的节点 |
| `currentGraph` | `GraphData` | graph_store 当前快照（用户正在操作的图，边始终建在此图内） |
| `heuristicPosition` | `NodePosition \| null` | 用户点击空白处的位置。`null` 表示直接连两个已有节点（不需要启发） |
| `registry` | `GraphRegistry` | 多图注册表 |

> **注意**：`sourceNodeId` 和 `targetNodeId` 都由前端搜索/点选确定后传入。diverge 不负责搜索。`heuristicPosition` 是用户点击画布空白处的坐标，不是引擎计算的——启发节点就放在用户点的那个位置。

## 调用场景

| | |
|---|---|
| 调用方 | 前端 `operation_controller`（Cognition 模式） |
| 频率 | 一次性——用户完成点击/搜索后调用 |

用户交互有三种路径，到引擎层合并为同一函数、按参数区分：

| 用户操作 | `heuristicPosition` | 含义 |
|---------|:---:|---|
| 点击节点 → 点击节点 | `null` | 两个节点都在当前图，直接连边 |
| 点击空白(搜索) → 点击节点 | 有值 | 搜索到的节点不在当前图，在点击位置建启发节点，再连边 |
| 点击节点 → 点击空白(搜索) | 有值 | 同上，方向相反 |

## 前置条件

### 语义预检 error

| 条件 | 校验方式 | 错误消息 |
|------|---------|---------|
| 若 `heuristicPosition !== null`，则两个节点不能都在当前图中 | 查找 `currentGraph.nodes` | `节点 ${sourceNodeId} 和 ${targetNodeId} 都已存在于当前图中，无需创建启发节点。请直接连边。` |
| 若 `heuristicPosition === null`，则两个节点都必须存在于当前图中 | 查找 `currentGraph.nodes` | `节点不存在于当前图中，请先通过搜索创建启发节点。` |
| 边的两个端点不能同时为引用节点（禁止链式引用 `ref → ref`） | 情况 A：查找 `currentGraph.nodes` 中 `sourceNodeId` 和 `targetNodeId` 的 `role`。情况 B：启发端点天然为 reference，检查另一端点（在当前图中）的 `role`。两端均为 reference → error | `边的两个端点不能同时为引用节点——禁止链式引用。` |

**端点的四种组合**：

| source（边端点） | target（边端点） | 合法性 |
|:---:|:---:|:---:|
| knowledge | knowledge | ✅ |
| knowledge | reference | ✅ |
| reference | knowledge | ✅ |
| reference | reference | ❌ 链式引用 |

只要至少一个端点是 knowledge 就合法。已有的启发节点可以参与发散——它可以指向一个知识节点（`ref → k`），或被一个知识节点指向（`k → ref`）。

### 语义预检 warning

无。

## 行为

### 情况 A：`heuristicPosition === null`（两节点直连）

两个节点都在当前图内。直接建边。

```
[A(知识)] ─ ─ → [B(知识)]    有向虚边，同一图内
```

原子操作序列：
```
1. add_edge    edge = { source: sourceNodeId, target: targetNodeId,
                        kind: 'virtual', direction: 'directed' }
```

### 情况 B：`heuristicPosition !== null`（单边启发 + 镜像）

其中一个节点不在当前图，在 `heuristicPosition` 创建启发节点，再连边。同时自动镜像——在另一端图也创建对偶启发节点。

```
当前图：   [A(知识)] ─ ─ → [B'(启发)]        启发在 heuristicPosition
                               └── sourceNodeId = B.id

对端图：   [A'(启发)] ─ ─ → [B(知识)]        镜像，scatterInCircle 放置
               └── sourceNodeId = A.id
```

原子操作序列（当前图）：
```
1. add_node    node = <启发节点, position = heuristicPosition,
                       sourceNodeId = 不在当前图的节点的 ID>
2. add_edge    edge = { source: ..., target: ..., kind: 'virtual', direction: 'directed' }
```

镜像操作序列（对端图）：
```
1. add_node    node = <对偶启发节点, position = scatterInCircle产出,
                       sourceNodeId = 当前图侧已有的知识节点的 ID>
2. add_edge    edge = { source: ..., target: ..., kind: 'virtual', direction: 'directed' }
```

**镜像规则**：
- 镜像与主操作属于同一事务。主操作失败 → 镜像不执行，反之亦然。
- 镜像启发节点的位置由 `scatterInCircle` 在对端图中自动找空位（用户不参与）。
- **方向一致性**：用户点击顺序决定了 source → target。source 节点及其所有启发代理（无论在哪个图中）始终是边的 source。target 节点及其所有启发代理始终是边的 target。与端点的 `role`（knowledge / reference）无关。

## 返回值

- **drafts 数量**：给锚节点数量（0 或 1，不含镜像侧的启发节点——镜像不可预览）
- **Draft 扩展字段**：`graphId`

## 后置影响（图结构变化）

### 情况 A

| 图 | 操作 | 说明 |
|------|------|------|
| 当前图 | `add_edge`（× 1） | 有向虚边 |

### 情况 B

| 图 | 操作 | 说明 |
|------|------|------|
| 当前图 | `add_node`（× 1） | 启发节点，位置 = `heuristicPosition` |
| 当前图 | `add_edge`（× 1） | 有向虚边，启发 ↔ 知识 |
| 对端图 | `add_node`（× 1） | 镜像启发节点，位置 = `scatterInCircle` |
| 对端图 | `add_edge`（× 1） | 有向虚边，镜像启发 ↔ 知识 |

## applyBatch 得到的原子操作序列

全部属于同一事务。跨图时分图调 `applyBatch`。

```
情况 A（当前图）：
    1. add_edge

情况 B：
    ── 当前图 ──
    1. add_node    node = <启发节点, position = heuristicPosition>
    2. add_edge    edge = <有向虚边>

    ── 对端图 ──
    3. add_node    node = <镜像启发节点, position = scatterInCircle>
    4. add_edge    edge = <有向虚边>
```

## 事务语义

| | |
|---|---|
| 原子性边界 | 全部操作构成一个认知事务。主操作 + 镜像同生共死，一票否决 |
| dryRun 行为 | 所有步骤 dryRun 预判 |
| 幂等性 | 否。允许重复——每次发散是独立的启发过程，各带独立时间戳 |
| 可逆性 | 是。`createReversal` 逆操作：删除启发节点、镜像启发节点、两条边 |

## 位置安排策略

| 节点 | 位置来源 | 说明 |
|------|---------|------|
| 当前图启发节点 | `heuristicPosition`（用户点击坐标） | 用户手动放置，不调 scatterInCircle |
| 镜像启发节点 | `scatterInCircle` | 对端图中自动找空位 |
| 已有知识节点 | 不变 | — |

---

## 附：操作前后对照

### 情况 A（同图直连）

```
操作前：  当前图：[A]   [B]

操作后：  当前图：[A] ─ ─ → [B]    有向虚边
```

### 情况 B（启发 + 镜像，以 sourceNodeId 不在当前图为例）

```
操作前：
  当前图：[B]          对端图：[A]

操作后：
  当前图：[A'] ─ ─ → [B]    A' = 启发节点（用户点击位置），sourceNodeId = A.id
  对端图：[A] ─ ─ → [B']    B' = 镜像启发节点（scatterInCircle），sourceNodeId = B.id
```
