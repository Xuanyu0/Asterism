# Step 2：renderer API 重构 + move_node 迁移 + Graph.vue 清理

> 来源：[050-步骤-渲染交互层重构.md](../../../P2开发文档/phase2b/步骤/050-渲染交互层重构.md) §Step 2

---

## 设计文档依据

- `CLAUDE.md` §架构分层：Cytoscape 只是 Renderer，GraphData 是唯一事实源
- `CLAUDE.md` §严格单向数据流：渲染投影层只读投影，不持有 GraphData 引用
- [050-步骤-渲染交互层重构.md](../../../P2开发文档/phase2b/步骤/050-渲染交互层重构.md) §已确认决策（共 11 条）

---

## 当前状态

Step 1（commit `66159d6`）已完成并提交：

- `frontend/src/cytoscape/` 目录就位，含 4 个文件
- `CyNodeData` / `CyEdgeData` 已精简为最小字段
- `bindCyEvents` 已改为普通函数
- `.move-picked` class 已加入 stylesheet

**遗留问题**（Step 2 要解决的）：

- `useRenderer.ts` 仍导出 `getCyInstance()`（模块级函数）+ 闭包 `.getInstance()`
- `move_node.ts` 5 处调用 `getCyInstance()` 直接操作 Cy 实例
- `Graph.vue` 3 处调用 `renderer.getInstance()` 直接操作 Cy 实例
- `Graph.vue` 直接 import `mapGraphDataToCyElements` 并调 `renderer.syncElements(cyElements)`
- `Graph.vue` 维护 `watchPendingTarget` 辅助函数做高亮 class 切换

---

## 架构变更（新旧对比）

**旧：工具/视图直接接触 Cy 实例**

```
move_node.ts                      Graph.vue
  │ getCyInstance()                  │ renderer.getInstance()
  ▼                                  ▼
cy.getElementById().position()     cy.getElementById().addClass()
cy.getElementById().style()        watchPendingTarget(...)
cy.container().addEventListener
  │                                  │
  ▼                                  ▼
          Cy 实例（裸暴露）
```

**新：renderer 语义 API 封装**

```
move_node.ts                      Graph.vue
  │ import { setNodePosition,        │ renderer.syncFromGraphData(graphView)
  │   addNodeClass, trackCursor      │ renderer.bindHighlight(getter, className)
  │   ... } from '@/cytoscape/       │
  │   useRenderer'                   │
  ▼                                  ▼
        模块级语义函数                composable 语义方法
              │                           │
              └───────────┬───────────────┘
                          ▼
                  Cy 实例（内部不可见）
```

---

## 涉及文件

| 文件                                              | 改动 | 职责                                                                                                      |
| ------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------- |
| `frontend/src/cytoscape/useRenderer.ts`           | 重构 | 删除裸实例导出；新增 9 个模块级语义方法；`syncElements` → `syncFromGraphData`                             |
| `frontend/src/feature-tools/toolbar/move_node.ts` | 重构 | 移除 `getCyInstance` import；所有 Cy 操作改为调 renderer 语义方法                                         |
| `frontend/src/views/Graph.vue`                    | 清理 | 移除 mapper import；`syncElements` → `syncFromGraphData`；删除 `watchPendingTarget`；改用 `bindHighlight` |

---

## 核心任务

### 1. useRenderer.ts — 删除裸实例出口

删除两处裸 Cy 实例访问路径：

- **`getCyInstance()`**：模块级导出函数（L49-51），返回模块级 `cyInstance`
- **`.getInstance()`**：`useRenderer` 返回对象中的闭包方法（L231-233），返回局部 `cy`

删除后 `cytoscape/` 外部再无可获取裸 Cy 实例的路径。

### 2. useRenderer.ts — `syncElements` → `syncFromGraphData`

将当前 `syncElements(elements: CyElements)`（外部调 mapper → 传 CyElements 进来）改为 `syncFromGraphData(graphData: GraphData)`（内部调 mapper + `cy.json()` + 清 transient）。

`syncFromGraphData` 的行为：

- 内部调用 `mapGraphDataToCyElements(graphData)` 得到 `CyElements`
- 调用 `cy.json({ elements })` 同步渲染
- 清除全部 transient 视觉状态（所有 owner 的 class 预览、高亮、位置缓存）
- 记录每个节点的 GraphData 位置（供 `resetNodePosition` 使用）

### 3. useRenderer.ts — 新增 9 个语义方法

所有方法以**模块级函数**导出，内部访问模块级 `cyInstance`。函数签名：

```ts
// 数据同步（模块级函数）
export function syncFromGraphData(graphData: GraphData): void

// 视口居中 + 闪烁定位（模块级函数，替代旧 composable 方法 revealElement）
export function centerOnElement(elementId: string): void
    // 行为：cy.animate({ center: { eles: ... } }) + addClass('search-focus') + 1.2s 后 removeClass

// 视觉预览：位置（模块级函数）
export function setNodePosition(nodeId: string, pos: { x: number; y: number }): void
export function getNodePosition(nodeId: string): { x: number; y: number } | null
// 恢复到最近一次 syncFromGraphData 记录的 GraphData 位置
export function resetNodePosition(nodeId: string): void

// 视觉预览：class（模块级函数，仅管理 class，不操作 position）
export function addNodeClass(nodeId: string, className: string, owner: string): void
export function removeNodeClass(nodeId: string, className: string, owner: string): void
// 清除指定 owner 施加的全部 class。内部数据结构：Map<owner, Map<nodeId, Set<className>>>
export function clearAllPreviews(owner: string): void

// 光标追踪（模块级函数）
// 内部：cy.container().addEventListener('mousemove', ...) + cy.renderer().screenToModel()
// 返回 stop handle，调用方负责在 deactivate 时调用 stop()
export function trackCursor(
    callback: (modelPos: { x: number; y: number }) => void
): { stop(): void }

// 反应式外部高亮（composable 方法，因为内部需调 watch()）
// 此方法保留在 useRenderer 返回对象上，非模块级函数（watch 只能在 setup/composable 内调用）
bindHighlight(getter: () => string | null | undefined, className: string): void
```

**注意**：`bindHighlight` 内部需调 `watch()`，只能在 composable 上下文内调用，因此保留为 `useRenderer` 返回对象上的方法，**不是**模块级函数。

### 4. move_node.ts — 全面迁移

移除 `import { getCyInstance } from '@/cytoscape/useRenderer'`，改为：

```ts
import {
  setNodePosition,
  getNodePosition,
  resetNodePosition,
  addNodeClass,
  removeNodeClass,
  clearAllPreviews,
  trackCursor,
} from '@/cytoscape/useRenderer'
```

**逐函数映射**（当前 → 目标）：

| 位置                     | 当前调用                                                               | 替换为                                                           |
| ------------------------ | ---------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `onNodeClick` (L148)     | `getCyInstance()` → `cy.getElementById()`                              | 保存 `pickedNodeId`；用 `getNodePosition`/`setNodePosition`      |
| `onNodeClick` (L166)     | `cyNode.style('opacity', 0.4)`                                         | `addNodeClass(nodeId, 'move-picked', 'move')`                    |
| `onNodeClick` (L177-180) | `cyNode.position({...})`                                               | `setNodePosition(nodeId, pos)`                                   |
| `bindMousemove` (L215)   | `getCyInstance()` → `cy.container().addEventListener`                  | `trackCursor(callback)`，保存返回的 `tracking` handle            |
| `bindMousemove` (L243)   | `cyNode.position(modelPos)`                                            | 在 trackCursor callback 内调 `setNodePosition(nodeId, modelPos)` |
| `bindMousemove` (L256)   | `cyNode.addClass('move-collision')`                                    | `addNodeClass(nodeId, 'move-collision', 'move')`                 |
| `bindMousemove` (L258)   | `cyNode.removeClass('move-collision')`                                 | `removeNodeClass(nodeId, 'move-collision', 'move')`              |
| `unbindMousemove` (L281) | `getCyInstance()` → `cy.container().removeEventListener`               | `tracking.stop()`                                                |
| `cancelPick` (L307)      | `getCyInstance()` → `cy.getElementById()`                              | 用 `resetNodePosition` / `clearAllPreviews`                      |
| `cancelPick` (L312-314)  | `cyNode.position(original)` + `.removeClass` + `.style('opacity', '')` | `resetNodePosition(nodeId)` + `clearAllPreviews('move')`         |
| `placeAttempt` (L340)    | `getCyInstance()` → `cy.getElementById()`                              | `getNodePosition(nodeId)` 读取当前视觉位置                       |
| `placeAttempt` (L361)    | `cyNode.addClass('move-collision')`                                    | `addNodeClass(nodeId, 'move-collision', 'move')`                 |
| `placeAttempt` (L375)    | `cyNode.removeStyle('opacity')`                                        | `removeNodeClass(nodeId, 'move-picked', 'move')`                 |

**`activate` / `deactivate` 变更**：

- `activate()`：删除 `bindMousemove()` 调用；改为 `this.tracking = trackCursor((modelPos) => { ... })`
- `deactivate()`：删除 `unbindMousemove()` 调用；改为 `this.tracking?.stop()` + `clearAllPreviews('move')`
- 删除 `bindMousemove` / `unbindMousemove` 内部函数（DOM 事件绑定归 renderer）
- 删除 `lastMouseClientX` / `lastMouseClientY` 变量（坐标转换归 renderer）

**不需变化的部分**：

- 碰撞检测逻辑（`computeNodeRadiusOverrides` + `hasErrors`）不变
- `composeMoveNode` GraphData 操作不变
- `onNodeClick` 中的碰撞检测调用位置和时机不变

### 5. Graph.vue — 清理与迁移

三项改动：

**a) 移除 mapper 依赖**

- 删除 `import { mapGraphDataToCyElements } from '@/cytoscape/graph_element_mapper.ts'`
- 替换两处 `renderer.syncElements(mapGraphDataToCyElements(graphStore.graphView))` 为 `renderer.syncFromGraphData(graphStore.graphView)`

**b) 删除 `watchPendingTarget`，改用 `bindHighlight`**

- 删除 `function watchPendingTarget(getter, className)` 定义及内部 `cy.getElementById().addClass/removeClass`
- 在 `onMounted` / setup 内改为：
  ```ts
  renderer.bindHighlight(
    () => mediator.activeHandler.value?.highlightNode,
    'delete-target',
  )
  renderer.bindHighlight(
    () => mediator.activeHandler.value?.highlightEdge,
    'delete-target',
  )
  ```
- 同样用 `bindHighlight` 处理 add-edge 的 `edge-source-target` 高亮

**c) 事件绑定移入 renderer**

`getInstance()` 删除后 Graph.vue 无 Cy 实例可用，且 `bindCyEvents(cy, handlers)` 需要 `Core` 参数。

- `useRenderer` 在 `mount()` 时接收 handlers 参数，内部 import `graph_interaction.ts` 的 `bindCyEvents` 并调用：`bindCyEvents(cy, handlers)`
- Graph.vue 删除 `import { bindCyEvents }` 行，改为在 `renderer.mount(...)` 调用时传入 handlers 对象
- `graph_interaction.ts` 本身不修改（纯函数签名不变，仅由 renderer 内部调）

---

## 变更边界

- 禁止修改 `graph_element_mapper.ts`
- 禁止修改 `cytoscape_style.ts`
- 禁止修改 `graph_interaction.ts`
- 禁止修改 `mediator.ts`
- 禁止修改 `graphStore`、`uiStore`、`draft_store`
- 禁止修改 `GraphNodeWindow.vue`、`GraphNavigationCard.vue`
- 禁止修改 `toolbar/` 下除 `move_node.ts` 外的任何 handler
- 禁止修改 `feature-tools/types.ts`（ToolHandler 接口不变）
- 禁止导出任何能获取裸 Cy 实例的函数
- 禁止在 `cytoscape/` 之外新增 `import cytoscape` 或 `import type from 'cytoscape'`

---

## 验收标准

- [ ] `useRenderer.ts` 不再导出 `getCyInstance()` / `getInstance()`
- [ ] `move_node.ts` 不再 import 任何 cytoscape 类型或 `getCyInstance()`
- [ ] `Graph.vue` 不再 import `mapGraphDataToCyElements`，不再调 `renderer.syncElements`
- [ ] `Graph.vue` 不再含 `watchPendingTarget` 定义，不再调 `cy.getElementById()`
- [ ] 拾取放置功能行为不变：点击拾取 → 节点半透明 + 跟随光标 → 碰撞红色高亮 → 右键取消弹回 → 点击放置
- [ ] delete 工具高亮正常（`delete-target` class 正常施加/移除）
- [ ] add-edge 工具起点高亮正常（`edge-source-target` class 正常施加/移除）
- [ ] 搜索定位闪烁正常（`centerOnElement` + `search-focus`）
- [ ] `grep 'getCyInstance\|\.getInstance' frontend/src/ --include='*.ts' --include='*.vue' | grep -v cytoscape/` 返回空
- [ ] `grep "from 'cytoscape'" frontend/src/ --include='*.ts' --include='*.vue' | grep -v cytoscape/` 返回空
- [ ] `pnpm --filter frontend test` 全部通过
- [ ] 前端 `pnpm --filter frontend dev` 无 TS 编译错误
- [ ] 工具栏原有 9 工具 + deconstruct 功能不受影响

---

## task 返回要求

完成后返回：

1. 修改了哪些文件（列表）
2. 每个文件的关键改动（一句话描述）
3. `pnpm --filter frontend test` 结果
4. 自检清单（逐项对照验收标准，已通过打勾，未通过说明原因）
5. 任何执行中遇到的问题或不确定项
