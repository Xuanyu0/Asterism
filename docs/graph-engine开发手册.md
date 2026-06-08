# GraphEngine 开发手册

> Phase 2 核心交付物。本文档定义 GraphEngine 的架构、范式、接口、目录结构、实现路线。

---

# 一、定义

## 一句话定义

**GraphEngine 是框架无关、同构、纯函数的 GraphData 状态迁移运行时，是系统中所有图数据变更的唯一权威入口。**

## 核心公式

```
GraphEngine(state, command) → { newState, validation }
```

| 参数 | 含义 |
|------|------|
| `state` | 当前 `GraphData`（单图或多图上下文） |
| `command` | `GraphOperation`（原子操作）或 `CognitiveOperation`（认知操作） |
| `newState` | 变更后的 `GraphData`（不可变，新对象） |
| `validation` | `ValidationResult` — 操作是否合法、不合法原因列表 |

## GraphEngine 是什么

- 一个 TypeScript 纯函数库，不持有任何可变状态
- 校验 + 执行 + 认知操作组合 + 布局计算，四层能力
- 前端浏览器可直接 import 执行
- 全部入参与返回值 JSON 可序列化

## GraphEngine 不是什么

- ❌ 不是状态容器（不持有 `currentGraph`，不替代 Pinia Store）
- ❌ 不知道网络 / HTTP / WebSocket
- ❌ 不知道 UI 框架（Vue / React）
- ❌ 不知道 AI / LLM（不调模型，不发 prompt）
- ❌ 不知道权限（权限是后端 Collabrator 调用层的职责）
- ❌ 不知道具体存储实现（只定义 `PersistenceAdapter` 接口）

---

# 二、技术决策

## 语言：TypeScript

| 维度 | 结论 |
|------|------|
| **类型系统** | TS discriminated union 与 GraphData 的 `NodeRole` 第一层判别天然匹配，编译器自动 narrow |
| **前端集成** | 浏览器直接 import，同进程执行，零延迟 |
| **Phase 1 代码保留** | 100% 保留，~1290 行纯函数只需搬家 + 接口规范化 |
| **未来后端执行** | 引擎稳定后，可通过 Node.js 子进程或 Rust + WASM 在后端执行。MVP 阶段引擎只在浏览器中运行 |

## 范式：类型驱动 + 函数式

类型定义"这个领域有哪些概念"，函数定义"这些概念之间可以发生什么变换"。两者分离，各自独立演化。

```
types/           →  "是什么"            — 纯类型，零逻辑
core/            →  "做什么"            — 纯函数，零状态
compose/         →  "如何组合"          — 原子操作的编排器 + 位置计算
  cognitive/     →    知识结构组合（认知操作）
  arrangement/   →    位置计算组合（布局算法）
validators/      →  "规则约束"          — 图结构校验（常量 + 原子规则 + 编排）
infrastructure/  →  "依赖什么基础设施"   — 跨模块共享的底层能力
```

不采用 OOP（`class GraphData { addNode() }`）的原因：

1. **引擎不持有状态** — 不持有状态的东西，OOP 的 `this` 没有意义
2. **JSON 序列化边界** — 数据跨进程传输时方法不跟着走，数据和逻辑必须分离
3. **测试简单性** — `f(graph, op) → newGraph` 比 `obj.method()` 更容易测试

## 新增工具（仅一个）

```bash
pnpm add -D vitest
```

| 工具 | 用途 | 不选其他工具的理由 |
|------|------|-------------------|
| vitest | 引擎单元测试 | Vite 原生集成，API 兼容 Jest，原生 TS，不装额外包 |

所有其他基础设施（pnpm workspace / tsc / Vite / 标准库模块）已到位。

---

# 三、架构

## 整体位置

```
                          ┌──────────────────────────────────────────────┐
                          │              GraphEngine                       │
                          │         (framework-agnostic pure fn)           │
                          │                                               │
                          │  types/       core/         compose/           │
                          │  ────────    ────────     ────────────        │
                          │  GraphData    validate      cognitive/         │
                          │  NodeData     execute         deconstruct      │
                          │  EdgeData     apply           induce           │
                          │  Operation    normalize       internalize      │
                          │  ────────     id              diverge         │
                          │  validators/               arrangement/       │
                          │  ──────────                  move             │
                          │  规则常量                    adjust            │
                          │  原子校验                    path              │
                          │  操作编排                                      │
                          │  infrastructure/                               │
                          │  ───────────────                               │
                          │  graph_registry   (多图上下文)                 │
                          │  search           (图内节点搜索)               │
                          │  collision        (节点碰撞检测)               │
                          │  persistence      (持久化接口)                 │
                          └──────────────────────────────────────────────┘
                               ↗                    ↖
                   ┌───────────┘                    └───────────┐
                   │                                            │
           Frontend (Vue 3)                          Backend (Python)
           ┌───────────────────┐                   ┌─────────────────────┐
           │ Pinia Store (薄)  │                   │ Collabrator 编排层  │
           │ OperationController│                  │ Assistant           │
           │ → apply(atomic)   │                   │   → 生成 Graph Patch│
           │ → compose.xxx()   │                   │ Prompter            │
           │ localStorage 适配器│                   │   → 分析现有 Graph │
           └───────────────────┘                   │ Analyst (MVP 后)    │
                                                   │ Builder (MVP 后)    │
                                                   │                     │
                                                   │ GraphData 持久化    │
                                                   │ (Supabase, 权威源)  │
                                                   └─────────────────────┘
```

## 数据流方向（严格单向）

```
用户交互 (DOM)
    ↓
OperationController (编排层)
    ↓ GraphOperation / CognitiveOperation
GraphEngine.apply() / GraphEngine.compose.cognitive.xxx() / GraphEngine.compose.arrangement.xxx()
    ↓ 新 GraphData + ValidationResult / PositionAssignment[]
Pinia Store (状态替换)
    ↓ watch
Cytoscape Renderer (投影渲染)
```

## MVP 阶段进程拓扑

MVP 只需要三个进程，引擎只在浏览器进程内执行：

```
┌──────────────────────────────────────────┐
│  进程 1：浏览器（用户机器）              │
│                                          │
│  职责：                                  │
│  - Vue 3 UI 渲染                         │
│  - GraphEngine 执行（同线程，直接 import）│
│  - localStorage 持久化                   │
│  - Cytoscape 渲染                        │
│  - 异步同步 GraphData 到后端权威存储      │
└──────────────┬───────────────────────────┘
               │ HTTP
               ↓
┌──────────────────────────────────────────┐
│  进程 2：Python FastAPI（服务器，常驻）  │
│                                          │
│  职责：                                  │
│  - REST API 端点                         │
│  - Collabrator 编排（调用 LLM）           │
│  - Supabase 权威数据读写                 │
│  - 用户认证                              │
│                                          │
│  不跑 GraphEngine（Phase 3 才需要）       │
└──────────────────────────────────────────┘
               │
               ↓
┌──────────────────────────────────────────┐
│  进程 3：Vite Dev Server（仅开发期）      │
│                                          │
│  职责：HMR + 静态资源服务 + API 代理      │
│  生产环境消失（变为静态文件）              │
└──────────────────────────────────────────┘
```

**引擎不跨进程**。用户每次点击触发 `validate` + `execute`，全部在浏览器同进程完成（<1ms）。后端不持有引擎副本，只做三件事：

1. 接收前端发来的最终 GraphData，存入 Supabase（持久化权威源）
2. 按需调用 LLM 做 Collabrator 推理，返回分析结果或候选操作序列
3. 返回的候选操作序列在前端逐条展示，用户确认后由前端的引擎执行

## GraphEngine 不替代 Pinia

GraphEngine 是**计算引擎**，Pinia 是**状态持有者**。两者不是竞争对手，是分工：

| 职责 | GraphEngine | Pinia graph_store |
|------|------------|-------------------|
| 持有当前图 | ✗ | ✓ `currentGraph` |
| 持有选中状态 | ✗ | ✓ `selectedNodeId` |
| 持有 Undo 栈 | ✗ | ✓ `undoStack` |
| 校验 Operation | ✓ `validate()` | ✗ |
| 执行 Operation | ✓ `execute()` | ✗ |
| 持久化适配 | ✗ (只定义接口) | ✓ 注入适配器并调用 |
| Vue 响应式 | ✗ | ✓ |

---

# 四、模块结构

## 目录编排逻辑

顶层目录按职责层级组织，每个文件夹回答一个不同层面的问题：

```
types/           →  "是什么"             — 纯类型，零逻辑
core/            →  "做什么"            — 纯函数，零状态
compose/         →  "如何组合"          — 原子操作的编排器 + 位置计算
validators/      →  "规则约束"          — 图结构校验
infrastructure/  →  "依赖什么基础设施"   — 跨模块共享的底层能力
```

分层原则：

1. **上层依赖下层**：`compose/` → `infrastructure/` → `core/` → `types/`，同层不互引
2. **纯函数分离**：逻辑和状态分离（引擎不持有状态，Pinia 才持有）
3. **类型驱动**：类型定义"有哪些概念"，函数定义"这些概念间可以发生什么变换"
4. **无兜底目录**：不设 `utilities/` 类杂项目录，每个文件有明确职责归属

## 完整目录树

```
packages/graph-engine/
├── package.json
├── tsconfig.json
│
├── src/
│   ├── index.ts                    # 公开 API 入口
│   │
│   ├── types/                      # 类型定义 — "是什么"
│   │   ├── graph_data.ts           #   GraphData, NodeData, EdgeData, NodeRole ...
│   │   ├── operations.ts           #   GraphOperation 联合类型
│   │   ├── validation.ts           #   ValidationResult, ValidationIssue
│   │   └── cognitive.ts            #   CognitiveResult 等认知操作相关类型
│   │
│   ├── core/                       # 核心引擎 — "做什么"
│   │   ├── validate.ts             #   validateOperation(graph, op) → ValidationResult
│   │   ├── execute.ts              #   executeOperation(graph, op) → GraphData
│   │   ├── apply.ts                #   applyOperation(graph, op) → { graph, validation }
│   │   │                            #   统一入口：先 validate，通过后 execute
│   │   ├── normalize.ts            #   normalizeGraph — 初始化补默认值（从 utilities 迁入）
│   │   └── id.ts                   #   generateNodeId, generateEdgeId, generateGraphId（从 id_runtime 迁入）
│   │
│   ├── compose/                    # 组合层 — "如何组合"
│   │   ├── index.ts                #   统一导出入口（Phase 3 扩展点）
│   │   │
│   │   ├── cognitive/              #   认知操作 — 知识结构组合
│   │   │   ├── deconstruct.ts      #     解构：原子实节点 → 抽象节点 + 空子图
│   │   │   ├── induce.ts           #     归纳：多个节点 → 一个抽象节点 + 子图
│   │   │   ├── internalize.ts      #     内化：转移节点至常识层
│   │   │   └── diverge.ts          #     发散：跨图创建启发节点 + 有向虚边
│   │   │
│   │   └── arrangement/            #   布局操作 — 位置计算
│   │       ├── move.ts             #     单点移动（已有 move_node，此处为批量编排）
│   │       ├── adjust.ts           #     adjustDistance / adjustAngle 计算
│   │       └── path.ts             #     路径布局算法
│   │
│   ├── validators/                 # 规则约束 — 图结构校验
│   │   ├── rules.ts                #   DEFAULT_GRAPH_RULES 常量（从 rules/ 迁入）
│   │   ├── rule_checkers.ts        #   validateSelfLoop, validateDuplicateEdge ...
│   │   ├── operation_validator.ts  #   单步操作校验编排
│   │   ├── graph_validator.ts      #   全图体检
│   │   └── registry.ts             #   规则启用表（Phase 3 扩展点，当前全部 true）
│   │
│   ├── infrastructure/             # 基础设施 — 跨模块共享的底层能力
│   │   ├── graph_registry.ts       #   多图上下文管理（Map<GraphId, GraphData>）
│   │   ├── search.ts               #   图内节点搜索引擎（跨图 label 匹配）
│   │   ├── collision.ts            #   节点碰撞检测 + 最小位移推开
│   │   └── persistence.ts          #   PersistenceAdapter 接口定义（从 persistence/ 迁入）
│   │
└── tests/
    ├── core/
    │   ├── validate.test.ts
    │   └── execute.test.ts
    ├── infrastructure/
    │   ├── graph_registry.test.ts
    │   ├── search.test.ts
    │   └── collision.test.ts
    ├── compose/
    │   ├── cognitive/
    │   │   ├── deconstruct.test.ts
    │   │   ├── induce.test.ts
    │   │   └── internalize.test.ts
    │   └── arrangement/
    │       └── path.test.ts
    └── validators/
        └── rule_checkers.test.ts
```

## 模块职责明细

### types/ — 类型定义

| 文件 | 内容 | 规则 |
|------|------|------|
| `graph_data.ts` | `GraphData`, `NodeData` (discriminated union), `EdgeData`, `GraphId`, `NodeId`, `EdgeId`, `GraphPosition`, `GraphKind`, `GraphCognitiveState`。新增 `GraphRegistry` 类型、`SearchResult` 类型、`NodeRadiusMap` 类型、`NodeData.groupId?: string` 预留字段 | 纯类型，零逻辑。从 Phase 1 `graph_types.ts` 直接迁移 + Phase 2 新增 |
| `operations.ts` | `GraphOperation` 联合类型，9 种具体 Operation 的 interface | 从 Phase 1 `graph_operation_types.ts` 直接迁移 |
| `validation.ts` | `ValidationResult`, `ValidationIssue` | 从 Phase 1 `validation_types.ts` 迁移 |
| `cognitive.ts` | `CognitiveResult`（认知操作返回的操作序列 + 元信息） | Phase 2 新增 |

### core/ — 核心引擎

| 文件 | 函数签名 | 职责 |
|------|---------|------|
| `validate.ts` | `validateOperation(graph: GraphData, op: GraphOperation): ValidationResult` | 单步 Operation 的 Schema + 规则校验。从 Phase 1 `operation_validator.ts` 迁移 |
| `execute.ts` | `executeOperation(graph: GraphData, op: GraphOperation): GraphData` | 给定合法 Operation，返回新 GraphData，不修改入参。从 Phase 1 `operation_executor.ts` 迁移。`executeDeleteNode` 内联折叠状态清理逻辑（方案 A） |
| `apply.ts` | `applyOperation(graph: GraphData, op: GraphOperation): { graph: GraphData, validation: ValidationResult }` | 统一入口：`validate()` → 不通过则直接返回 issues → 通过则 `execute()` |
| `normalize.ts` | `normalizeGraph(graph: GraphData): GraphData` | 加载数据时补 cognitiveState 等默认值，不修改已有字段。从 Phase 1 `graph_utils.ts` 迁入 |
| `id.ts` | `generateNodeId(), generateEdgeId(), generateGraphId(): string` | 统一 ID 生成，使用 `crypto.randomUUID()`。从 Phase 1 `id_runtime/generate.ts` 迁入 |

**`apply.ts` 的伪代码**：

```ts
export function applyOperation(
    graph: GraphData,
    operation: GraphOperation
): ApplyResult {
    const validation = validateOperation(graph, operation)

    if (!validation.valid) {
        return { graph, validation }
    }

    const newGraph = executeOperation(graph, operation)

    return { graph: newGraph, validation }
}
```

### compose/ — 组合层

`compose/` 是认知操作和布局操作的统一入口，回答"用户的意图怎么拆成多个步骤或位置计算"。只编排不执行——原子操作序列由 `core/` 执行，位置结果拼装为 `move_node` 后由 `core/` 执行。

**`compose/index.ts`**（Phase 3 扩展点）：

```ts
// Phase 2：纯 re-export
export { deconstruct } from './cognitive/deconstruct'
export { induce } from './cognitive/induce'
export { internalize } from './cognitive/internalize'
export { diverge } from './cognitive/diverge'
export { computePathLayout } from './arrangement/path'
export { computeAdjustedDistance, computeAdjustedAngle } from './arrangement/adjust'
// … 认知操作 …
```

#### compose/cognitive/ — 认知操作

认知操作的输入与原子操作不同——它接收用户的认知意图，返回"一个原子操作序列 + 元信息"。认知操作层依赖 `infrastructure/graph_registry` 和 `infrastructure/search`。

```ts
// 伪代码 — deconstruct
export function deconstruct(
    graph: GraphData,
    nodeId: NodeId
): CognitiveResult {
    // 1. 校验（认知语义前提，非图结构约束）：
    //    目标节点必须是 role=knowledge, kind=real, form=atomic
    // 2. 生成新图 ID
    // 3. 返回操作序列：
    //    [
    //      { type: 'update_node', node: { ...node, form: 'abstract', abstractionLevel: 1, childGraphId: newGraphId } },
    //      { type: 'add_graph', graph: { id: newGraphId, kind: 'subgraph', ... } }
    //    ]
}
```

| 文件 | 职责 | 跨图 | 依赖基础设施 |
|------|------|------|-------------|
| `deconstruct.ts` | 解构：原子实节点 → 抽象节点 + 空子图 | 否 | 无 |
| `induce.ts` | 归纳：多节点 → 抽象节点 + 子图 + 沟通节点/边 | 是（父图+子图） | graph_registry |
| `internalize.ts` | 内化：转移节点至常识层。若为抽象节点，递归转移子图子树。常识化条件由前端用户确认，引擎只做纯搬运 | 是（源图→commonLayer） | graph_registry |
| `diverge.ts` | 发散：跨图创建启发节点 + 有向虚边。三种 case + 镜像完成 | 是（源图↔目标图） | graph_registry, search |

> **Phase 2 核心技术挑战**：`induce` 的跨图事务一致性 — 父图删除原节点 + 子图创建沟通节点/边必须作为一个原子操作序列返回。如果其中任何一步的校验失败，整个序列都不会执行。

#### compose/arrangement/ — 布局计算

Arrangement 模式的核心——给定图数据和用户意图，计算节点目标位置。全部是纯函数，不涉及 DOM 或交互逻辑。

与 `compose/cognitive/` 的模式一致：布局函数接收 `GraphData` + 参数，返回 `{ nodeId, position }[]`，由调用方组装为 `move_node` 操作后通过 `apply()` 执行。所有布局函数依赖 `infrastructure/collision` 做碰撞检测。

```ts
// 伪代码
export function computePathLayout(
    graph: GraphData,
    pivotNodeId: NodeId,
    pathNodeIds: NodeId[],
    options?: { axisAngle?: number; spacing?: number }
): PositionAssignment[]

export function computeAdjustedDistance(
    sourcePosition: GraphPosition,
    targetPosition: GraphPosition,
    newDistance: number
): GraphPosition

export function computeAdjustedAngle(
    sourcePosition: GraphPosition,
    targetPosition: GraphPosition,
    newAngle: number
): GraphPosition

interface PositionAssignment {
    nodeId: NodeId
    position: GraphPosition
}
```

| 文件 | 职责 | 所属模式操作 | Phase |
|------|------|-------------|-------|
| `move.ts` | 单点移动（直接对应 `move_node` 原子操作） | Move | Phase 2 |
| `adjust.ts` | `adjustDistance` / `adjustAngle` — 给定两个节点当前位置和用户拖拽意图，计算动节点新位置 | Adjust | Phase 2 |
| `path.ts` | `computePathLayout` — 给定轴心节点 + 路径节点列表 + {axisAngle?, spacing?}，返回直线排列位置。计算后调用 collision 检测 | Path | Phase 2 |
| — | `computeOrbitLayout` — 环绕布局。见下文「Orbit 设计约束」 | Orbit | Phase 2b |
| — | `computeCloudLayout` — 约束布局。无唯一正确解，待用户专门设计 | Cloud | Phase 2b |

**Orbit 设计约束**：

Orbit 布局的不重叠条件封死在算法内部实现。算法接收中心节点和卫星列表（各自携带外接圆半径 $r_i$），由几何公式自行计算所需最小轨道半径：

```
弦距 = 2R · sin(π / N)
不重叠条件（相邻卫星圆心距 ≥ 相邻卫星半径和）：
    2R · sin(π / N) ≥ 2 · max(r₁, ..., rₙ)

最小轨道半径：R ≥ max(r₁, ..., rₙ) / sin(π / N)
```

| 变量 | 含义 |
|------|------|
| R | 纯轨道半径（不含中心节点自身半径） |
| N | 卫星节点数量 |
| rᵢ | 第 i 个卫星节点的外接圆半径（圆形 = 几何半径，正多边形 = 中心到顶点距离） |

**关键原则：Orbit 算法不反向约束节点大小。** 节点大小只由 degree 决定，Orbit 根据已有节点尺寸计算轨道。若 R 不够就扩大，不修改任何节点的 r。

总轨道半径 = 中心节点外接圆半径 + 纯轨道半径 R + 间距缓冲。

### 视觉映射公式

**节点大小**：面积正比于质量（物理隐喻 — 质量越大、面积越大）。

$$r = r_0 \cdot \sqrt{1 + \text{degree}}$$

| 参数 | 含义 |
|------|------|
| $r_0$ | 孤立节点（degree = 0）的基准半径 |
| $r_{\max}$ | 封顶半径，防止特大节点抢占视图 |

**边粗细**：粗细正比于二维引力（物理隐喻 — 二维空间中引力反比于距离）。

$$w \propto \frac{m_1 \cdot m_2}{d}$$

| 参数 | 含义 |
|------|------|
| $m = 1 + \text{degree}$ | 节点质量，孤立节点仍有基础质量 1 |
| $d$ | 两端节点的欧几里得距离 |
| $w_{\min}$ / $w_{\max}$ | 最细/最粗封顶 |

**引擎 vs UI 的边界**：
- 引擎负责"给定参数，节点该放在哪里"（纯数学）
- 引擎负责"移动后节点是否碰撞"（纯数学）
- UI 负责"用户如何选择参数"（拖拽、预览、确认流程）
- Arrangement 的统一操作流程（选择对象 → 确认 → 预览 → 写入 Data）由 `OperationController` 编排

**用户拖拽与平滑动画机制**：

拖拽式布局的平滑动画不需要 GraphEngine 参与，由 Cytoscape 渲染层免费提供：

```
用户拖拽节点     →  Cytoscape 渲染层（逐帧重绘，不碰 GraphData）
用户释放鼠标     →  use_graph_interaction.ts 捕获 dragfree 事件
                 →  语义事件 NodeDragEnded
                 →  operation_controller
                 →  graph_store.applyOperation({ type: 'move_node', ... })
                 →  GraphData.position 更新（唯一事实源）
                 →  watch 触发 → renderer.syncElements()
```

关键约束：

- 拖拽期间产生的中间位置不写回 GraphData——Cytoscape 只在渲染层做视觉偏移
- `move_node` 只写最终位置，不参与动画逻辑
- 动画是渲染层视觉过渡（Cytoscape 内部实现），不是数据层职责
- 当前 `use_cytoscape_renderer.ts` 中设 `autoungrabify: true`，Phase 2 进入 Arrangement 模式时改为 `cy.nodes().grabify()` 启用拖拽
- 知识群移动的批量 `move_node` 同理——逐一 `apply()` 后，渲染层 watch 统一触发多节点动画

**Knowledge Group（非 MVP）**：
- Knowledge Group 是节点的一种属性（`groupId`），表达空间组织关系
- Phase 2 在 `NodeData` 预留 `groupId?: string` 字段
- 知识群的创建/链接/解除/删除/成员操作、嵌套布局（Path+Path 等）均属于非 MVP

### validators/ — 规则约束

`validators/` 统一存放所有图结构校验逻辑，包含常量、原子规则和编排器。从 Phase 1 `rules/` + `validators/` 合并而来。

| 文件 | 内容 | 职责 |
|------|------|------|
| `rules.ts` | `DEFAULT_GRAPH_RULES` 常量 | 规则阈值（节点数量限制、标签长度限制等），从 Phase 1 `graph_rules.ts` 迁入 |
| `rule_checkers.ts` | 6 个原子校验函数 | 自环检测、重边检测、虚节点规则、有向实边成环等。纯函数，互相独立 |
| `operation_validator.ts` | `OperationValidator` 类 | 编排器——按操作类型组合原子规则。只校验当前操作，不修改 GraphData |
| `graph_validator.ts` | `validateGraph(graph)` | 全图体检，校验整体结构完整性 |
| `registry.ts` | `DEFAULT_RULES` 启用表 | 规则启用/禁用的配置入口（Phase 3 扩展点）。当前全部为 `true`，约 20 行 |

### infrastructure/ — 跨模块共享的底层能力

`infrastructure/` 被 `compose/cognitive/` 和 `compose/arrangement/` 共同依赖。全部是纯函数，不持有状态。从 Phase 1 扩展而来（吸收了 `persistence/`）。

**graph_registry.ts — 多图上下文管理**

认知操作（induce / internalize / diverge）涉及同时操作多张图。GraphRegistry 管理内存中的多图集合，提供统一的存取接口。

```ts
// 本质是 Map 包装，约 50 行
interface GraphRegistry {
    get(id: GraphId): GraphData | undefined
    set(id: GraphId, graph: GraphData): void
    has(id: GraphId): boolean
    delete(id: GraphId): void
    list(): GraphId[]
}

function createGraphRegistry(): GraphRegistry
```

**为什么是纯函数而非单例**：Registry 作为参数传入认知操作函数，测试时注入 mock registry，不引入全局状态。

**search.ts — 图内节点搜索引擎**

diverge 操作需要跨图查找节点。引擎提供简单的 label 匹配搜索。

```ts
// 约 30 行
function searchNodes(
    query: string,
    registry: GraphRegistry
): SearchResult[]

interface SearchResult {
    graphId: GraphId
    nodeId: NodeId
    node: NodeData
}
```

**collision.ts — 节点碰撞检测**

所有 Arrangement 操作（Path / 后续 Orbit / 后续 Cloud）的前置基础设施。节点位置移动后，必须保证无重叠。

```ts
// 约 60 行
// O(n²) 遍历，150 节点 ≈ 22500 次比较，毫秒级

function hasCollision(
    positions: PositionAssignment[],
    allNodes: NodeData[],
    nodeRadiusMap: Map<NodeId, number>
): boolean

function resolveCollisions(
    positions: PositionAssignment[],
    allNodes: NodeData[],
    nodeRadiusMap: Map<NodeId, number>
): PositionAssignment[]
```

**persistence.ts — 持久化接口**

引擎只定义接口，不实现。实现由前端（localStorage）和后端（Supabase）各自注入。

```ts
interface PersistenceAdapter {
    load(graphId: GraphId): GraphData | null
    save(graph: GraphData): void
    delete(graphId: GraphId): void
    list(): GraphId[]
}
```

---

# 五、接口层

## 层一：原子操作层

```ts
GraphEngine.apply(graph, operation) → { graph, validation }
```

每个 `GraphOperation` 是一个不可分割的最小修改单位。

| 原子操作 | 说明 |
|---------|------|
| `add_node` | 添加节点 |
| `add_edge` | 添加边 |
| `delete_node` | 删除节点（含递归子图删除，内联折叠状态清理） |
| `delete_edge` | 删除边 |
| `update_node` | 更新节点属性（含跨图引用穿透） |
| `update_edge` | 更新边属性 |
| `move_node` | 更新节点位置 |
| `collapse_dependency` | 依赖折叠（纯视觉，持久化折叠状态） |
| `expand_dependency` | 依赖展开（移除折叠状态） |

## 层二：认知操作层

```ts
GraphEngine.compose.cognitive.xxx(graph, registry, ...params) → CognitiveResult
```

认知操作是原子操作的**编排器**——接收用户认知意图，返回原子操作序列。依赖 `graph_registry` 管理多图上下文。

| 认知操作 | 认知语义 | 依赖基础设施 |
|----------|---------|-------------|
| `deconstruct` | 解构：将原子实节点提升为抽象节点，内部建空子图 | 无 |
| `induce` | 归纳：多个节点聚合为一个抽象节点，转移至子图。Phase 2 最大的技术挑战（跨图事务一致性） | graph_registry |
| `internalize` | 内化：转移实节点至常识层。若为抽象节点，递归转移子图子树。常识化条件由前端用户确认，引擎只做纯搬运 | graph_registry |
| `diverge` | 发散：跨图创建启发节点（只能用有向虚边连接）+ 有向虚边。三种 case + 镜像完成 | graph_registry, search |
| `explore` | 探索：开启单轮 AI 学习，产出知识块 | MVP 后实现 |
| `discover` | 发掘：对虚节点/无向虚边开启学习并替换 | MVP 后实现 |

## 层三：布局操作层

```ts
GraphEngine.compose.arrangement.xxx(graph, ...params) → PositionAssignment[]
```

布局操作层负责**位置计算**。返回位置赋值结果，由调用方组装为 `move_node` 操作后通过 `apply()` 执行。所有布局函数依赖 `collision` 基础设施。

| 布局操作 | 函数 | Phase |
|----------|------|-------|
| **Move**（单点） | 直接使用 `move_node` 原子操作 | Phase 2 |
| **Adjust Distance** | `computeAdjustedDistance(srcPos, tgtPos, newDistance)` → 动节点新位置 | Phase 2 |
| **Adjust Angle** | `computeAdjustedAngle(srcPos, tgtPos, newAngle)` → 动节点新位置 | Phase 2 |
| **Path** | `computePathLayout(graph, pivotId, pathIds, opts?)` → `PositionAssignment[]` | Phase 2 |
| **Orbit** | `computeOrbitLayout(graph, centerId, orbitingIds, opts?)` → `PositionAssignment[]` | Phase 2b（见 §四 > arrangement/ > Orbit 设计约束） |
| **Cloud** | `computeCloudLayout(graph, nodeIds, opts?)` → `PositionAssignment[]` | Phase 2b（待用户设计约束算法） |

**引擎 vs UI 的边界**：

```
引擎（纯函数）                     UI（OperationController）
─────────────                     ─────────────────────────
computePathLayout()                Path 模式交互流程：
computeAdjustedDistance()          1. 用户选择轴心节点
computeAdjustedAngle()             2. 用户选择路径节点
hasCollision()                     3. 用户拖拽确定旋转角
resolveCollisions()                4. 调引擎 → 获取 PositionAssignment[]
                                   5. 调引擎 → 碰撞检测
                                   6. Cytoscape 预览渲染
                                   7. 用户确认 → 组装 move_node → apply()
```

三层的分工：
- `compose/cognitive/` 回答"知识结构如何变化" → 产生 `add_node` / `delete_node` 等操作
- `compose/arrangement/` 回答"节点的位置在哪里" → 产生位置计算结果 → 组装为 `move_node` 操作
- `infrastructure/` 提供跨模块共享的底层纯函数（多图上下文、搜索、碰撞检测）
- `OperationController` 回答"用户如何触发和确认" → 编排交互流程，调用前三者

---

# 六、对外接口

GraphEngine 的对外接口。Phase 2 定义接口契约并实现引擎本体。消费者（前端、后端 Collabrator、CLI）按接口契约接入，Phase 2 不实现消费者。

## 接口全景

```
                    ┌──────────────────────────────┐
                    │      GraphEngine              │
                    │                               │
                    │  ① apply(graph, op)           │  ← 原子操作入口
                    │     → { graph, validation }    │
                    │                               │
                    │  ② compose.cognitive.xxx(     │  ← 认知操作入口
                    │       graph, registry, ...)    │
                    │     → CognitiveResult          │
                    │                               │
                    │  ③ compose.arrangement.xxx(   │  ← 布局操作入口
                    │       graph, ...params)        │
                    │     → PositionAssignment[]     │
                    │                               │
                    │  ④ PersistenceAdapter         │  ← 持久化接口（引擎定义，消费者实现）
                    │     { load, save, delete }    │
                    │                               │
                    │  ⑤ validate(graph, op)        │  ← 纯校验，不修改
                    │  ⑥ validateGraph(graph)      │  ← 全图体检
                    │                               │
                    │  ⑦ infrastructure             │  ← 底层基础设施
                    │     - GraphRegistry            │
                    │     - searchNodes()            │
                    │     - collision detection      │
                    └──────────────────────────────┘
                              ↑
            ┌─────────────────┼─────────────────┐
            │                 │                 │
      Frontend (Phase 2)  AI (Phase 3)    CLI / 脚本
      实现所有接口         消费接口        消费接口
```

## Phase 2 vs Phase 3 边界

| 内容 | Phase 2 | Phase 3 / 非 MVP |
|------|---------|-------------------|
| 引擎核心（types + core） | ✅ 实现 | — |
| 基础设施（graph_registry + search + collision + persistence） | ✅ 实现 | — |
| 认知操作（compose/cognitive/） | ✅ 实现 deconstruct / induce / internalize / diverge | explore / discover（依赖单轮学习） |
| 布局操作（compose/arrangement/） | ✅ move / adjust / path | Orbit（约束已确定，待实现）、Cloud（待用户设计）、Knowledge Group、嵌套布局 |
| 接口契约 | ✅ 定义 | — |
| 前端 Pinia 适配 | ✅ 实现 | — |
| 前端 localStorage 适配器 | ✅ 实现 | — |
| vitest 测试 | ✅ 实现 | — |
| `groupId` 字段 | ✅ 类型预留 | 操作实现 非 MVP |
| 后端 Supabase 适配器 | ❌ | ✅ Phase 3 |
| Collabrator（Assistant / Prompter / Analyst / Builder） | ❌ | ✅ Phase 3 |
| Graph Patch Plan → 引擎执行链路 | ❌ | ✅ Phase 3 |
| learningBlock / 单轮学习 | ❌ | MVP 后 |
| Knowledge Group / 嵌套布局 | ❌ | 非 MVP |
| Extension 注册/调度机制 | ❌（Phase 2 不做插件框架） | 待定 |

---

# 七、多图生命周期

GraphEngine 管理四种图类型的完整生命周期：

| 图类型 | 创建时机 | 销毁时机 | 特殊规则 |
|--------|---------|---------|---------|
| `main` | 用户新建项目 | 用户删除项目 | 无父图，是根 |
| `subgraph` | `deconstruct` / `induce` 时自动创建 | 父抽象节点删除时递归删除 | 通过沟通节点与父图保持连接 |
| `learningBlock` | `explore` 开启单轮学习时（MVP 后） | 学习结束后由用户决定组装后清理 | 游离态，不属于主图 |
| `commonLayer` | 首次 `internalize` 时自动创建 | 不销毁 | 仅节点，无边。常识化由前端用户确认 |

## 图间引用穿透

引用节点（`role === 'reference'`）修改时，引擎必须自动穿透到源节点。通过 `graph_registry` 查找源图并同步修改。

```ts
// execute.ts 中 update_node 的实现
function executeUpdateNode(
    graph: GraphData,
    op: UpdateNodeOperation,
    registry: GraphRegistry
): GraphData {
    const node = op.node

    if (node.role === 'reference') {
        const sourceGraph = registry.get(node.sourceGraphId)
        if (sourceGraph) {
            const updatedSourceNode = {
                ...node,
                id: node.sourceNodeId,
                role: 'knowledge' as const,
                graphId: node.sourceGraphId,
            }
            registry.set(sourceGraph.id, {
                ...sourceGraph,
                nodes: sourceGraph.nodes.map(n =>
                    n.id === node.sourceNodeId ? updatedSourceNode : n
                ),
            })
        }
    }

    return { ...graph, nodes: graph.nodes.map(n => n.id === node.id ? node : n) }
}
```

---

# 八、前端集成

## Pinia Store 退化为薄适配层

Phase 2 后的 `graph_store.ts`：

```ts
import { GraphEngine } from '@my-project/graph-engine'
import type { PersistenceAdapter } from '@my-project/graph-engine'

export const useGraphStore = defineStore('graph_store', {
    state: (): GraphStoreState => ({
        currentGraph: null,
        selectedNodeId: null,
        selectedEdgeId: null,
        undoStack: [],
    }),

    actions: {
        applyOperation(operation: GraphOperation): ValidationResult {
            if (!this.currentGraph) { /* 返回错误 */ }

            const { graph, validation } = GraphEngine.apply(
                this.currentGraph,
                operation
            )

            if (!validation.valid) {
                this.lastValidationResult = validation
                return validation
            }

            this.currentGraph = graph
            this.lastValidationResult = validation
            return validation
        },

        saveCurrentGraph(): void {
            if (!this.currentGraph) return
            persistenceAdapter.save(this.currentGraph)
        },
    },
})
```

## OperationController 不变

`operation_controller.ts` 仍然是 UI 交互编排层。区别在于：
- Phase 1：controller 构造 GraphOperation，调 `graphStore.applyOperation()`
- Phase 2：controller 构造 GraphOperation（或调 `GraphEngine.compose.cognitive.xxx()` 获取操作序列 / 调 `GraphEngine.compose.arrangement.xxx()` 获取位置计算结果），调 `graphStore.applyOperation()`

Controller 的交互逻辑（模式管理、右键退出、DraftNode 生命周期）**不迁移到引擎**——引擎只管数据和操作，不管用户怎么触发。

---

# 九、测试策略

## 测试原则

1. 引擎纯函数**必须**有单元测试 — correctness-critical 代码不允许 0 测试
2. 测试覆盖 `execute`（正确操作产生正确结果）和 `validate`（非法操作被拒绝）
3. 认知操作测试验证：给定合法输入 → 返回合法原子操作序列 → 逐个执行后图状态正确
4. 基础设施测试独立进行，确保底层可靠后再测上层

## 测试文件规划

```
packages/graph-engine/tests/
├── core/
│   ├── validate.test.ts          # 9 种 Operation 的校验路径
│   │   ├── add_node 正常/重复ID/超限
│   │   ├── add_edge 正常/自环/重边/虚节点规则/有向实边成环
│   │   ├── delete_node 正常/不存在
│   │   ├── delete_edge 正常/不存在
│   │   ├── update_node 正常/不存在/标签超限
│   │   ├── update_edge 正常/不存在/自环/重边/成环
│   │   ├── move_node 正常/不存在/非法坐标
│   │   ├── collapse_dependency 正常/不存在/无前置依赖/有无向边
│   │   └── expand_dependency 正常/不存在
│   │
│   └── execute.test.ts           # 9 种 Operation 的执行路径
│       ├── add_node → 节点数+1
│       ├── add_edge → 边数+1，两端节点度数+1
│       ├── delete_node → 节点+关联边删除，度数修复，折叠状态清理
│       ├── delete_edge → 边删除，度数修复
│       ├── update_node → 节点属性更新（含引用穿透）
│       ├── update_edge → 边属性更新
│       ├── move_node → 位置更新
│       ├── collapse_dependency → 折叠状态写入
│       └── expand_dependency → 折叠状态移除
│
├── infrastructure/
│   ├── graph_registry.test.ts    # Map CRUD、多图并存、不存在的 ID 返回 undefined
│   ├── search.test.ts            # 精确匹配、模糊匹配、跨图搜索、空结果
│   └── collision.test.ts         # 无碰撞、有碰撞、推开后无重叠、边界（单节点、零距离）
│
├── compose/
│   ├── cognitive/
│   │   ├── deconstruct.test.ts       # 原子节点 → 抽象节点 + 子图
│   │   ├── induce.test.ts            # 多节点 → 抽象节点 + 子图 + 沟通节点/边
│   │   └── internalize.test.ts       # 节点从主图 → 常识层。递归子图场景
│   └── arrangement/
│       └── path.test.ts              # 直线排列、碰撞检测触发、自定义间距/角度
│
└── validators/
    └── rule_checkers.test.ts     # 原子规则校验函数
        ├── 节点/边标签长度
        ├── 摘要长度
        ├── 自环检测
        ├── 重边检测
        ├── 虚节点连接规则
        └── 有向实边成环检测
```

## 运行命令

```bash
pnpm test                # 单次运行
pnpm test:watch          # watch 模式
pnpm test --coverage     # 覆盖率报告
```

---

# 十、Phase 2 任务分解

## 难度一览

| Step | 内容 | 难度 | 全新代码量 |
|------|------|------|-----------|
| 1 | 骨架搭建 | 🟢 极低 | ~10 行配置 |
| 2 | 类型层迁移 | 🟢 低 | 纯搬家 + 少量新增类型 |
| 3 | 核心引擎迁移 + 整合 | 🟢 低 | ~1200 行搬家 + `apply.ts` + `normalize.ts` + `id.ts` 约 40 行 |
| 4 | 规则约束层合并 | 🟢 低 | `rules/` 迁入 `validators/` + 新增 `registry.ts` 约 20 行 |
| 5 | **基础设施** | 🟡 中 | ~140 行（graph_registry + search + collision）+ persistence 迁入 |
| 6 | 认知操作层 | 🔴 高 | ~270 行，induce 是 Phase 2 核心难点 |
| 7 | 布局操作层 | 🟢 低 | ~45 行（move + adjust + path 三个函数总计） |
| 8 | 测试覆盖 | 🟡 中 | ~500 行 |
| 9 | 前端适配 | 🟢 低 | 改 import 路径 + 薄适配 |
| 10 | 公开 API 收口 | 🟢 低 | ~30 行 `index.ts` |

## 阶段划分

### Step 1：Engine 项目骨架搭建

| # | 任务 | 产出 |
|---|------|------|
| 1.1 | 配置 `pnpm-workspace.yaml`，声明 `packages/*` 为 workspace | pnpm workspace 就绪 |
| 1.2 | 创建 `packages/graph-engine/package.json`，包名 `@my-project/graph-engine` | 包元信息 |
| 1.3 | 创建 `packages/graph-engine/tsconfig.json`，配置项目引用 | tsc 编译就绪 |
| 1.4 | 安装 vitest | 测试框架就绪 |

### Step 2：类型层迁移（types/）

| # | 任务 | 说明 |
|---|------|------|
| 2.1 | 迁移 GraphData 类型 | `frontend/definitions/types/graph_types.ts` → `engine/src/types/graph_data.ts`。新增 `GraphRegistry` 类型、`SearchResult` 类型、`NodeRadiusMap` 类型、`NodeData.groupId?: string` 预留字段 |
| 2.2 | 迁移 Operation 类型 | `frontend/definitions/types/graph_operation_types.ts` → `engine/src/types/operations.ts` |
| 2.3 | 迁移 Validation 类型 | `frontend/definitions/types/validation_types.ts` → `engine/src/types/validation.ts` |
| 2.4 | 新增 CognitiveResult 类型 | `engine/src/types/cognitive.ts`（新增） |
| 2.5 | 更新前端 import 路径 | 所有 `@/definitions/types/xxx` → `@my-project/graph-engine` |

### Step 3：核心引擎迁移（core/）

| # | 任务 | 说明 |
|---|------|------|
| 3.1 | 迁移 `operation_executor.ts` → `engine/src/core/execute.ts` | 纯函数。`executeDeleteNode` 内联折叠状态清理（方案 A），不抽外部函数 |
| 3.2 | 迁移 `operation_validator.ts` → `engine/src/core/validate.ts` | 纯函数，零改动 |
| 3.3 | 迁移 `graph_utils.ts` 中的 `normalizeGraph` → `engine/src/core/normalize.ts` | 从 `utilities/` 迁入 |
| 3.4 | 新建 `engine/src/core/id.ts` | 统一 ID 生成，使用 `crypto.randomUUID()`。从 `id_runtime/generate.ts` 迁入 |
| 3.5 | 新建 `engine/src/core/apply.ts` | validate + execute 统一入口 |

### Step 4：规则约束层合并（validators/）

| # | 任务 | 说明 |
|---|------|------|
| 4.1 | 迁移 `graph_rules.ts` → `engine/src/validators/rules.ts` | 从 `rules/` 迁入，合并到 `validators/` |
| 4.2 | 迁移 `rule_checkers.ts` → `engine/src/validators/rule_checkers.ts` | 从旧 `validators/` 迁入，保持原样 |
| 4.3 | 迁移 `operation_validator.ts` → `engine/src/validators/` | 从旧 `validators/` 迁入 |
| 4.4 | 迁移 `graph_validator.ts` → `engine/src/validators/` | 从旧 `validators/` 迁入 |
| 4.5 | 新建 `engine/src/validators/registry.ts` | `DEFAULT_RULES` 启用表，约 20 行。Phase 3 扩展点 |

### Step 5：基础设施实现（infrastructure/）

**目标**：实现认知操作和布局操作共同依赖的三项底层能力 + 持久化接口迁入。全部是纯函数。

| # | 任务 | 说明 | 估算 |
|---|------|------|------|
| 5.1 | `graph_registry.ts` | `Map<GraphId, GraphData>` 包装，提供 `get / set / has / delete / list` | ~50 行 |
| 5.2 | `search.ts` | `searchNodes(query, registry)` — 遍历所有图的节点，label 子串匹配 | ~30 行 |
| 5.3 | `collision.ts` | `hasCollision` + `resolveCollisions` — O(n²) 遍历，对碰撞节点做最小位移推开 | ~60 行 |
| 5.4 | 迁入 `persistence.ts` | `PersistenceAdapter` 接口定义，从旧 `persistence/` 迁入 | 零新增行 |

### Step 6：认知操作层实现（compose/cognitive/）

**目标**：将 `operation_controller.ts` 中 Cognition 模式的 TODO stubs 下沉为引擎纯函数。依赖 Step 5 的基础设施。

| # | 任务 | 说明 |
|---|------|------|
| 6.1 | `deconstruct.ts` | 解构：原子实节点 → 抽象节点 + 空子图。无跨图依赖，最简认知操作 |
| 6.2 | `induce.ts` | 归纳：多节点 → 抽象节点 + 子图 + 沟通节点/边。**Phase 2 最大技术挑战**——涉及父图删除 + 子图创建 + 沟通节点/边创建的三组原子操作协调 |
| 6.3 | `internalize.ts` | 内化：转移节点至常识层。若为抽象节点，递归转移子图子树。常识化由前端用户确认，引擎只做纯搬运 |
| 6.4 | `diverge.ts` | 发散：跨图创建启发节点 + 有向虚边。依赖 `search` 做跨图节点查找 |
| 6.5 | 新建 `compose/index.ts` | 统一 re-export 所有认知操作和布局操作，约 5 行。Phase 3 扩展点 |

### Step 7：布局操作层实现（compose/arrangement/）

**目标**：将 Arrangement 模式下的位置计算逻辑实现为引擎纯函数。依赖 Step 5 的 `collision` 基础设施。

| # | 任务 | 说明 |
|---|------|------|
| 7.1 | `move.ts` | 单点移动——`move_node` 已作为原子操作存在，此文件提供批量移动编排 |
| 7.2 | `adjust.ts` | `computeAdjustedDistance` / `computeAdjustedAngle` — 纯三角函数，给定两点 + 参数，返回新坐标 |
| 7.3 | `path.ts` | `computePathLayout` — 沿轴方向等距分布。计算后调 `resolveCollisions` 保证不重叠 |

> **延后至 Phase 2b**：`orbit`（几何约束已确定，见 §四 > arrangement/ > Orbit 设计约束）、`cloud`（约束布局算法，待用户专门设计）。

### Step 8：测试覆盖

| # | 任务 |
|---|------|
| 8.1 | `core/validate.test.ts` — 9 种 Operation 的校验路径 |
| 8.2 | `core/execute.test.ts` — 9 种 Operation 的执行路径 |
| 8.3 | `infrastructure/graph_registry.test.ts` — Map CRUD、多图并存 |
| 8.4 | `infrastructure/search.test.ts` — 匹配、跨图搜索、空结果 |
| 8.5 | `infrastructure/collision.test.ts` — 无碰撞、有碰撞、推开后验证 |
| 8.6 | `validators/rule_checkers.test.ts` — 6 项原子规则 |
| 8.7 | `compose/cognitive/deconstruct.test.ts` |
| 8.8 | `compose/cognitive/induce.test.ts` — 跨图事务一致性测试（关键） |
| 8.9 | `compose/cognitive/internalize.test.ts` — 含递归子图场景 |
| 8.10 | `compose/arrangement/path.test.ts` — 直线排列 + 碰撞检测触发 |

### Step 9：前端适配

| # | 任务 |
|---|------|
| 9.1 | `graph_store.ts` 改为调 `GraphEngine.apply()` |
| 9.2 | `operation_controller.ts` 认知操作 stubs 改为调 `GraphEngine.compose.cognitive.xxx()` |
| 9.3 | `operation_controller.ts` Arrangement 模式改为调 `GraphEngine.compose.arrangement.xxx()` 获取位置计算结果 |
| 9.4 | `graph_persistence.ts` 实现 `PersistenceAdapter`（localStorage） |
| 9.5 | 确认所有 `import` 路径正确，编译通过 |

### Step 10：公开 API 收口

| # | 任务 | 说明 |
|---|------|------|
| 10.1 | 编写 `engine/src/index.ts` | 统一公开 API 导出，分类为 `apply` / `compose` / `validate` / `validateGraph` / `infrastructure` |
| 10.2 | 标注每个导出函数的消费者 | 在接口注释中标明"前端用户操作"或"AI Collabrator (Phase 3)"，帮助后续集成者理解 |
| 10.3 | 确保内部实现不导出 | `execute.ts` / `validate.ts` / `rule_checkers.ts` 及 infrastructure 内部函数不进入 `index.ts` |

---

# 十一、设计原则清单

| # | 原则 | 含义 |
|---|------|------|
| 1 | **纯函数，无状态** | 所有核心函数签名 `(GraphData, Operation) → GraphData`。不持有可变状态，无副作用。基础设施同样遵守此原则——GraphRegistry 作为参数传入而非全局单例 |
| 2 | **JSON 可序列化** | 全部入参与返回值可 JSON 序列化。保证 Worker/子进程执行、网络传输、确定性重放 |
| 3 | **存储无关** | 引擎定义 `PersistenceAdapter` 接口。前端注入 localStorage，后端注入 Supabase |
| 4 | **原子性** | 每个 Operation 要么完全成功，要么完全失败。不存在部分修改 |
| 5 | **权限外置** | 引擎不实现权限控制。权限通过 Collabrator → Human Confirmation 链路保证 |
| 6 | **认知操作 = 原子操作编排** | `compose/cognitive/` 层不引入新核心抽象，是 `apply()` 的组合调用 + 事务性保证 |
| 7 | **类型驱动** | 类型定义"概念"，函数定义"变换"。两者分离，各自独立演化 |
| 8 | **GraphData 是唯一事实源** | GraphEngine 的 output 是新的 GraphData，永远是事实 |
| 9 | **碰撞检测是 Arrangement 基础设施** | 所有涉及节点位置移动的操作，输出前必须通过碰撞检测。这是 Arrangement 质量的基本保证 |
| 10 | **基础设施先于上层模块** | `infrastructure/`（graph_registry / search / collision / persistence）是 compose 层和 core 层的共享依赖，先于它们实现和测试 |
| 11 | **无兜底目录** | 不设 `utilities/` 类杂项目录，每个文件有明确职责归属 |
| 12 | **跨文件意图注释** | 跨操作耦合的代码必须在代码块内注明"为什么这样做"，参见 CLAUDE.md §八 |
| 13 | **节点面积 ∝ 质量，边粗细 ∝ 引力** | 节点半径 $r = r_0 \cdot \sqrt{1 + \text{degree}}$（面积正比于质量），边粗细 $w \propto (m_1 \cdot m_2) / d$（二维引力反比于距离）。Orbit 不重叠条件封死在算法内部，不反向约束节点大小 |

---

# 十二、代码规范

与 Phase 1 规范一致（见 `CLAUDE.md`），额外补充：

| 规则 | 说明 |
|------|------|
| **引擎文件命名** | `snake_case.ts`（与现有规范一致） |
| **纯函数优先** | 禁止 `class` 持有状态。允许 `static class` 作为 namespace 组织函数，但不引入实例状态 |
| **禁止副作用** | 核心函数禁止访问 `localStorage` / `fetch` / `console.log`（测试除外） / 全局变量 |
| **导出最小化** | `index.ts` 只导出外部使用者需要的符号。内部实现函数和 infrastructure 细节不暴露 |
| **术语统一** | AI 实体统一使用 "Collabrator"，不使用 "Agent" |
| **依赖方向** | `core/` → `types/`；`validators/` → `types/` + `core/`；`compose/` → `infrastructure/` → `core/` → `types/`。上层依赖下层，同层不互引 |
