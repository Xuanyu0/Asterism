# 051-4 — add-edge 工具改造（clone 方案）：提示词

> 拓展自：[051-预览层搭建.md](../../步骤/051-预览层搭建.md) §5.4
>
> 前置依赖：051-2（hover 事件链路）+ 051-3（preview_engine）

## 当前状态

`add_edge.ts` 当前为两步点击流程：第一次点击记录 sourceNodeId，第二次点击创建边并提交。没有 hover 预览，没有碰撞检测。

本步骤在两步点击流程中插入 hover 预览：hover 到目标节点时整图渲染预览图（节点变大可见），有碰撞则 source/target 红色高亮，点击被拒绝。

## 核心规则（必须先理解）

**`syncFromGraphData` 会清掉"调用时已存在"的 class**（cy.json 用 mapper 产出整体替换 + classOwners.clear()）。因此：

> **handler 的所有 transient class 必须在 `syncFromGraphData` 之后施加，才能存活。**

handler 是其所有 transient class 的唯一 owner——通过 `useRenderer()` 的 `addNodeClass` / `removeNodeClass` / `clearAllPreviews`（owner 统一 `'add-edge'`）管理。

## 具体子任务

### 1. 移除 Graph.vue 的 edge-source-target bindHighlight

`Graph.vue` 中当前有一段：

```ts
renderer.bindHighlight(() => {
  const handler = mediator.activeHandler.value
  if (!handler) return null
  const id = handler.id as string
  if (!id.includes('directed') && !id.includes('undirected')) return null
  return handler.highlightNode ?? null
}, 'edge-source-target')
```

**删除这段绑定**。source 高亮所有权移交 add_edge handler 管理（下方子任务）。`delete-target` 的 bindHighlight 保留不动。

### 2. 实现 onNodeHover

当 `sourceNodeId` 已设置、hover 到新节点时：

1. 守卫：`sourceNodeId.value === null` → 跳过；`nodeId === sourceNodeId.value` → 跳过（不把自己当目标）
2. 调 `previewAddEdge(graph, sourceNodeId, nodeId, kind, direction)` 得到 `{ previewGraph, valid, sourceCollides, targetCollides }`
3. 若 `valid === false` → 跳过（校验失败，不渲染预览）
4. `syncFromGraphData(previewGraph)` ← **整图切换到预览图**
5. **sync 之后**依次施加：
   - `addNodeClass(sourceId, 'edge-source-target', 'add-edge')` — 重施 source 高亮
   - `sourceCollides` → `addNodeClass(sourceId, 'preview-collision', 'add-edge')`
   - `targetCollides` → `addNodeClass(targetId, 'preview-collision', 'add-edge')`
6. 更新 `hoverTargetId.value = nodeId`

### 3. 实现 onNodeHoverOut

1. `clearAllPreviews('add-edge')` — 清除碰撞 class
2. `syncFromGraphData(graphStore.graphView)` — 切回真实图
3. 若 `sourceNodeId.value !== null` → `addNodeClass(sourceNodeId.value, 'edge-source-target', 'add-edge')` — 重施 source 高亮（source 仍选中）
4. `hoverTargetId.value = null`

### 4. 修改 onNodeClick 的第二次点击分支

1. 若 `nodeId === sourceNodeId` → 忽略（不能自己连自己）
2. 调 `previewAddEdge` 检查碰撞
3. 若 `valid === false` 或 `sourceCollides || targetCollides` → 忽略点击，不创建边（sourceNodeId 保持可重试）
4. 无碰撞 → 走现有 `commitBatchToGraph` 流程创建边
5. 创建成功后：`clearAllPreviews('add-edge')` + `hoverTargetId.value = null` + `sourceNodeId.value = null`
   （`watch(graphView)` 会自动触发 `syncFromGraphData`，无需手动 sync）

### 5. deactivate 清理

1. `clearAllPreviews('add-edge')`
2. 若当前画布是预览态 → `syncFromGraphData(graphStore.graphView)` 切回真实图（可选，见注意）
3. `hoverTargetId.value = null`、`sourceNodeId.value = null`、`isActive.value = false`

> 注意：deactivate 时画布可能停留在预览图。切回真实图是防御性的——后续任何 watch(graphView) 触发也会纠正。若实现时发现 deactivate 后立刻有 watch 纠正，可省去手动 sync，但需在返回中说明判断。

## 新增/修改文件

| 文件                                                  | 职责                                  | 操作                          |
| ----------------------------------------------------- | ------------------------------------- | ----------------------------- |
| `frontend/src/feature-tools/toolbar/add_edge.ts`      | add-edge 工具 handler                 | 修改（hover 预览 + 碰撞拦截） |
| `frontend/src/feature-tools/toolbar/add_edge.test.ts` | 工具测试                              | 修改（适配新流程）            |
| `frontend/src/views/Graph.vue`                        | 移除 edge-source-target bindHighlight | 修改                          |

## 变更边界

**禁止修改**：

- `mediator.ts` / `types.ts` — 已在 051-2 完成
- `preview_engine.ts` — 已在 051-3 完成
- 其他 `toolbar/` 下 handler（add_node / delete / fold / move_node）
- `graphStore` / `uiStore` / `draft_store`
- `cytoscape/` 下任何文件
- `Graph.vue` 中除 edge-source-target bindHighlight 外的任何内容
- `useRenderer.ts`

## 验收标准

- [ ] 激活 add-edge 工具 → 点击节点 A → A 高亮（`edge-source-target`，由 handler 管理）
- [ ] hover 到节点 B → 画面切换为预览图（A 和 B 视觉变大——degree +1 导致直径变大）
- [ ] hover 到密集节点（有碰撞）→ A 或 B 红色高亮（`.preview-collision`），其他节点无样式变化
- [ ] hover 离开 → 画面切回真实图，红色消失，A 的 source 高亮保持
- [ ] hover 到碰撞节点并点击 → 边不创建，sourceNodeId 保持（可重试）
- [ ] hover 到非碰撞节点并点击 → 边创建成功，画面同步真实图（含新边），source 高亮消失
- [ ] 点击 source 自身 → 忽略（不创建自环）
- [ ] deactivate / 切换工具 → 所有 `add-edge` owner 的 class 清除
- [ ] `Graph.vue` 不再包含 `edge-source-target` 的 bindHighlight（`delete-target` 保留）
- [ ] add-edge 四种变体（实/虚 × 有向/无向）全部正常
- [ ] 工具栏其他 9 工具 + deconstruct 功能不受影响
- [ ] `pnpm --filter frontend test` 全部通过
- [ ] 前端运行无 TS 编译错误

## subagent task 返回要求

返回改动概要：新增/修改的函数（onNodeHover / onNodeHoverOut / onNodeClick / deactivate）的关键逻辑描述，特别是"sync 后重施 class"的顺序是否正确。报告不确定项。确认四种变体均测试通过。
