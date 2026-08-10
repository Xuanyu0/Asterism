# Step 1：mapper 清理 + 目录迁移 + 样式补充

> 来源：[050-步骤-渲染交互层重构.md](../../../P2开发文档/phase2b/050-步骤-渲染交互层重构.md) §Step 1

---

## 设计文档依据

- `CLAUDE.md` §架构分层：Cytoscape 只是 Renderer，GraphData 是唯一事实源
- `CLAUDE.md` §两个 Pinia Store：graphStore 持有 GraphData，不持有 Cy 状态
- [05-步骤-共依赖.md](../../../P2开发文档/phase2b/05-步骤-共依赖.md) §3.0-5 已确认决策：
    - Cy 角色："交互层 + 渲染层"
    - 目录重命名：`render/` → `cytoscape/`
    - 术语："投影" → "映射"/"拷贝"
    - Cy `data` 最小字段：仅 `id` / `label`
    - 严格去耦合：`cytoscape/` 外禁止 import cytoscape

---

## 当前状态

`frontend/src/render/` 目录下 4 个文件：

- `use_cytoscape_renderer.ts`（244 行）
- `graph_interaction.ts`（当前 `use_graph_interaction.ts`，101 行）
- `graph_element_mapper.ts`（263 行）
- `cytoscape_style.ts`（154 行）

核心问题：

- `CyNodeData` 携带 `role`/`kind`/`form`/`degree`/`abstractionLevel` — 这些字段在 `getNodeClasses` 内消费完毕后对 Cy 无意义
- `CyEdgeData` 中 `kind`/`direction` 同理
- `getFoldedNodeIds` / `getFoldedParentNodeIds` 各被调用一次且 export，违反项目规范（≥2 次调用才拆）
- `use_graph_interaction.ts` 无内部状态，`use` 前缀名不副实
- 目录名 `render/` 不诚实——实际包含交互翻译，且应表达"Cy 隔离层"的架构意图

---

## 涉及文件

| 文件                                                                       | 改动   | 职责                                                                                   |
| -------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------- |
| `frontend/src/render/` → `frontend/src/cytoscape/`                         | 重命名 | 目录迁移（4 个文件）                                                                   |
| `frontend/src/cytoscape/graph_element_mapper.ts`                           | 修改   | 精简 CyNodeData/CyEdgeData；内联 getFoldedNodeIds/getFoldedParentNodeIds；更新注释术语 |
| `frontend/src/cytoscape/cytoscape_style.ts`                                | 修改   | 新增 `move-picked` class                                                               |
| `frontend/src/cytoscape/use_graph_interaction.ts` → `graph_interaction.ts` | 重构   | 去 `use` 前缀，改为普通函数，加 cleanup 返回                                           |
| 所有 import `@/render/` 的文件                                             | 修改   | 路径更新为 `@/cytoscape/`                                                              |
| 所有 import `use_graph_interaction` 的文件                                 | 修改   | 改为 `import { bindCyEvents }`                                                         |

**不涉及的文件**（Step 2 的工作）：

- `use_cytoscape_renderer.ts`
- `feature-tools/toolbar/move_node.ts`
- `views/Graph.vue`
- `mediator.ts`
- `graphStore` / `uiStore`

---

## 核心任务

### 1. 目录重命名

将 `frontend/src/render/` 目录重命名为 `frontend/src/cytoscape/`。使用 `git mv` 保留 Git 历史。更新项目内所有 `from '@/render/'` import 为 `from '@/cytoscape/'`。

### 2. CyNodeData / CyEdgeData 精简

`CyNodeData` 仅保留 Cy 渲染所需的字段：

```ts
export interface CyNodeData {
    id: NodeId
    label: string
}
```

移除以下字段（它们在 `getNodeClasses` 中消费完后不再需要进入 Cy `data`）：

- `role`、`kind`、`form`、`referenceKind`（由 getNodeClasses 消费转 class）
- `degree`、`abstractionLevel`（Cy 不渲染这些）

`CyEdgeData` 仅保留：

```ts
export interface CyEdgeData {
    id: EdgeId
    source: NodeId
    target: NodeId
    label?: string
}
```

移除 `kind`、`direction`（由 getEdgeClasses 消费转 class）。

相应地更新 `mapNodeToCyElement` 和 `mapEdgeToCyElement` 中的 `data` 构造逻辑——只取上述字段，不再从 NodeData/EdgeData 拷贝已移除的字段。

### 3. 内联 getFoldedNodeIds / getFoldedParentNodeIds

将两个函数体直接写入 `mapGraphDataToCyElements` 内部，删除 export。它们各自仅被调用一次（行 251/252），无需独立函数。

### 4. 注释术语更新

在 `graph_element_mapper.ts` 中：

- 文件头注释："投影" → "映射" / "拷贝"
- `CyNodeData` 注释：说明"仅包含 Cy 渲染所需的最小字段"
- `CyEdgeData` 注释：同上
- `mapGraphDataToCyElements` 注释："投影为" → "映射为"

### 5. 新增 move-picked class

在 `cytoscape_style.ts` 的节点样式区添加（放在 `.move-collision` 附近）：

```ts
{
    selector: '.move-picked',
    style: {
        'opacity': 0.4,
    },
},
```

这替代 `move_node.ts` 中 `.style('opacity', 0.4)` 的硬编码值。Step 2 执行时 move_node 改为 `addNodeClass('move-picked', 'move')`。

### 6. use_graph_interaction 重构

将 `use_graph_interaction.ts` 重命名文件为 `graph_interaction.ts`。

将 `useGraphInteraction(cy, handlers)` 改为普通函数 `bindCyEvents(cy, handlers)`，不再以 `use` 开头。函数返回 `{ destroy(): void }` 用于解绑。

函数体内部逻辑不变——仍通过 `cy.on()` 绑定 tap/cxttap/dblclick 事件并翻译为语义回调。

---

## 变更边界

- 禁止修改 `use_cytoscape_renderer.ts`（Step 2 工作）
- 禁止修改 `feature-tools/` 下任何文件
- 禁止修改 `views/Graph.vue`
- 禁止修改 `graphStore`、`uiStore`、`draft_store`
- 禁止修改 `mediator.ts`
- 禁止修改 `cytoscape_style.ts` 中已有样式规则的视觉参数
- 禁止在 `cytoscape/` 外新增任何 `import cytoscape` 或 `import type from 'cytoscape'`
- 禁止修改 `mapGraphDataToCyElements` 的行为逻辑（仅改内部数据结构和内联辅助函数）

---

## 验收标准

- [ ] `frontend/src/cytoscape/` 目录存在，含 4 个文件
- [ ] 项目内无残留 `from '@/render/'` 的 import
- [ ] `CyNodeData` 仅含 `id: NodeId` / `label: string`
- [ ] `CyEdgeData` 仅含 `id: EdgeId` / `source: NodeId` / `target: NodeId` / `label?: string`
- [ ] `getFoldedNodeIds` / `getFoldedParentNodeIds` 不再 export
- [ ] `cytoscape_style.ts` 含 `.move-picked` 选择器规则（opacity: 0.4）
- [ ] `graph_interaction.ts` 文件名不含 `use` 前缀
- [ ] `bindCyEvents` 为普通函数（非 `export function use...`），返回 `{ destroy() }`
- [ ] `pnpm --filter frontend test` 全部通过
- [ ] 前端 `pnpm --filter frontend dev` 无 TS 编译错误

---

## task 返回要求

完成后返回：

1. 修改了哪些文件（列表）
2. 每个文件改了什么（一句话）
3. 测试是否通过
4. 任何执行中遇到的问题或不确定项
