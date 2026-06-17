---
name: ui-dev
description: Vue 3 + Tailwind v4 前端 UI 开发规范。适用于新建/修改组件、调整样式、优化交互等前端工作。
---

# Vue 3 前端 UI 开发规范

## 一、总体设计哲学

从 `docs/设计/04-UI与笔记库.md` 的设计文档，提取核心原则：

- **低认知负担**：UI 不干扰用户思考，能隐藏就隐藏，能弱化就弱化
- **高空间沉浸感**：图谱是主角，UI 是配角
- **图谱主要，AI 次要**：UI 不能挤占图谱可视区域
- **基本不采用分栏式 UI**：尽量避免左右分栏。模式切换用浮空列，不用固定面板
- **UI 视觉设计"可插拔"**：组件松耦合，随时可替换而不影响业务逻辑

---

## 二、组件结构模板

每个 `.vue` 文件的固定结构：

```vue
<template>
    <!-- 模板内容 -->
</template>

<script setup lang="ts">
/**
 * 功能：
 *     [这个组件是做什么的]
 *
 * 总体结构：
 *     1. [语义块 1]
 *     2. [语义块 2]
 *
 * 前端机制（Vue 3 框架行为）：
 *     - [如果用了非直觉的框架行为，按需添加。简单语法不需要]
 *
 * 外部如何使用：
 *     [哪个父组件挂载本组件]
 */

import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
// ... 其他 import

// ... 组件逻辑
</script>

<style scoped>
/* 样式 */
</style>
```

### 规则

1. **`<script setup lang="ts">` 必须加 `lang="ts"`**
2. **`<style scoped>` 必须加 `scoped`**，除非全局样式有充分理由
3. **文件头注释必须有**（遵守 CLAUDE.md 第十九条规范）
4. **import 按组分组**：第三方 → 项目 definitions → 项目 runtime → 相对路径

---

## 三、Tailwind v4 约定

### 优先级

1. **优先 Tailwind utility class**，不写自定义 CSS
2. **自定义 CSS 仅用于**：Tailwind 无法表达的样式（如 `z-index: 999`）、复杂动画、Cytoscape 相关样式、`position: absolute` 定位
3. **禁止内联 style**：不要写 `style="color: red"`，用 class 或 `<style scoped>`

### 当前项目颜色 token

从已有代码中提取的实际用色：

| 用途 | Tailwind class | 裸值 |
|------|---------------|------|
| 页面背景 | `bg-slate-50` | `#f8fafc` |
| 按钮背景 | `bg-white` | — |
| 按钮边框 | `border-[#cbd5e1]` | `#cbd5e1` |
| 按钮 hover | `bg-[#f1f5f9]` | `#f1f5f9` |
| 激活态背景 | `bg-[#bfdbfe]` | `#bfdbfe` |
| 激活态边框 | `border-[#3b82f6]` | `#3b82f6` |
| 列分隔线 | `border-[#e2e8f0]` | `#e2e8f0` |
| 占位文字 | `text-[#94a3b8]` | `#94a3b8` |
| 危险操作 | `bg-[#ef4444] text-white` | `#ef4444` |
| 危险提示 | `text-[#ef4444]` | `#ef4444` |

### 禁止事项

- **禁止硬编码色值**：不要写 `color: #3b82f6`，用 Tailwind class 或提取为 CSS 变量
- **禁止 `!important`**：现有代码中仅 delete 按钮用了 `!important`（迫不得已覆盖优先级），新代码不要引入更多
- **禁止 `gap: 0`**：Flexbox gap 默认就是 0，不需要显式写

---

## 四、组件三大支柱

项目当前仅有一个页面（`KnowledgeGraphView.vue` → `KnowledgeGraph.vue`），其下有三类子组件：

### 4.1 浮空窗（NodeWindow.vue）

当前只有节点编辑浮空窗。后续扩展的模板：

```vue
<div
    v-if="[显示条件]"
    class="floating-window"
>
    <!-- 内容 -->
</div>
```

**规范**：
- `position: absolute` + `z-index: 999`
- `top/right` 定位，不遮挡操作区
- 宽度建议 `300px`
- 背景白色，1px 实线 `#ccc` 边框，`padding: 12px`

### 4.2 工具栏（OperationToolbar.vue）

**列式结构**：

```
主列（模式按钮 + 一级操作） → 二级操作列 → 三级操作列 → ...
```

用 `flex-direction: row` 组织多列，每列内部 `flex-direction: column`。

**规范**：
- `position: absolute`，`top: 20px; left: 8px`
- 列间用 `border-left: 2px solid #e2e8f0` 分隔
- 第一列不加左边框
- 模式按钮（`[>]`）为圆形：`28px × 28px`，`border-radius: 50%`
- 模式按钮与后续操作按钮间 `margin-top: 8px`（约 2–3 倍间距）
- 按钮统一 `padding: 4px 10px`，`font-size: 13px`，`border-radius: 4px`
- 按钮 hover 背景 `#f1f5f9`
- 按钮 active 背景 `#bfdbfe`，边框 `#3b82f6`

### 4.3 组合层（KnowledgeGraph.vue）

**职责**：挂载 Cytoscape 容器 + 初始化渲染器 + 绑定交互 + 组合子组件。

**规范**：
- 必须 `@contextmenu.prevent` 阻止浏览器默认右键菜单
- `cyContainer` 用 `ref<HTMLDivElement | null>(null)` 获取 DOM
- `onMounted` 中初始化 Cytoscape
- `onBeforeUnmount` 中销毁 Cytoscape
- **不直接修改 GraphData**（走 operation_controller）
- **不直接操作 Cytoscape**（走 renderer 封装）

---

## 五、交互设计规范

### 5.1 三种交互模式

| 模式 | 图标 | 含义 |
|------|------|------|
| Cognition | C | 认知演化（探索、发掘、解构、归纳、内化、发散） |
| Operation | O | 修改/显示（添加节点、添加边、删除、依赖折叠） |
| Arrangement | A | 布局/知识组织（Phase 2） |

### 5.2 工具栏交互规则

（详见 `docs/设计/02-交互设计.md`）

- **无模式默认**：用户未选任何模式时，`[>]` 显示 `>`。可平移/缩放/点击浮空窗
- **模式内未选工具**：操作列可见但不响应画布点击（行为回退到默认）
- **点击模式按钮 [>]**：展开模式选择列，选模式后按钮图标切换为 C/O/A
- **逐层右延**：有子级的操作向右展开新列。叶子操作点击直接执行
- **互斥展开**：同一时刻最多一条展开路径。在已展开路径中选另一个操作→从该层级起右侧全部消失
- **右键退出（两级）**：
  - 第一级：取消当前工具，回到"模式内未选工具"
  - 第二级：退出模式，`[>]` 恢复 `>`

### 5.3 光标反馈

当前已实现的光标映射（在 `KnowledgeGraph.vue` 的 `containerClasses` collected）：

| 状态 | CSS class | cursor |
|------|-----------|--------|
| 删除模式 | `.delete-mode` | `pointer` |
| 折叠模式 | `.fold-mode` | `pointer` |
| 添加节点就绪 | `.add-node-ready` | `crosshair` |
| 添加边就绪 | `.add-edge-ready` | `cell` |

---

## 六、视觉设计约定（Button 规范）

（详见 `docs/设计/04-UI与笔记库.md` §Button设计 和 §视觉设计）

### Button 通用规范

- **半透明**：让出视觉空间给图谱
- **浮空**：`position: absolute`，不占流
- **自动淡化**：pointer 离开 Button 3s 后自动淡化（当前未实现，Phase 2+ 考虑）
- **边缘吸附**：吸附在屏幕边缘或侧边栏旁

### Button 位置规划

| 位置 | 内容 |
|------|------|
| 左上角 | 模式切换按钮 [>] + 操作列 |
| 右上角 | 视图切换（眼睛图标 Overlay）：沉浸浏览 / Notebook 视图 / 未掌握视图 / 知识群聚焦 |
| 右下角 | AI 模式开关（灯泡图标） |
| 左下角 | 回溯 ← → 按钮 |

### 动效规范

- Button 展开：滑动弹出，`300ms`
- Button 收起：滑动收入，`300ms`

---

## 七、开发检查清单

每次做 UI 改动前自查：

- [ ] 是否避免引入新的分栏布局？（优先浮空/叠加）
- [ ] 是否使用了 Tailwind class 而非手写 CSS？
- [ ] 组件的 `position: absolute` 是否会遮挡图谱关键区域？
- [ ] `<style scoped>` 加了没？
- [ ] 文件头注释写了没？
- [ ] import 按四组分组了没？
- [ ] 新增的交互状态（hover/active/disabled）都覆盖了吗？
- [ ] 操作按钮的互斥展开逻辑是否正确？
- [ ] 右键退出两级粒度是否正确？
- [ ] 光标样式是否与当前交互意图匹配？
- [ ] 是否直接修改了 GraphData？（禁止。必须走 operation_controller）
- [ ] 是否直接操作了 Cytoscape？（禁止。必须走 renderer 封装）

---

## 八、相关文件索引

| 文件 | 内容 |
|------|------|
| `docs/设计/02-交互设计.md` | 三种交互模式完整定义、工具栏交互规则 |
| `docs/设计/04-UI与笔记库.md` | UI 设计哲学、Button 设计、导航卡片、视觉设计、笔记库 |
| `frontend/src/components/KnowledgeGraph.vue` | 组合层（Cytoscape 容器 + 渲染器 + 交互绑定） |
| `frontend/src/components/graph/NodeWindow.vue` | 节点/边编辑浮空窗 |
| `frontend/src/components/graph/OperationToolbar.vue` | 逐层右延列式工具栏 |
| `frontend/src/ui/ui_store.ts` | UI 意图状态（交互模式、工具选择、浮空窗数据） |
| `frontend/src/ui/draft_store.ts` | 草稿状态（DraftNode/DraftEdge） |
| `frontend/src/ui/operation_controller.ts` | UI Runtime 编排器（UI 事件 → GraphOperation） |
| `frontend/src/render/cytoscape/use_cytoscape_renderer.ts` | Cytoscape 生命周期封装 |
| `frontend/src/render/cytoscape/graph_element_mapper.ts` | GraphData → CyElements 投影 |
