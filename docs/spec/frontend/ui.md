# UI 交互规格（Phase 2）

> 依据：`docs/设计/02-交互设计.md`、`docs/设计/04-UI与笔记库.md`。
> 范围：Phase 2 前端 UI。导航卡片、笔记库、AI 模式开关、知识群嵌套布局等超纲内容不在此列。

---

## 一、页面布局

```
┌─────────────────────────────────────────────────────────┐
│  [+实] [+虚]  [+→实] [—实] [+→虚] [—虚]  [×] [∨]       │  ← 常驻操作栏（顶部中央）
│                                                         │
│   [C]                                                   │  ← 模式按钮（左上角，显示当前模式图标）
│   ─────────                                             │
│   Deconstruct                                           │
│   Induce                                                │  ← 模式子操作列表（按钮下方竖直排列）
│   Internalize                                           │
│   Diverge                                               │
│   Unearth                                               │
│   Explore                                               │
│                                                         │
│                    （Cytoscape 画布）                      │
│                                                         │
│                                              [浮空窗]    │
│                                                         │
│  [←]                                                    │  ← 回溯按钮（左下角，Step 12）
└─────────────────────────────────────────────────────────┘
```

### 1.1 常驻操作栏（顶部中央）

8 个按钮，按视觉分组（组间间距更大）。始终可见，不随模式切换隐藏。

**节点组**：

| 按钮 | 文字 | 激活后光标 | 行为 |
|------|------|:--------:|------|
| +实节点 | `+实` | crosshair | 点击画布空白处 → 创建 `kind=real` 的 DraftNode，弹出 NodeWindow。必须补全标签后才可创建 |
| +虚节点 | `+虚` | crosshair | 同上，`kind=virtual` |

**边组**：

| 按钮 | 文字 | 激活后光标 | 行为 |
|------|------|:--------:|------|
| +有向实边 | `+→实` | cell | 点击起点节点（高亮）→ 点击终点节点 → 创建 `kind=real, direction=directed` 边 |
| +无向实边 | `+—实` | cell | 同上，`kind=real, direction=undirected` |
| +有向虚边 | `+→虚` | cell | 同上，`kind=virtual, direction=directed` |
| +无向虚边 | `+—虚` | cell | 同上，`kind=virtual, direction=undirected` |

**工具组**：

| 按钮 | 文字 | 激活后光标 | 行为 |
|------|------|:--------:|------|
| 删除 | `×` | pointer | 点击节点/边 → 两步确认 → 执行删除。若操作对象是抽象节点，递归删除其下所有子图子树，操作前征求用户确认 |
| 折叠 | `∨` | pointer | 点击节点 → toggle 依赖折叠/展开 |

**通用规则**：

- 工具互斥：同一时刻只有一个工具激活。点击另一个工具时前一工具自动取消。
- 取消工具：右键画布 / 再次点击已激活工具。
- 添加节点后若用户点击其他位置（非确认），DraftNode 自动取消。
- 删除两步确认：首次点击 → 目标高亮（红色边框），再次点击同一目标 → 确认删除，点击不同目标 → 切换，点击空白 → 取消。

### 1.2 模式按钮（左上角）

**单个圆形按钮**，同时承担"显示当前模式"和"切换模式"两个职责。

- Cognition 模式 → 图标显示 `C`
- Arrangement 模式 → 图标显示 `A`

**点击行为**：展开模式选择子列表。子列表包含两个选项——Cognition、Arrangement。点击某个选项后切换到对应模式，按钮图标更新，子列表收起。

### 1.3 Cognition 子操作（模式按钮下方竖直排列）

| 按钮 | 行为 | 状态 |
|------|------|:----:|
| Explore | 开始新一轮学习，结束后产出知识块 | TODO（Phase 3） |
| Unearth | 对虚节点或无向虚边开启学习 | TODO（Phase 3） |
| Deconstruct | 对当前选中实节点执行解构 | Phase 2 |
| Induce | 对当前选中多个节点执行归纳 | Phase 2（入口连接待多选 UI） |
| Internalize | 将选中节点转移至常识层 | Phase 2（入口连接待多选 UI） |
| Diverge | 在两个知识节点间创建有向虚边（含跨图） | Phase 2（入口连接待搜索 UI） |

### 1.4 Arrangement 子操作（模式按钮下方竖直排列）

布局操作统一流程：选择操作对象 → 确认选择完毕 → 预览布局 → 用户确认后写入 Data。

| 按钮 | 行为 | 状态 |
|------|------|:----:|
| Adjust Distance | 不改变边方向地改变两节点间边长 | Phase 2b |
| Adjust Orbit | 调整角度并离散调整边长，自动吸附轨道 | Phase 2b |
| Orbit | 环绕布局（实节点+实边） | Phase 2b |
| Path | 路径布局（有向实边） | Phase 2b |
| Cloud | 云布局（任意节点/边） | Phase 2b |
| Move | 单节点移动 | Phase 2 |

---

## 二、交互流程

### 2.1 添加实节点

```
[1] 用户点击 [+实]
     → [+实] 高亮，其他按钮恢复
     → 画布光标变为 crosshair

[2] 用户点击画布空白处 (x, y)
     → 创建 DraftNode { kind: 'real', x, y }
     → NodeWindow 在 (x, y) 附近浮出，等待输入 label

[3] 用户在 NodeWindow 中输入 label，点确认
     → label 为空 → 拒绝提交
     → graphStore.applyOperation({ type: 'add_node', node })
        → 校验失败：NodeWindow 内显示 error message
        → 校验成功：DraftNode 清除，节点出现在画布上

[4] 用户点 NodeWindow 外部（不确认）/ 右键
     → DraftNode 清除，工具保持激活
```

### 2.2 添加有向实边

```
[1] 用户点击 [+→实]
     → [+→实] 高亮，画布光标变为 cell

[2] 用户点击起点节点 A
     → A 高亮（视觉反馈：待定 source）
     → uiStore.pendingAddEdge.sourceNodeId = A.id

[3] 用户点击终点节点 B
     → 构造 EdgeData → graphStore.applyOperation({ type: 'add_edge', edge })
     → 校验失败：高亮清除，错误消息展示
     → 校验成功：边出现在画布上，pendingAddEdge 清除

[4] 中途点击空白画布 / 右键 → pendingAddEdge 清除
```

### 2.3 删除节点

```
[1] 用户点击 [×]
     → [×] 高亮，画布光标变为 pointer

[2] 用户点击节点 A（首次）
     → A 高亮（红色边框）
     → uiStore.pendingDeleteNodeId = A.id

[3] 用户再次点击节点 A
     → 若 A 正被浮空窗编辑 → 关闭浮空窗
     → graphStore.applyOperation({ type: 'delete_node', nodeId: A.id })
     → 若 A 为抽象节点 → 弹确认框："将递归删除其下所有子图子树"
     → A 及关联边从画布消失，待定状态清除

[4] 点击不同节点 B → 切换待定目标到 B
[5] 点击空白画布 / 右键 → 待定状态清除
```

### 2.4 折叠

```
[1] 用户点击 [∨] → [∨] 高亮

[2] 用户点击节点 A
     → 未折叠 → collapse_dependency → 依赖子图从画布隐藏
     → 已折叠 → expand_dependency   → 依赖子图恢复显示
```

### 2.5 解构（Deconstruct）

```
前提：用户在画布上选中了一个实节点（role=knowledge, kind=real）

[1] 进入 Cognition 模式 → 点击 Deconstruct

[2] deconstruct(selectedNodeId)
     → composeDeconstruct({ nodeId, parentGraph: currentGraph })
     → 语义预检失败 → uiStore.lastOperationValidation 写入 error
     → 通过 → applyBatch(parentGraph, operations, registry)
     → 创建的子图 registerNewGraph 持久化

[3] 错误反馈：画布 toast
    成功反馈：节点 form 从 'atomic' 变为 'abstract'，子图创建
```

### 2.6 右键行为

```
右键画布 →
    取消当前所有选中操作（常驻操作栏按钮恢复默认）
    放弃所有当前草稿编辑（DraftNode / DraftEdge 清除）
    不改变交互模式（Cognition / Arrangement 保持不变）
```

### 2.7 默认行为（无激活工具时）

```
点击节点 → 打开 NodeWindow（浮空窗编辑节点/边属性）
点击边   → 打开 NodeWindow
拖拽画布 → 平移相机
```

---

## 三、错误反馈（Phase 2 收尾）

`uiStore.lastOperationValidation` 已写入多处，但读取端为 0。

| 场景 | 反馈形式 | 读取端 |
|------|---------|--------|
| NodeWindow 内 add_node / update_node / update_edge 失败 | NodeWindow 底部红色文字显示 `issues[].message` | NodeWindow.vue |
| 删除操作失败 | 画布底部 toast | KnowledgeGraph.vue |
| 认知操作失败（deconstruct 等） | 画布底部 toast | KnowledgeGraph.vue |
| 添加边失败（重边、自环等） | 画布底部 toast | KnowledgeGraph.vue |

```ts
// KnowledgeGraph.vue watch
watch(() => uiStore.lastOperationValidation, (result) => {
    if (result && !result.valid && !uiStore.floatingWindowData) {
        // 非浮空窗场景：展示 toast
    }
})
```

---

## 四、调用关系

```
用户操作（DOM 事件）
    │
    ├─ 常驻操作栏 @click
    │   └─ controller.selectTool('add-real-node') 等
    │       └─ uiStore 写入工具状态 → 光标切换
    │
    ├─ 画布交互（节点/边/空白点击）
    │   └─ use_graph_interaction → 语义事件
    │       └─ controller.handleXxxClicked(payload)
    │           ├─ 读 uiStore（当前工具）
    │           ├─ 路由到 graph_operations.xxx()
    │           │   └─ graphStore.applyOperation 或 engine compose → applyBatch
    │           └─ 更新 uiStore（清 pending / 写 validation）
    │
    ├─ Cognition 子操作 @click
    │   └─ controller.deconstruct(selectedNodeId) 等
    │       └─ graph_operations.xxx()
    │           └─ compose → applyBatch → registerNewGraph
    │
    └─ 右键
        └─ controller.handleRightClick()
            └─ 清工具 + 清草稿，不改变交互模式
```

**关键约束**：

- `operation_controller` 只做状态管理 + 事件路由。不调引擎，不调 `graphStore.applyOperation`。
- `graph_operations` 承担所有图操作的实际执行。它是引擎 compose / applyBatch 在前端的唯一调用点。

---

## 五、交互模式

| 模式 | 进入 | 退出 | 行为 |
|------|------|------|------|
| 默认 | 启动 / 右键 | — | 无激活工具。点击节点/边 → 浮空窗。常驻操作栏 8 按钮可用 |
| Cognition | 模式按钮展开子列表 → 选择 Cognition | 切换到 Arrangement | 认知子操作可选。常驻操作栏仍可用 |
| Arrangement | 模式按钮展开子列表 → 选择 Arrangement | 切换到 Cognition | 布局子操作可选。常驻操作栏仍可用 |

- 模式按钮始终可见，图标反映当前模式（`C` / `A`）。
- 右键不改变交互模式——只取消工具和草稿。
- 不再有 `'operation'` 模式——常驻操作栏在**所有模式**下可用。

---

## 六、视觉状态

### 6.1 按钮

| 状态 | 样式 |
|------|------|
| 默认 | 半透明白色背景，灰色边框 |
| hover | 浅蓝背景 |
| 激活（当前选中） | 蓝色背景，深蓝边框 |

### 6.2 画布光标

| 工具 | 光标 |
|------|------|
| 默认（无激活工具） | `default` |
| 添加节点 | `crosshair` |
| 添加边 | `cell` |
| 删除 | `pointer` |
| 折叠 | `pointer` |

### 6.3 高亮

| 场景 | 视觉 |
|------|------|
| 添加边 — 已选 source | source 节点蓝色边框 |
| 删除 — 待定目标 | 目标红色边框（`delete-target` class） |
| 操作失败 | 目标节点/边短暂红色闪烁 |

---

## 七、不变项

- GraphData 唯一事实源 — 所有修改经 `graph_store.applyOperation`
- Cytoscape 只是 Renderer — 不持有业务状态
- DraftNode / DraftEdge 不进入 GraphData — 确认后才转为 operation
- 引擎侧零改动
- 导航卡片、笔记库、AI 模式开关、Overlay 视图按钮 — Phase 3，不在此列
- 回溯按钮（← →）— Step 12，不在此列
