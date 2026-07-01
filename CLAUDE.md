# Asterism

## 核心定义

- **狭义 GraphData**：`packages/graph-engine/src/types/graph_data.ts` 定义的图结构类型。
- **广义 GraphData**：一切需要持久化存储的数据（狭义 GraphData + OperationLog + 其他持久化数据）。
- **GraphEngine**：框架无关、本项目特定义下无副作用（不通过引用修改外部数据）的广义 GraphData 状态迁移引擎，是系统中所有 GraphData 转换操作的唯一入口。
  （隐患：execute 内部 `new Date().toISOString()` 产生非确定性时间戳。当前快照式 undo 无影响，若未来升级 Event Sourcing 需提升为参数由 Runtime 传入）
  - 负责：定义类型、validate / execute / compose / replay
  - 不负责：I/O、持久化、持有状态
  - 与框架无关
- **Runtime 层**：位于前端的 GraphData 状态所有者，负责持有运行时状态（currentGraph / undoStack / registry）、编排引擎操作（调 Engine → 后处理）、实现持久化 I/O。Runtime 不负责 UI 渲染和纯函数转换，一定是框架绑定的（当前为 Pinia + Vue）
- **Cytoscape 渲染层**：GraphData 的只读投影。接收 GraphData 渲染到画布，捕获交互事件后经 UI 适配层回流至 Runtime。禁止持有 GraphData 引用、禁止保存业务状态、禁止直接修改 GraphData

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

3. **Local First** — 当前用 localStorage 持久化

## 架构分层（严格单向数据流）

```
用户交互 (DOM)
    ↓
UI 适配层 (operation_controller.ts / ui_store / draft_store)
    ↓ 事件路由 + 模式/工具状态
Runtime (graph_store.ts + graph_operations.ts + graph_persistence.ts)
    ↓ 委托 Engine 纯函数转换 + 后处理
GraphEngine (@my-project/graph-engine)
    ↓ watch(currentGraph)
渲染投影层 (graph_element_mapper.ts)
    ↓ CyElements
Cytoscape Renderer (use_cytoscape_renderer.ts)
```

## 三个 Pinia Store

| Store | 职责 | 禁止 |
|-------|------|------|
| graph_store | GraphData 唯一事实源，当前图 / undoStack / registry 状态持有者 | Draft/Cytoscape 禁止进入 |
| ui_store | 用户 UI 意图（交互模式、选中工具、浮空窗） | 不保存 GraphData |
| draft_store | 临时草稿（DraftNode/DraftEdge），互斥 | 不直接进入 GraphData |


## 重要 Commit

### Phase 1

- `3755f74` — refactor-graph-isolate-cytoscape-runtime（已完成 Cytoscape 隔离）
- `57f5cc6` — refactor graph types add role discriminated union for node identity（NodeRole 第一层判别，Phase 1 类型收口）
- `0ddcbaa` — refactor graph isolate store internals and extract render layer（拆分 graph 内部实现至 utilities/，分离 render/ 渲染层）
- `f1d9649` — refactor ui interaction add right-extending column toolbar and two-level right-click exit（Phase 1 收尾）
- `8288b26` — cleanup frontend remove unused scaffold files and add coding conventions

### Phase 2a

- `e845905` — add compose base layer with ComposeResult types and applyBatch pipeline（Step 6）
- `810bd5e` — implement Step 7 arrangement compose layer（Step 7：move / adjust / orbit / path）
- `d7159fd` — implement step 8 deconstruct and diverge with spec-driven compose layer（Step 8 起步）
- `29a3880` — implement induce compose function with add_graph in execute pipeline（Step 8 核心——最大认知操作）
- `c250b77` — implement internalize compose function with child graph cleanup and scatter placement（Step 8 收尾）
- `ab736ec` — implement step 9 test coverage — 20 test files, 119 passing tests（Step 9）
- `a919a91` — complete step 10 api export reorganization with consumer annotations（Step 10）
- `58b34c3` — refactor frontend switch to engine api and cleanup duplicate code（Step 11：切 engine apply，删 9 个重复文件）
- `2aac5d7` — split operation controller extract graph operations layer（Step 11：UI 层拆分）

## 项目规模（Phase 2a 完成时）

| 区域 | 文件数 | 总行数 | 有效代码 | 注释+空行 | 说明 |
|------|:-----:|:-----:|:------:|:--------:|------|
| Engine 核心（`packages/graph-engine/src/`） | 39 | 5,492 | ~2,748 | ~2,744 | 类型、执行器、校验器、编排、基础设施 |
| Engine 测试（`packages/graph-engine/tests/`） | 21 | 2,373 | ~1,773 | ~600 | 20 测试文件 119 用例 |
| 前端（`frontend/src/`） | 24 | 5,664 | ~3,106 | ~2,558 | 3 store + 2 运行时 + 3 渲染 + 3 Vue 组件 |
| 设计文档（`docs/`） | 25 | 4,381 | — | — | 设计、spec、开发文档 |
| **合计** | **109** | **17,910** | **~7,627** | **~5,902** | + 4,381 文档 |

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
- 基础设施：碰撞检测、位置放置、跨图搜索、ID 生成
- 操作日志类型层：OperationLog / OperationLogEntry / State（树形操作树，支持 undo）
- 操作回放：replayGraph / replayToStep
- 前端已切到引擎全部 API，冗余代码已清理

**Phase 2a 完成标志**（详见 `docs/P2开发文档/P2a步骤规划.md`）：

| Step | 内容 | 可验证标志 |
|------|------|----------|
| 1-8 | 引擎骨架 → 认知操作层 | 20 测试文件 119 测试全部通过 |
| 9 | 测试覆盖 | 19 个子任务全部有测试文件 |
| 10 | 公开 API 收口 | 按 6 类组织 index.ts，26 处消费者标注，不导出内部模块 |
| 11 | 前端适配 | graph_store 切 engine apply，import 全部指向 @my-project/graph-engine，删除 9 个重复文件，交互模式去 Operation 化，常驻操作栏 |

**Phase 2a 定性标准**：引擎作为独立的 `@my-project/graph-engine` 包运行，框架无关，20 文件 119 测试。前端仅通过 graph_store + graph_operations 两个文件调引擎，所有 import 指向引擎包。

---

### Phase 2b：功能收尾 → MVP 交付

GE 的全部功能在前端完全落地，使 Cognition（除 explore / unearth）和 Arrangement 全部操作可用。

**目标**：用户可以实质性地使用 Asterism 进行学习，完整支持图谱本地持久化和操作回溯。

| 分类 | 任务 | 说明 |
|------|------|------|
| **Cognition** | induce / internalize 多选 UI | 用户在画布上框选或多个节点 → 执行归纳或内化 |
| | diverge 跨图搜索 UI | 搜索浮空窗选择跨图节点 → 创建启发节点 + 有向虚边 |
| | deconstruct 入口完善 | 已完成链路，确保 edge case 覆盖 |
| **Arrangement** | moveNode 拖拽移动 | 画布上拖拽节点 → 引擎碰撞检测 → 确认写入 |
| | orbit 环绕布局 | 选择中心 + 环绕节点 → 预览 → 确认写入 |
| | path 路径布局 | 选择轴心 + 路径节点 → 预览 → 确认写入 |
| | adjust distance / orbit | 连续调整节点位置，实时碰撞预览 |
| **数据完整性** | 哨兵加载 | 启动时自动加载上次使用的图或新建空图，保证画布非空 |
| | 图谱保存/加载 UI | saveCurrentGraph / loadGraphToCurrent 端到端链路 |
| **操作回溯** | 操作日志 + undo | `undoStack` 升级为 `OperationLog`（树形操作树） |
| | 回溯按钮（←） | 左下角 undo 按钮，cursor 边界灰掉。redo 延后 |
| **错误反馈** | lastOperationValidation 读取端 | NodeWindow / KnowledgeGraph 中渲染 error message |

**Phase 2b 完成标志 = MVP 交付**：

1. 用户可添加/删除节点和边（常驻操作栏 8 按钮）
2. 用户可折叠/展开依赖
3. 用户可执行解构、归纳、内化、发散（deconstruct / induce / internalize / diverge）
4. 用户可拖拽移动节点、使用环绕/路径布局
5. 用户可 undo 操作
6. 图谱完整持久化至 localStorage，刷新后恢复
7. 操作失败时用户可见错误提示
8. explore / unearth 保持 TODO（Phase 4 AI Runtime）

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

**全英文**。第一行为摘要行（`动词 + 模块 + 目的`），后续逐条罗列改动文件和目的：

```
define Phase 2b MVP scope with completion criteria and detailed task list

- Add MVP completion criteria: 8 verifiable end-to-end behaviors
- Expand cognition tasks: induce/internalize multi-select UI, diverge cross-graph search
- Add arrangement tasks: moveNode, orbit, path, adjust with collision preview
- Add data integrity tasks: sentinel loading, save/load graph UI, localStorage persistence

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
```

规则：

1. 摘要行：一句话说清做了什么
2. 空一行后列表罗列改动项，每项 `- 动词 文件名或模块：具体改动描述`
3. 改动项按模块分组，同模块相邻
4. 末尾附 `Co-Authored-By` 行

## 十五、回答/协作规范

说明为什么做 → 说明设计规则 → 给出代码 → 给出命令。保留原精神，适配 Claude Code 的直接文件操作模式。

## 十六、GraphData 唯一事实源（项目基石）

GraphData 是唯一事实源。修改 GraphData 的两条合法路径：
1. **原子操作**：`graph_store.applyOperation()`（单个 add/delete/update/move/fold/expand）
2. **编排操作**：`graph_operations.ts` → Engine applyBatch → `graphStore.currentGraph = ...`（deconstruct/induce/internalize/diverge 等认知操作）

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

## 二十二、设计决策权限

| 行为 | 允许 | 禁止 |
|------|------|------|
| 在对话中提供设计建议、架构方案 | ✅ | |
| 将自发的设计决策写入文档文件（`docs/` 下的任何 `.md`） | | ❌ |
| 经用户明确许可后修改文档 | ✅ | |
| 修改代码（`.ts` / `.vue` 等源文件） | ✅ 按现有规范执行 | |

规则：

1. **文档修改必须由用户明确许可后执行。** 文档 = `docs/` 目录下所有 `.md` 文件 + `CLAUDE.md` + 项目根目录 `.md`。
2. **不允许主动提出"要不要我把这个写进文档"。** 只在用户问到时回答"需要的话可以"。
3. **代码按现有规范自由修改**，无需额外确认。
4. 此规则旨在确保用户（而非 AI）是设计文档的唯一作者——AI 的产出进入对话和代码，不进设计文档。

## 二十三、设计文档层级与冲突处理

`docs/` 下三个子目录存在严格的权威层级：

```
    设计/          ← 最高权威。用户亲身书写，表达用户的核心意志和设计意图
    ↓ 主导
    开发文档/      ← 次高权威。开发指南和步骤规划，服务于实现层
    ↓ 主导
    spec/          ← 参考级。技术规格说明，由开发过程派生
```

| 层级 | 目录 | 权威 | 内容性质 |
|------|------|------|---------|
| L1 | `docs/设计/` | **最高** | 用户亲手书写的设计定义、交互规则、视觉规范。最直接反映用户意志。 |
| L2 | `docs/开发文档/` | 次高 | 开发指南、步骤规划、架构决策。服务于实现，不可违背 L1。 |
| L3 | `docs/spec/` | 参考 | 技术规格说明，由开发过程派生，可随实现演进。 |

**冲突处理规则**：

1. 出现设计冲突时，**优先参考上级文档**。L1 > L2 > L3。
2. 当开发文档中的技术决策与设计文档的意图矛盾时，以设计文档为准。
3. 当 spec 中的实现细节与开发文档矛盾时，以开发文档为准。
4. 若上级文档未覆盖某话题，下级文档的结论为有效默认值。

## 二十四、文档检索规范

### 两种检索机制

| 机制 | 触发方式 | 适用场景 |
|------|---------|---------|
| **注意力** | 默认开启，无需显式调用 | 当前上下文已有的内容、近期讨论过的规则 |
| **grep（Bash 工具）** | 显式执行 shell 命令 | 跨文件定位、精确匹配、存在性确认 |

注意力 + grep 协同使用：注意力判断"该不该搜"，grep 执行"精确搜"。

### grep 调用范式

#### 调用前（必须）

1. **先加载术语映射表**（`docs/设计/术语映射表.md`）—— 确保中文设计术语能正确映射到英文代码标识符。
2. **汇报目标**——每次 grep 前，向用户明确说明：期望通过本次 grep 理解什么内容，或达成什么目标。

```
格式示例：
"我先 grep 确认下：induce 操作从 UI 按钮到 engine 的调用链是否完整。
 搜索词：induce / composeInduce / internalize / composerInternalize，
 目标：确认数据流是否端到端连通。"
```

#### 搜索路径优先级

对于功能设计类问题，按权威层级依次检索：

```
docs/设计/        ← 第一优先。未命中才往下走
    ↓
docs/开发文档/    ← 第二优先
    ↓
docs/spec/        ← 最后检索
```

即：先 grep `docs/设计/`，无结果则 grep `docs/开发文档/`，再无则 grep `docs/spec/`。

#### 调用后

若同一目录下 grep 结果**物理分散但逻辑连贯**（同一设计概念的定义散落在文档的不同章节），应提醒用户：

> "XX 概念在 `docs/设计/01-核心定义.md` 的第 20 行、第 150 行、第 300 行分别出现，内容在逻辑上是一个整体，建议整合到一个连续段落。"

### 必须 grep 的场景（不自检，直接触发）

| 场景 | 说明 |
|------|------|
| **功能设计查证** | 当前上下文中不存在的设计概念、不确定的规则约束 |
| **跨文件连通性验证** | 某个函数/类型/变量"在哪里被调用""是否被读取""是否被导出" |
| **存在性确认** | 某个标识符/功能/组件是否存在 |
| **改动影响面评估** | 修改前查所有调用方 |
| **术语映射** | 用户说的中文术语和代码中的英文标识符之间的对应 |
| **冲突裁决** | 需要同时查 L1/L2/L3 对同一概念的表述时 |

### 不需要 grep 的场景（靠注意力，不额外调用）

| 场景 | 原因 |
|------|------|
| 已知文件路径和行号（如前面子代理已探明） | 直接 Read |
| 文件 < 100 行 | 全量 Read 成本更低 |
| 单点修改（改一个已知函数内部逻辑） | 无跨文件影响 |
| 用户明确指定"看看 XX 文件" | 直接 Read |