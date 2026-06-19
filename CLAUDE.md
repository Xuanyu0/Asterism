# Asterism

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
UI 适配层 (operation_controller.ts)  ← 模式/工具状态 + 事件路由
    ↓ 委托图操作
图操作翻译层 (graph_operations.ts)  ← 认知编排 + add/delete/fold/update
    ↓ GraphOperation / applyBatch
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

**Graph Engine 是整个项目的底层核心系统**，已作为独立、框架无关的 `@my-project/graph-engine` 包实现。前端通过 `graph_store.ts` + `graph_operations.ts` 调用引擎 API。

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

### Phase 2a：Graph Engine（架构核心层） ✅

将 `operation_executor.ts` / `operation_validator.ts` / `graph_utils.ts` 等前端职责聚合代码下沉为独立引擎包 `@my-project/graph-engine`：

- 框架无关（不依赖 Pinia / Vue）
- 单步操作（11 种原子操作）：apply + validate + execute + createReversal
- 批量事务：applyBatch（validate-all-first → execute-all 或整批丢弃）
- 认知编排：deconstruct / induce / internalize / diverge（compose/cognitive/）
- 布局编排：move / adjust / orbit / path（compose/arrangement/）
- 基础设施：多图注册表（GraphRegistry）、碰撞检测、位置放置、跨图搜索、ID 生成
- 操作日志类型层：OperationLog / OperationLogEntry / State（树形操作树，支持 undo）
- 操作回放：replayGraph / replayToStep
- 前端已切到引擎全部 API，冗余代码已清理

**Phase 2a 完成标志**（详见 `docs/P2开发文档/步骤规划.md`）：

| Step | 内容 | 可验证标志 |
|------|------|----------|
| 1-8 | 引擎骨架 → 认知操作层 | 20 测试文件 119 测试全部通过 |
| 9 | 测试覆盖 | 19 个子任务全部有测试文件 |
| 10 | 公开 API 收口 | 按 6 类组织 index.ts，26 处消费者标注，不导出内部模块 |
| 11 | 前端适配 | graph_store 切 engine apply，import 全部指向 @my-project/graph-engine，删除 9 个重复文件，交互模式去 Operation 化，常驻操作栏 |

**Phase 2a 定性标准**：引擎作为独立的 `@my-project/graph-engine` 包运行，框架无关，20 文件 119 测试。前端仅通过 graph_store + graph_operations 两个文件调引擎，所有 import 指向引擎包。

---

### Phase 2b：功能收尾（操作日志 + 回溯 UI + 错误反馈）

以下任务 Phase 2a 未完成，延后至 Phase 2b：

| 任务 | 说明 |
|------|------|
| 操作日志 + undo | `undoStack` 升级为 `OperationLog`（树形操作树），undo 沿 parentIndex 回溯。redo 延后（多分支选择 UI） |
| 回溯按钮（←） | 左下角 undo 按钮，cursor 边界灰掉 |
| 错误反馈链路 | `lastOperationValidation` 已写入多处但 0 读取，需在 NodeWindow / KnowledgeGraph 中补全 |
| 多选 UI | induce / internalize 需多选节点的 UI |
| 跨图搜索 UI | diverge 需搜索浮空窗选择跨图节点 |
| Cloud Layout | 约束布局算法（Phase 2b 延后） |
| Arrangement 草稿预览 UI | 确认前展示草稿位置，碰撞判定灰/亮确认按钮 |

---

### Phase 3：功能与 UI 界面迭代优化

- 导航卡片（Dock / Expand / Hidden 三态）
- Overlay 视图 Button（沉浸浏览、Notebook 视图、未掌握视图、知识群聚焦视图）
- 笔记库（图谱节点 ↔ 笔记联动）
- 交互模式按钮图标替换（C = 放大镜，A = 星系）
- 按钮视觉动效（半透明浮空、离开 3s 淡化、滑动弹出 300ms）
- 学习历史回顾 UI（时间轴视图、State 列表、分支选择）

---

### Phase 4：AI Runtime

- Compiler / Translator / Checker / Analyser Agent 信息流连通
- 要求 Graph Engine 作为底层基础
- 存储格式从 JSON 切换为 JSONB
- 批量原子操作 `applyBatch` 已就绪（Phase 2a 已实现）

---

### MVP 阶段暂不启动

- FastAPI 后端
- Supabase 集成
- Auto Save / IndexedDB

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
function* iterateNodes(...): Generator<...> {  // Generator：惰性迭代器，C++20 std::generator 等价
    yield node  // yield：暂停并返回值，C++ co_yield 等价
}

// ✅ 允许：解释非直觉实现
return R0 * Math.sqrt(1 + node.degree)  // √(1+d) 保证 degree=0 时半径不为 0

// ❌ 禁止：解释显然行为
const node = allNodes.find(node => node.id === nodeId)  // 查找节点 ← 废话
```

## 八、跨文件意图注释

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

## 十二、空行规范

逻辑块之间可空行分隔，禁止连续大量空行。

## 十三、命令行规范

命令前写说明注释。

## 十四、Git 提交格式

**全英文**。
格式：**动词 + 模块 + 目的**（空格分隔）
**风格**：列表罗列改动的每一项：

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

**规则**：
1. 只解释 **"为什么会这样"**，不解释"这行代码在干什么"（不违反第七条）
2. 优先用 **C++ 类比**降低认知负担
3. 只标记**非直觉的框架行为**，通用 TypeScript/JS 语法不解释
4. 简单模板语法（如单个 `@click`）不需要注释，复杂的响应式链条才需要


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

## 二十一、Vue 模板语法规范

**禁止缩写**。Vue 模板中所有指令必须使用完整形式，不准使用缩写：

| 缩写 | 禁止 | 必须 |
|------|------|------|
| `@click` | ❌ | `v-on:click` |
| `@input` | ❌ | `v-on:input` |
| `@contextmenu.prevent` | ❌ | `v-on:contextmenu.prevent` |
| `:key` | ❌ | `v-bind:key` |
| `:class` | ❌ | `v-bind:class` |
| `:title` | ❌ | `v-bind:title` |
| `:value` | ❌ | `v-bind:value` |

原因：缩写形式是 Vue 特有的语法糖，对 C++ 背景开发者不透明——`:` 和 `@` 在 HTML 中无对应语义。完整形式直接表达意图：`v-on:` = "绑定事件"，`v-bind:` = "绑定属性"。
