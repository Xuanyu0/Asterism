# GraphRegistry — 多图注册表

## 定位

GraphRegistry 是**已持久化 GraphData 的运行时聚合索引**，由 `graph_store` 持有。所有认知操作（deconstruct / induce / internalize / diverge）涉及跨图创建和查询时，必须经过 Registry。

Registry 不是独立的事实源——每张 `GraphData` 已经持久化在 localStorage 中。Registry 是 localStorage 中全部已保存图的**运行时投影**，可随时从持久化重建。

**单例**。整个应用只有一个 Registry 实例。`graph_store` 初始化时从 localStorage 扫描全部已保存图重建，不独立暴露给前端组件。

## 当前状态

`graph_store` 尚未持有 Registry。当前 `graph_store` 只管理单图（`currentGraph: GraphData | null`）。Registry 的集成是 Step 8（认知操作层）的前置条件。

## 类型定义

```ts
// 定义于 packages/graph-engine/src/types/graph_data.ts:174
export type GraphRegistry = Map<GraphId, GraphData>
```

本质是 `Map<GraphId, GraphData>` 的类型别名。不引入 class——保持简单、可序列化、可直接传给所有 infrastructure 和 compose 函数。

## 持有关系

```
graph_store（Pinia）
    ├── currentGraph: GraphData | null     ← 当前浏览/编辑的单图
    ├── registry: GraphRegistry           ← 多图注册表（新增字段）
    │       ├── MapEntry: 'main-graph-1' → <根图谱>
    │       ├── MapEntry: 'sub-2'        → <子图 2>
    │       └── MapEntry: 'common-1'     → <常识层>
    └── ...
```

**为什么由 `graph_store` 持有**：

1. **SSOT 延续** — `graph_store` 已经是 GraphData 的唯一事实源。Registry 是"哪些图存在"的索引，放在同一个 store 里保持一致。
2. **生命周期与 GraphData 一致** — 每张 `GraphData` 已持久化在 localStorage 中，Registry 是它们的运行时投影。应用启动时从 localStorage 全量扫描重建，不需要独立的持久化。
3. **事务可见性** — 认知操作（induce、deconstruct）在 `operation_controller` 中执行时，需要同时看到当前图和 Registry 中的其他图。将两者放在同一个 store 里避免了跨 store 的事务协调。

## API（已实现）

所有 API 已实现在 `packages/graph-engine/src/infrastructure/graph_registry.ts`，纯函数，不依赖 Pinia。

| 函数 | 签名 | 说明 |
|------|------|------|
| `createRegistry` | `() => GraphRegistry` | 创建空 `Map` |
| `registerGraph` | `(registry, graph) => void` | 注册新图。ID 冲突时覆盖（调用方负责唯一性校验） |
| `getGraph` | `(registry, graphId) => GraphData \| undefined` | 按 ID 查找。不存在返回 `undefined` |
| `hasGraph` | `(registry, graphId) => boolean` | 判断某图是否已注册 |
| `unregisterGraph` | `(registry, graphId) => boolean` | 删除注册记录。返回 `true` 表示删除成功 |
| `listGraphs` | `(registry) => GraphData[]` | 列出所有已注册图 |

**注意**：`registerGraph` 不校验 ID 冲突。调用方（`graph_store`）负责在注册前检查唯一性。

## graph_store 集成

### 新增 state 字段

```ts
// GraphStoreState 新增
registry: GraphRegistry    // 多图注册表，由持久化 GraphData 重建的运行时索引
```

### 新增 actions

| action | 说明 | 调用方 |
|--------|------|--------|
| `initRegistry()` | store 初始化时调用 `createRegistry()`，并将当前已加载的图注册进去 | `setCurrentGraph` 或组件 `onMounted` |
| `registerGraph(graph)` | 将新图注册到 Registry。调用 `registerGraph(registry, graph)` | compose 层通过 `operation_controller` 间接调用 |
| `getGraphById(graphId)` | 按 ID 查找图。代理 `getGraph(registry, graphId)` | 子图导航、跨图搜索 |
| `loadGraphToCurrent(graphId)` | **现有函数增强**——加载后自动 `registerGraph` | 子图导航 |

### 初始化时机

```
应用启动（graph_store 首次创建）
    ↓
initRegistry()
    ↓
扫描 localStorage 中所有已保存的图谱 key
    ↓
逐张 loadGraph → registerGraph(registry, loadedGraph)
    ↓
Registry = localStorage 中全部 GraphData 的运行时投影
```

应用运行期间，`saveGraph` 和认知操作创建新子图时同步更新 Registry。Registry 自身不持久化——始终可从 localStorage 全量重建。

### 持久化

Registry **自身不持久化**。原因：

- Registry = `Map<GraphId, GraphData>`，其中每个 `GraphData` 已通过 `saveGraph` 独立持久化在 localStorage 中。
- Registry 是冗余结构——其全部内容可从 localStorage 全量扫描重建。
- 持久化 Registry 本身意味着同一份 GraphData 存了两遍，引入一致性问题。

**运行时同步规则**：

| 事件 | Registry 行为 |
|------|-------------|
| 应用启动 | 扫描 localStorage → 逐张 `loadGraph` → `registerGraph` |
| 认知操作创建新子图 | `registerGraph(registry, newChildGraph)` + `saveGraph(newChildGraph)` |
| 用户切换当前图（`loadGraphToCurrent`） | 若不在 Registry 中则 `registerGraph` |
| 删除图（`deleteGraph`） | `unregisterGraph(registry, graphId)` |
| 修改当前图（`saveCurrentGraph`） | Registry 中对应 entry 已持有引用 → `saveGraph` 落盘后 Registry 自动反映最新状态 |

## 调用关系

```
operation_controller
    │
    ├─ deconstruct(nodeId)
    │       ↓
    │   deconstruct({ nodeId, parentGraph, registry })
    │       ↓
    │   registry.registerGraph(newSubgraph)    ← compose 层通过 graph_store 注册
    │       ↓
    │   applyBatch(parentGraph, ops)
    │
    ├─ induce(nodeIds)
    │       ↓
    │   induce({ nodeIds, parentGraph, registry })
    │       ↓
    │   跨图 applyBatch（父图 + 子图）
    │
    ├─ diverge(params)
    │       ↓
    │   diverge({ ..., registry })
    │       ↓
    │   searchNodes(query, registry)           ← 跨图搜索依赖 registry
    │
    └─ internalize(nodeIds)
            ↓
        internalize({ nodeIds, commonLayer, registry })
```

**关键规则**：compose 层函数不持有 `graph_store` 引用——它们只接收 `registry: GraphRegistry` 作为参数。`graph_store` 通过 `operation_controller` 传入 registry。这保持了 engine ↔ store 的边界。

## 与 localStorage 持久化的关系

Registry 是 localStorage 的运行时投影，不是独立的事实源：

```
localStorage（持久化事实源）              Registry（运行时索引）
─────────────────────────               ────────────────────
key: 'graph:main-1' → GraphData  ←→  MapEntry: 'main-1' → <同引用>
key: 'graph:sub-2'  → GraphData  ←→  MapEntry: 'sub-2'  → <同引用>
key: 'graph:common-1'→ GraphData  ←→  MapEntry: 'common-1'→ <同引用>
```

- **加载**：`loadGraph` 从 localStorage 取出 GraphData → `registerGraph` 写入 Registry
- **创建**：`saveGraph(newGraph)` 写入 localStorage → 同时 `registerGraph` 写入 Registry
- **删除**：`deleteGraph(graphId)` 删除 localStorage → 同时 `unregisterGraph` 从 Registry 移除
- **重建**：应用启动时扫描 localStorage 全量重建 Registry

Registry 和 localStorage 中的 GraphData 是**同一份对象引用**（JavaScript 层面），不存在两份拷贝。

## 事务语义

Registry 不参与事务。`registerGraph` 和 `unregisterGraph` 是即时操作，没有 dryRun。跨图事务的原子性由 compose 层通过 dryRun + validate-all-first 策略保证，Registry 的注册操作在事务执行阶段才发生。
