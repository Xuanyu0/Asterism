# 前端 → GraphEngine 导入关系检查

> Step 11 验收用。逐文件记录前端哪些文件依赖 `@my-project/graph-engine`，为什么，是否合理。

---

## 一、Runtime 核心层（3 文件）

### 1. `frontend/src/graph/graph_store.ts`

| 导入 | 分类 | 原因 |
|------|------|------|
| `type EdgeId, GraphData, GraphId, GraphRegistry, NodeId` | 类型 | state 字段类型注解 |
| `type GraphOperation` | 类型 | `applyOperation()` 参数类型 |
| `type ValidationResult` | 类型 | `lastValidationResult` 字段 + `applyOperation()` 返回值 |
| `createRegistry, registerGraph, unregisterGraph, getGraph, hasGraph` | infrastructure | 多图注册表 CRUD |
| `normalizeGraph` | infrastructure | `setCurrentGraph()` 补齐默认字段 |
| `applyOperation` | apply | `applyOperation()` 内部委托引擎执行 validate + execute |

**合理**。graph_store 是引擎在前端的直接消费者——`apply` + `infrastructure` 两大类都经它调用。

---

### 2. `frontend/src/ui/operation_controller.ts`

| 导入 | 分类 | 原因 |
|------|------|------|
| `type EdgeData, NodeData, NodeId, EdgeId, GraphPosition, GraphData, NodeRadiusMap` | 类型 | 函数参数/返回值类型注解 |
| `type EdgeKind, EdgeDirection` | 类型 | Add Edge 流程类型标签 |
| `type KnowledgeNodeKind` | 类型 | Add Node 流程类型标签 |
| `generateNodeId, generateEdgeId` | infrastructure | `confirmDraftNode()` / `handleAddEdgeNodeClick()` 生成新对象 ID |
| `applyBatch` | applyBatch | Arrangement/Cognition 确认后批量提交 |
| `DEFAULT_LAYOUT_RULES` | infrastructure | `computeNodeRadiusOverrides()` 计算节点半径 |
| `moveNode` | compose | `handleMoveNode()` — Arrangement 模式 |
| `deconstruct, induce, internalize` | compose | Cognition 模式 stub 替换 |

**合理**。operation_controller 是编排层——调引擎 compose 产出 operations，再经 `applyBatch` 提交。

---

### 3. `frontend/src/ui/ui_store.ts`

| 导入 | 分类 | 原因 |
|------|------|------|
| `type NodeData, EdgeData, NodeId, EdgeId` | 类型 | 浮空窗数据 `FloatingWindowData` 联合类型 |
| `type ValidationResult` | 类型 | `lastOperationValidation` 状态字段 |
| `type KnowledgeNodeKind, EdgeKind, EdgeDirection` | 类型 | `pendingAddNode.kind` / `pendingAddEdge.kind` / `.direction` 字段 |

**合理**。ui_store 持有 UI 运行时快照，其中 pending 添加状态和浮空窗数据需要引用引擎的枚举/类型标签。

---

## 二、Draft 层（1 文件）

### 4. `frontend/src/ui/draft_store.ts`

| 导入 | 分类 | 原因 |
|------|------|------|
| `type KnowledgeNodeKind` | 类型 | `DraftNode` 创建时标记节点类型 |

**合理**。DraftNode 是"尚未提交的 NodeData 雏形"，天然需要知道目标节点类型。

---

## 三、类型定义层（3 文件）

### 5. `frontend/src/definitions/types/draft_types.ts`

| 导入 | 分类 | 原因 |
|------|------|------|
| `type KnowledgeNodeKind` | 类型 | `DraftNode.kind` 字段 |
| `type EdgeKind, EdgeDirection` | 类型 | `DraftEdge.kind` / `.direction` 字段 |
| `type NodeId` | 类型 | `DraftEdge.sourceNodeId` / `.targetNodeId` 字段 |

**合理**。Draft 类型是 GraphData 类型的临时态投影，必然引用引擎枚举。

---

### 6. `frontend/src/definitions/types/ui_types.ts`

| 导入 | 分类 | 原因 |
|------|------|------|
| `type KnowledgeNodeKind` | 类型 | `PendingAddNodeState.kind` 字段 |
| `type EdgeKind, EdgeDirection` | 类型 | `PendingAddEdgeState.kind` / `.direction` 字段 |
| `type NodeId` | 类型 | `PendingAddEdgeState.sourceNodeId` 字段 |

**合理**。UI 待定状态需要与引擎类型对齐——用户选的 node kind 存入 pending state，确认后传给 `add_node` operation。

---

### 7. ~~`frontend/src/definitions/types/graph_operation_types.ts`~~ ✅ 已核查 — 已删除

**原内容**：前端自有的 14 个 Operation interface + `GraphOperation` 联合类型（含 `CognitionOperation`）。

**核查结论**：

| 对比项 | 前端原有 | 引擎对应 | 结论 |
|--------|---------|---------|------|
| `AddNodeOperation` 等 9 种原子操作 | `graph_operation_types.ts` | `atomic_operations.ts` | 逐字段完全相同 — 100% 重复 |
| `ExploreOperation` 等 5 种认知操作 | `graph_operation_types.ts` | `cognitive_operations.ts` | 逐字段完全相同 — 100% 重复 |
| `AddGraphOperation` / `DeleteGraphOperation` | ❌ 前端缺失 | `atomic_operations.ts` | 引擎有，前端没有 |
| `CognitiveResult` | ❌ 前端缺失 | `cognitive_operations.ts` | 引擎有，前端没有 |
| `GraphOperation` 联合类型 | 含认知操作（15 种） | 不含认知操作（11 种 `AtomicOperation`） | **不兼容**——引擎 `GraphOperation = AtomicOperation`，前端含 `CognitionOperation` |

**消费者**：Step 11 之后 **0 个文件** import 本文件。所有消费者已切到 `@my-project/graph-engine` 的 `GraphOperation` / `AtomicOperation` / `CognitiveOperation`。

**处理**：已删除（2026-06-19）。

---

## 四、渲染层（3 文件）

### 8. `frontend/src/render/cytoscape/graph_element_mapper.ts`

| 导入 | 分类 | 原因 |
|------|------|------|
| `type EdgeData, EdgeDirection, EdgeId, EdgeKind, GraphData, NodeData, NodeId, NodePosition, NodeRole, KnowledgeNodeKind, ReferenceNodeKind, RealNodeForm` | 类型 | `mapGraphDataToCyElements()` 遍历 GraphData → CyElements 投影时做类型判别 |

**合理**。投影层需要读取 GraphData 全部字段做判别（node role/kind/form → CSS class）。

---

### 9. `frontend/src/render/cytoscape/use_graph_interaction.ts`

| 导入 | 分类 | 原因 |
|------|------|------|
| `type NodeId, EdgeId` | 类型 | 语义事件回调参数类型 `onNodeClicked(nodeId: NodeId)` |

**合理**。Cytoscape 事件翻译层只传递 ID 标签，不需要其他引擎类型。

---

### 10. `frontend/src/render/cytoscape/cytoscape_style.ts`

| 导入 | 分类 | 原因 |
|------|------|------|
| `DEFAULT_NODE_RULES` | infrastructure | 节点半径常量，CSS `width` / `height` 公式用到 |

**合理**。渲染层需要引擎默认布局规则计算节点视觉尺寸。

---

## 五、组件层（1 文件）

### 11. `frontend/src/components/graph/NodeWindow.vue`

| 导入 | 分类 | 原因 |
|------|------|------|
| `type NodeData, EdgeData` | 类型 | 浮空窗 `props.data` 的类型标注 |

**合理**。组件接收 GraphData 中的节点/边对象做展示和编辑。

---

## 六、持久化层（1 文件）

### 12. `frontend/src/graph/utilities/graph_persistence.ts`

| 导入 | 分类 | 原因 |
|------|------|------|
| `type GraphData, GraphId` | 类型 | `saveGraph()` / `loadGraph()` 参数和返回值类型 |
| `type PersistenceAdapter` | 类型 | `localStorageAdapter` 实现引擎 SPI 接口契约 |

**合理**。持久化层是引擎 `PersistenceAdapter` 接口的消费者。

---

## 七、Mock / 测试层（4 文件）

### 13. `frontend/src/mock/test_case_factory.ts`

| 导入 | 分类 | 原因 |
|------|------|------|
| `type EdgeData, EdgeDirection, EdgeId, EdgeKind, GraphData, GraphId, GraphKind, NodeData, NodeId, NodePosition, NodeRole, RealNodeForm, ReferenceNodeKind` | 类型 | 工厂函数构造合法 GraphData |
| `validateGraph` | infrastructure | `assembleGraph()` 内部校验产出合法性 |
| `normalizeGraph` | infrastructure | `assembleGraph()` 内部补齐默认值 |

**合理**。测试工厂需要构造合法的引擎类型实例。

---

### 14. `frontend/src/mock/golden_graph.ts`

| 导入 | 分类 | 原因 |
|------|------|------|
| `type GraphData, NodeData, EdgeData` | 类型 | 硬编码金牌测试数据 |

**合理**。

---

### 15. `frontend/src/mock/mockGraph.ts`

| 导入 | 分类 | 原因 |
|------|------|------|
| `type GraphData` | 类型 | 硬编码 `mockGraph` 数据 |

**合理**。

---

### 16. `frontend/src/dev/test_evaluation_machine.ts`

| 导入 | 分类 | 原因 |
|------|------|------|
| `type EdgeData, EdgeId, GraphData, GraphId, NodeData, NodeId` | 类型 | 测试内构造操作参数 |
| `type GraphOperation` | 类型 | 操作类型注解 |
| `type ValidationResult` | 类型 | 返回值类型注解 |
| `validateGraph` | infrastructure | Suite 1 — 测试数据完整性校验 |
| `applyOperation` | apply | Suite 2/3 — 操作执行器 + 折叠/展开测试 |
| `type GraphRegistry` | 类型 | （导入但仅在注释引用？待确认实际使用位置） |

**合理**。验收测试机直接测试引擎 API 正确性。

---

## 八、已删除

### 17. ~~`frontend/src/definitions/types/graph_types.ts`~~ ✅ 已删除

**原内容**：前端自有 GraphData 全部类型定义（GraphData / NodeData / EdgeData / NodeRole / NodeBase / KnowledgeNodeData / ReferenceNodeData 等，~170 行）。

**核查结论**：与引擎 `packages/graph-engine/src/types/graph_data.ts` 逐行同源。引擎已导出全部同名字段类型。Step 11 后 **0 个消费者**。

**处理**：已删除（2026-06-19）。

---

### 18. ~~`frontend/src/definitions/types/validation_types.ts`~~ ✅ 已删除

**原内容**：前端自有校验结果类型（ValidationLevel / ValidationTargetType / ValidationIssue / ValidationResult，~32 行）。

**核查结论**：与引擎 `packages/graph-engine/src/types/validation.ts` 逐字段一致。引擎已导出。Step 11 后 **0 个消费者**。

**处理**：已删除（2026-06-19）。

---

## 九、保留的前端专属类型

| 文件 | 保留原因 |
|------|---------|
| `definitions/types/draft_types.ts` | DraftNode / DraftEdge — 前端独有的"尚未提交"草稿类型，引擎无对应 |
| `definitions/types/ui_types.ts` | InteractionMode / OperationTool / PendingAddNodeState 等 — 纯 UI 状态标签，引擎无对应 |

---

## 汇总

| 层 | 文件数 | 导入分类 |
|----|--------|---------|
| Runtime 核心 | 3 | apply + applyBatch + compose + infrastructure + 类型 |
| Draft | 1 | 类型（KnowledgeNodeKind） |
| 类型定义 | 2（前端专属） | draft_types / ui_types — 引擎无对应，保留 |
| 渲染 | 3 | 类型 + infrastructure（DEFAULT_NODE_RULES） |
| 组件 | 1 | 类型 |
| 持久化 | 1 | 类型 + PersistenceAdapter |
| Mock/测试 | 3 | 类型 + infrastructure（validateGraph / normalizeGraph / apply） |

**总数**：14 个文件与 `@my-project/graph-engine` 产生 import 关系。

**已删除**（3 个文件，100% 被引擎覆盖，零消费者）：
- `graph_types.ts` — ~170 行，GraphData / NodeData / EdgeData 全部类型
- `graph_operation_types.ts` — 14 个 interface + 3 个联合类型
- `validation_types.ts` — ~32 行，ValidationLevel / ValidationIssue / ValidationResult
