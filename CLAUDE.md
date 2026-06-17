# my-first-project — Knowledge Graph Runtime

## 项目定位

- **Graph Engine 开发目标**：让用户当前的学习 / 认知 / 研究状态可视化、可形式化表达。
- **Asterism** 在管理学习者与知识之间的**学习状态**，而不是认知/知识本身。

## 技术栈

### 前端
- Vue 3 (Composition API + `<script setup>`)
- TypeScript 6.0
- Pinia (3 个 Store)
- Tailwind CSS v4
- Cytoscape.js 3.33
- pnpm（禁止 npm / yarn）

### 后端（规划中）
- FastAPI (Python)

### 数据库（规划中）
- Supabase

### AI（规划中）
- LangChain
- LangGraph

### 开发环境
- WSL Ubuntu + VSCode

## 核心原则（必须遵守）

1. **GraphData 是唯一事实源（Single Source of Truth）**
2. **Cytoscape 只是 Renderer**，永远不是事实源
3. **Runtime 优先于 UI**
4. **所有 GraphData 修改必须经过 `graph_store.applyOperation()`**
5. **Local First** — 当前用 localStorage 持久化
6. **Position 持久化** — GraphData.position 是唯一位置事实源
7. **Cognitive State 持久化** — 折叠/展开状态随 GraphData 一起持久化

## 架构分层（严格单向数据流）

```
用户交互 (DOM)
    ↓
Cytoscape 交互适配层 (use_graph_interaction.ts)
    ↓ 语义事件 (CanvasClicked, NodeClicked, EdgeClicked, NodeDragEnded)
    ↓
UI Runtime 编排层 (operation_controller.ts)
    ↓ GraphOperation
Graph Runtime (graph_store.ts) ← 唯一事实源
    ↓ watch(currentGraph)
渲染投影层 (graph_element_mapper.ts)
    ↓ CyElements
Cytoscape Renderer (use_cytoscape_renderer.ts)
```

## 三个 Pinia Store

| Store | 职责 | 禁止 |
|-------|------|------|
| graph_store | GraphData 唯一事实源，applyOperation() 唯一写入点 | Draft/Cytoscape 禁止进入 |
| ui_store | 用户 UI 意图（交互模式、选中工具、浮空窗） | 不保存 GraphData |
| draft_store | 临时草稿（DraftNode/DraftEdge），互斥 | 不直接进入 GraphData |

## Cytoscape 边界（最重要）

- 禁止 cy 修改 GraphData
- 禁止 cy 持有 GraphData 引用
- 禁止 cy 保存业务状态
- 数据流只能是 GraphData → Cytoscape，不允许反向
- 反向必须经过：Interaction → Controller → GraphStore

## 重要 Commit

- `0ddcbaa` — refactor graph isolate store internals and extract render layer（拆分 graph 内部实现至 utilities/，分离 render/ 渲染层）
- `8288b26` — cleanup frontend remove unused scaffold files and add coding conventions
- `3755f74` — refactor-graph-isolate-cytoscape-runtime（已完成 Cytoscape 隔离）
- `57f5cc6` — refactor graph types add role discriminated union for node identity（NodeRole 第一层判别，Phase 1 类型收口）
- `f1d9649` — refactor ui interaction add right-extending column toolbar and two-level right-click exit（Phase 1 收尾）

## 开发策略

**Graph Engine 是整个项目的底层核心系统**，最终必须作为独立、框架无关的模块实现。当前前端的 `graph_store.ts` + `operation_executor.ts` 是其雏形，后续将抽离为独立引擎。

## 开发阶段总览

### Phase 1：前端 Runtime 完成 ✅

1. **NodeWindow Runtime** — 统一 DraftNode 与 ExistingNode 编辑
2. **OperationToolbar Runtime** — 完善 Add Edge / Delete / Fold
3. **OperationController 收口** — 彻底封死 ui_store/draft_store 对外暴露
4. **Node Type 收口** — 引入 `NodeRole` 第一层判别，消除 `'normal'` 占位符，TS discriminated union

> **注意**：`move` 已从 Phase 1 迁移至 Phase 2（Arrangement 模式）。当前 Operation 模式仅包含 Add / Delete / Fold。
> `NodeViewRole` 已重构为 `NodeRole` + `ReferenceNodeKind`，`RealNodeForm: 'normal'` 已重命名为 `'atomic'`。
> 详见 commit `57f5cc6`。

**Phase 1 完成标志**：

| # | 任务 | 可验证标志 |
|---|------|----------|
| 1 | NodeWindow Runtime | DraftNode 和 ExistingNode 共用同一个 `NodeWindow.vue` 组件；浮空窗确认后统一走 `update_node` operation |
| 2 | OperationToolbar Runtime | 工具栏上的 add_edge / delete / fold 操作通过 `operation_controller` 发出 `GraphOperation`，不直接调 `graph_store` |
| 3 | OperationController 收口 | `ui_store` 和 `draft_store` 不再被组件层之外的代码直接引用任何写操作；所有写入路径必经 `operation_controller` |
| 4 | Node Type 收口 | `NodeRole` 作为第一层判别，`NodeData` 为 discriminated union；引用节点不再被迫携带无意义 `kind`/`form`；`'normal'` 占位符消除 |

**定性标准**：从 UI 事件到 GraphData 变更，中间每一条路径都经过单向数据流的完整链路，不存在任何短路。

### Phase 2：Graph Engine（架构核心层）

将 `operation_executor.ts` / `graph_persistence.ts` / `graph_utils.ts` 抽离为独立模块：
- 框架无关（不依赖 Pinia / Vue）
- 多图谱生命周期管理
- 所有原子操作
- 后端子进程、AI Runtime 可直接调用

**Phase 2 收尾：操作错误感知反馈链路**
- 当前 `operation_controller` 各操作入口已调用 `applyOperation()` 并拿到 `ValidationResult`，但校验失败时用户无任何视觉反馈。
- 需补全：在 `NodeWindow.vue`（或 `KnowledgeGraph.vue` 层）读取 `uiStore.lastOperationValidation` 并将 `issue.message` 渲染为可感知的 UI 提示。
- 当前检查清单：
  - `handleFoldToggle()` — 完全丢弃返回值，校验失败无反馈 ✅ 需修复
  - `executeDeleteNode()` / `executeDeleteEdge()` — 未检查 `result.valid` ✅ 需修复
  - `lastOperationValidation` — 已写入 6 处、已读取 0 处 ✅ 需补全

### Phase 3 前置：学习历史回顾机制

在 Phase 3（AI Runtime）启动之前，必须先完成学习历史回顾的功能设计并实现数据层基础。

**目标**：让用户在时间轴上回溯图谱任意时刻的状态，实现"git log 式"的学习历史回顾。

**两层模型（已实现数据层，Phase 2）：**

```
操作树（细粒度，自动记录）：
    - OperationLog = { entries: OperationLogEntry[], cursor: number }
    - 树结构：每个 entry 的 parentIndex 指向父节点。parentIndex = -1 = 基线 G₀
    - 驱动临时撤销：Ctrl+Z = cursor 沿 parentIndex 链上溯。Ctrl+Y = 子节点选择（≥2 子时弹出分支选择）
    - 新操作挂在当前 cursor 下，旧分支保留在 entries 中

状态标签（粗粒度，用户显式提交）：
    - State = { cursor: number, summary: string, timestamp: string }
    - 不存储 GraphData 副本，指向操作树中的某个 entry
    - 恢复 State = cursor 跳到 state.cursor，沿 parentIndex 链回放
    - summary 限制不超过 50 个中文字符

中间层（Phase 2 完成）：
    - core/reversal.ts：逆操作构造器。createReversal(graph, op) → GraphOperation[]
    - core/replay.ts：操作序列回放。replayGraph(base, ops) → GraphData

UI 层（Phase 3 期间完成）：
    - 左下角 ← → 按钮（Undo/Redo）
    - 历史时间轴视图（State 列表）
    - 分支选择 UI（Redo 时多子节点）
```

### Phase 3：AI Runtime（MVP 后期，排在 Graph Engine 之后）

- Compiler / Translator / Checker / Analyser Agent 信息流连通
- 要求 Graph Engine 作为底层基础
- 存储格式从 JSON 切换为 JSONB

**Phase 3 前置待决策：批量原子操作（`applyBatch`）**

- 问题：AI Collabrator 生成的 `Graph Patch Plan` 是一组语义关联的操作序列，需作为整体事务执行。若逐条 `apply()`，中间失败会导致 GraphData 处于半成品状态，与 AI 意图的认知语义完整性冲突。
- 设想的 `applyBatch(graph, ops[])` 行为：引擎内部逐条 validate → 全通过后逐条 execute。任一失败则整批丢弃，入参 graph 原封不动。中间状态不暴露给调用方。
- `applyBatch` 不影响当前 Phase 2 的单步 `apply()`，是新增独立函数。
- 当前约定：暂不实现，待 Phase 3 AI 接入前决策。`apply()` 接口在 Phase 3 不需改动。

### MVP 阶段暂不启动

- FastAPI 后端
- Supabase 集成
- Auto Save / IndexedDB
- 导航卡片、笔记库等高级 UI

## 设计文档

- 完整设计文档：`docs/设计/`（按主题拆分为 4 份）

---

# 代码规范

## 一、总体原则

代码服务于 **Runtime 规则表达**，而不是实现细节表达。优先描述"这个对象是什么 / 承担什么职责 / 遵守什么规则"，而不是"这行代码在干什么"。

核心：**注释解释规则，代码表达实现。**

### 变量命名规则

遍历节点使用 `node`，遍历边使用 `edge`，禁止单字母简写。

```ts
// ❌ 禁止
graph.nodes.filter(n => n.role === 'knowledge')
graph.edges.find(e => e.id === targetId)
for (const e of params.edges) { degreeMap.set(e.source, ...) }

// ✅ 使用全称
graph.nodes.filter(node => node.role === 'knowledge')
graph.edges.find(edge => edge.id === targetId)
for (const edge of params.edges) { degreeMap.set(edge.source, ...) }
```

## 二、文件命名（snake_case）

所有 `.ts` 文件统一 `snake_case`：
- ✅ `graph_store.ts`, `ui_store.ts`, `graph_operation_types.ts`, `graph_persistence.ts`
- ❌ `GraphStore.ts`, `graphStore.ts`, `Graph_Store.ts`

Vue 组件文件例外：统一 **PascalCase**（Vue 生态约定）：
- ✅ `KnowledgeGraph.vue`, `NodeWindow.vue`, `OperationToolbar.vue`

## 三、缩进规范

**4 空格**。禁止 Tab，禁止 2 空格。

## 四、文件头注释

每个 Runtime 文件必须有文件头说明：
```ts
/**
 * 功能：
 *     ...
 *
 * 总体结构：
 *     ...
 *
 * 外部如何使用：
 *     ...
 */
```

## 五、接口注释（interface / type / class / enum）

所有类型定义必须有：
```ts
/**
 * 功能：
 *
 *     ...
 *
 * 规则：
 *
 *     ...
 */
export interface XXX { }
```

规则与函数注释相同：小节标题后空一行，再写内容。无 `参数：` 段。

## 六、函数注释

所有公开函数必须有：
```ts
/**
 * 功能：
 *     ...
 *
 * 规则：
 *     ...
 *
 * 参数：
 *
 *     paramName — 是什么 / 从哪来 / 特殊规则
 *
 * 使用：
 *     ...
 */
```

规则：
1. JSDoc 本质是 markdown。各小节标题（`功能：` / `规则：` / `参数：` / `使用：`）后必须空一行，再写内容。
   空行 = markdown 段落分隔。不加空行则 LSP hover 浮空窗会把标题和后续内容挤成同一段，不换行显示。
2. 参数说明格式：`参数名 — 一句话说清语义。键 = 键语义，值 = 值语义`。每参数一行。
3. 无参数的函数省略 `参数：` 段。

## 七、禁止内部注释

允许：文件头 / 接口 / 函数注释。
禁止：逐行注释、解释显然的代码行为的废话注释。

**例外**：以下两种情况允许行末简要注释：

1. **前端特有语法**（供 C++ 背景开发者理解）。如 `function*`、`yield`、`Proxy` 等 C++ 无直接对应的语法。
   格式：代码后同一行 `// [语法名]：[一句话解释]`。
2. **非直觉实现**。代码逻辑正确但为什么这样写不是一眼能看懂的。

```ts
// ✅ 允许：解释 TS 特有语法
function* getObstacleNodes(...): Generator<...> {  // Generator：惰性迭代器，C++20 std::generator 等价
    yield node  // yield：暂停并返回值，C++ co_yield 等价
}

// ✅ 允许：解释非直觉实现
return R0 * Math.sqrt(1 + node.degree)  // √(1+d) 保证 degree=0 时半径不为 0

// ❌ 禁止：解释显然行为
const node = allNodes.find(node => node.id === nodeId)  // 查找节点 ← 废话
```

## 八、跨文件意图注释（禁止内部注释的唯一例外）

如果某段代码的存在是为了解决**外部文件的代码**产生的问题（而非本文件内部的逻辑需要），必须在代码块内用注释注明意图。

```ts
// 清理 fold 状态中对该节点的引用。
// delete_node 必须同步折叠状态，否则后续渲染会引用不存在的节点 ID 而报错。
// 这属于 delete_node 完整语义的一部分，不是副作用。
```

判断标准：

| 场景 | 加不加 |
|------|--------|
| 本文件内 A 函数调 B 函数 | ❌ 不加 |
| execute.ts 的 delete_node 清理 cognitiveState（跨操作耦合） | ✅ 加 |
| compose/cognitive 函数内自己校验输入 | ❌ 不加 |
| execute.ts 更新节点度数（本文件内纯逻辑） | ❌ 不加 |

## 九、状态定义规范


状态字段名表达规则，禁用 `a: any` 式定义。

## 十、Store 设计规范

Store = 状态 + 动作。不负责 UI 渲染 / DOM 操作 / Cytoscape 操作。

## 十一、注释层级

文件 → 接口 → 函数，三层封顶。禁止更深层注释。

## 十二、空行规范

逻辑块之间可空行分隔（如 actions 之间），禁止连续大量空行。

## 十三、命令行规范

命令前写说明注释。

## 十四、Git 提交格式

**全英文**。格式：**动词 + 模块 + 目的**（空格分隔）：

```
add graph persistence runtime
refactor ui runtime state machine
fix validator smoke test type guards
```

## 十五、回答/协作规范

说明为什么做 → 说明设计规则 → 给出代码 → 给出命令。保留原精神，适配 Claude Code 的直接文件操作模式。

## 十六、GraphData 唯一事实源（项目基石）

所有 GraphData 修改必须经过 `graph_store.applyOperation()`。

## 十七、Import 组织规范

强制分组 + 空行分隔，顺序如下：
```ts
// [1] 第三方库
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

// [2] 项目 definitions（类型 & 校验）
import type { GraphData } from '@/definitions/types/graph_types'
import { OperationValidator } from '@/definitions/validators/operation_validator'

// [3] 项目 graph / ui runtime
import { useGraphStore } from '@/graph/graph_store'
import { useUIStore } from '@/ui/ui_store'

// [4] 相对路径导入（组件等）
import NodeWindow from './graph/NodeWindow.vue'
```

规则：
- 每组之间空一行
- `type` import 和普通 import 可以混在同一组
- 组内按路径字母序

## 十八、Vue 组件命名

`.vue` 文件统一 **PascalCase**（与 Vue 生态一致），`.ts` 业务文件保持 **snake_case**。

## 十九、前端特有机制注释规范

**原则**：对于依赖 Vue / TypeScript / 前端框架特有行为（非通用编程范式）的代码，必须在注释中说明机制，帮助熟悉 C++ 但不熟悉前端的开发者理解"魔法"。

**格式**：在现有注释结构中增加"前端机制"小节（放在"规则"之前或之后，视上下文而定）：

```
 * 前端机制（供熟悉 C++/通用编程但不熟悉前端框架的开发者参考）：
 *     - 模式名：机制说明。
 *       C++ 类比：对应的 C++ 概念。
```

**适用范围**（非完整列表，视需要添加）：

| 机制 | 触发条件 |
|------|---------|
| Vue 响应式 | `ref()`, `computed()`, `watch()` |
| Vue 生命周期 | `onMounted()`, `onBeforeUnmount()` |
| Pinia | `defineStore()` + `useXxxStore()` |
| 编译时语法糖 | `<script setup>`, `<style scoped>`, template `ref` |
| 模板绑定 | 复杂的 `v-if`/`v-for`/动态绑定链条 |

**规则**：
1. 只解释 **"为什么会这样"**，不解释"这行代码在干什么"（不违反第七条）
2. 优先用 **C++ 类比**降低认知负担
3. 只标记**非直觉的框架行为**，通用 TypeScript/JS 语法不解释
4. 简单模板语法（如单个 `@click`）不需要注释，复杂的响应式链条才需要

**评判标准**：

| 场景 | 加不加 |
|------|--------|
| `ref()` 模板引用自动绑定 DOM | ✅ 加 |
| `computed()` 缓存计算与自动失效 | ✅ 加 |
| `watch()` 深层监听与自动依赖追踪 | ✅ 加 |
| `defineStore` 的 `state` 是工厂函数 | ✅ 加 |
| `<script setup>` 编译期行为 | ✅ 加 |
| `<style scoped>` 自动作用域隔离 | ✅ 加 |
| `v-if="x"` 条件渲染 | ❌ 不加 |
| `@click="fn"` 事件绑定 | ❌ 不加 |
| `import { fn } from 'vue'` | ❌ 不加 |

### 示例：KnowledgeGraph.vue 文件头

```ts
/**
 * 功能：
 *     KnowledgeGraph 页面组合层。
 *
 * 总体结构：
 *     1. 挂载 Cytoscape 容器
 *     2. 初始化 Cytoscape Renderer
 *     3. 监听 GraphData 变化并同步渲染
 *     4. 绑定 Cytoscape 语义交互事件
 *     5. 挂载 NodeWindow 与 OperationToolbar
 *
 * 前端机制（Vue 3 框架行为）：
 *     - <script setup lang="ts">：
 *       Vue 3 编译期语法糖。顶层变量自动暴露给模板，import 的组件自动注册。
 *       C++ 类比：编译器自动生成声明，无需手动写 return / components。
 *
 *     - ref<HTMLDivElement | null>(null)：
 *       Vue 响应式引用。模板中的 ref="cyContainer" 自动将 DOM 元素赋值给 .value。
 *       C++ 类比：std::shared_ptr + Observer 通知，但框架自动管理注册/注销。
 *
 *     - onMounted / onBeforeUnmount：
 *       生命周期钩子。onMounted ≈ 构造函数（DOM 已挂载），
 *       onBeforeUnmount ≈ 析构函数（组件销毁前清理）。注意 onMounted 之前 ref 为空。
 *
 *     - watch(source, callback, { deep: true })：
 *       响应式观察者。source 中访问的响应式值变化时触发 callback。
 *       deep: true 递归监听嵌套属性。C++ 类比：Observer + 自动深比较 + 自动注册/注销。
 *
 * 外部如何使用：
 *     App.vue 直接挂载本组件。
 */
```

## 二十、单次调用函数直接内联

纯函数辅助逻辑如果只被一个函数调用（且不 export），**不单独拆函数**，直接在调用处写代码加功能注释。

```ts
// ❌ 不单独拆函数
function fooHelper(x: T): U { ... }
function foo(): void { barHelper(x) }

// ✅ 直接内联
function foo(): void {
    // 辅助逻辑：描述做了什么
    const result = doSomething(x)
}
```

判断标准：

| 场景 | 拆不拆 |
|------|--------|
| 纯函数辅助逻辑，只调 1 次 | ❌ 内联加注释 |
| 纯函数辅助逻辑，被 ≥2 个函数调用 | ✅ 拆为 helpers |
| export 为公开 API | ✅ 独立函数及文档注释 |
| 函数体过长（>30 行）混在一起不利于阅读 | ✅ 拆为语义块 |
