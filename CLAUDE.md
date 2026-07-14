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

## 前端架构设计

### UI/UX设计指导

- 对于 UX，代码中的状态设计应当遵循用户在交互时可感知的最小**交互单元**
- 对于 UI 的架构设计，应当满足用户在页面上可见的最小可分类的**视觉单元**

## 三个 Pinia Store

| Store | 职责 | 禁止 |
|-------|------|------|
| graph_store | GraphData 唯一事实源，当前图 / undoStack / registry 状态持有者 | Draft/Cytoscape 禁止进入 |
| ui_store | 用户 UI 意图（交互模式、选中工具、浮空窗） | 不保存 GraphData |
| draft_store | 临时草稿（DraftNode/DraftEdge），互斥 | 不直接进入 GraphData |

## 开发策略

**Graph Engine 是整个项目的底层核心系统**，已作为独立、框架无关的 `@my-project/graph-engine` 包实现。前端通过 `graph_store.ts` + `graph_operations.ts` 调用引擎 API。

## 开发阶段总览

* 注：项目实际内容以最新情况为准，此处仅记录历史情况。

### Phase 1：前端 Runtime 完成 ✅

1. **NodeWindow Runtime** — 统一 DraftNode 与 ExistingNode 编辑
2. **OperationToolbar Runtime** — 完善 Add Edge / Delete / Fold
3. **OperationController 收口** — 彻底封死 ui_store/draft_store 对外暴露
4. **Node Type 收口** — 引入 `NodeRole` 第一层判别，消除 `'normal'` 占位符，TS discriminated union

### Phase 2a：Graph Engine（架构核心层） ✅

将 `operation_executor.ts` / `operation_validator.ts` / `graph_utils.ts` 等前端职责聚合代码下沉为独立引擎包 `@my-project/graph-engine`：

- 框架无关（不依赖 Pinia / Vue）
- 单步操作（11 种原子操作）：apply + validate + execute + createReversal
- 批量事务：applyBatch（validate-all-first → execute-all 或整批丢弃）
- 认知编排：deconstruct / induce / internalize / diverge（compose/cognitive/）
- 布局编排：moveNode / adjustDistance / adjustOrbit / orbit / pathLayout（compose/arrangement/）
- 基础设施：碰撞检测、位置放置、跨图搜索、ID 生成
- 操作日志类型层：OperationLog / OperationLogEntry / State（树形操作树，支持 undo）
- 操作回放：replayGraph / replayToStep
- 前端已切到引擎全部 API，冗余代码已清理

**Phase 2a 完成标志**：引擎作为独立的 `@my-project/graph-engine` 包运行，框架无关。前端仅通过 graph_store + graph_operations 两个文件（非 types import）调引擎，所有 import 指向引擎包。

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

- 导航卡片
- Overlay 视图 Button
- 笔记库
- 交互模式按钮图标替换、
- 按钮视觉动效
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

- 完整设计文档：`docs/设计/`

---

## 代码规范

### 总体原则

代码服务于 **Runtime 规则表达**，而不是实现细节表达。优先描述"这个对象是什么 / 承担什么职责 / 遵守什么规则"，而不是"这行代码在干什么"。

核心：**注释解释规则，代码表达实现。**

### 变量命名规则

禁止变量单字母简写。

### 文件命名（snake_case）

所有 `.ts` 文件统一 `snake_case`：
- ✅ `graph_store.ts`, `ui_store.ts`, `graph_operation_types.ts`, `graph_persistence.ts`
- ❌ `GraphStore.ts`, `graphStore.ts`, `Graph_Store.ts`

Vue 组件文件例外：统一 **PascalCase**（Vue 生态约定）：
- ✅ `KnowledgeGraph.vue`, `NodeWindow.vue`, `OperationToolbar.vue`

### 缩进规范

**4 空格**。禁止 Tab，禁止 2 空格。

### 文件头注释

每个文件必须有文件头说明：
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

### 接口注释（interface / type / class / enum）

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

### 函数注释

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

### 注释规则推荐

以下两种情况允许注释：

1. **前端特有语法**（供 C++ 背景开发者理解）。如 `function*`、`yield`、`Proxy` 等 C++ 无直接对应的语法。
   格式：代码后同一行 `// [语法名]：[一句话解释]`。
2. **非直觉实现**。代码逻辑正确但为什么这样写不是一眼能看懂的。

### GraphData 唯一事实源（项目基石）

GraphData 是唯一事实源。修改 GraphData 的两条合法路径：
1. **原子操作**：`graphStore.applyBatch([operation])`（单个 add/delete/update/move/fold/expand 包装为单元素数组）
2. **编排操作**：`graph_operations.ts` → Engine applyBatch → `graphStore.currentGraph = ...`（deconstruct/induce/internalize/diverge 等认知操作）

### Import 组织规范

强制分组 + 空行分隔
规则：
- 每组之间空一行
- `type` import 和普通 import 不要混在同一组

### 代码问答时需要注意的地方

**用户背景**：熟悉 C++ 面向过程式编程、Java面向对象式编程、Python 基础，但不熟悉前端开发。

**用户画像、教学策略、@librarian 角色、MCP 上下文获取流程** → 已提取为独立 skill：`@teach-user`。按需获取对应skill。

### 单次调用函数直接内联

纯函数辅助逻辑如果只被一个函数调用（且不 export），**不单独拆函数**，直接在调用处写代码加功能注释。

判断标准：

| 场景 | 拆不拆 |
|------|--------|
| 纯函数辅助逻辑，只调 1 次 | ❌ 内联加注释 |
| 纯函数辅助逻辑，被 ≥2 个函数调用 | ✅ 拆为辅助函数 |
| export 为公开 API | ✅ 独立函数及文档注释 |

### Vue 模板语法规范

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

### 设计决策权限

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

### 设计文档层级与冲突处理

`docs/` 下三个子目录存在严格的权威层级：

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

### 文档检索规范

#### 两种检索机制

| 机制 | 触发方式 | 适用场景 |
|------|---------|---------|
| **注意力** | 默认开启，无需显式调用 | 当前上下文已有的内容、近期讨论过的规则 |
| **grep（Bash 工具）** | 显式执行 shell 命令 | 跨文件定位、精确匹配、存在性确认 |

注意力 + grep 协同使用：注意力判断"该不该搜"，grep 执行"精确搜"。

#### grep 调用范式

##### 调用前（必须）

1. **先加载术语映射表**（`docs/设计/术语映射表.md`）—— 确保中文设计术语能正确映射到英文代码标识符。
2. **汇报目标**——每次 grep 前，先明确：期望通过本次 grep 理解什么内容，或达成什么目标。

##### 搜索路径优先级

对于功能设计类问题，按权威层级依次检索：

```
docs/设计/        ← 第一优先。未命中才往下走
    ↓
docs/开发文档/    ← 第二优先
    ↓
docs/spec/        ← 最后检索
```

#### 必须 grep 的场景

| 场景 | 说明 |
|------|------|
| **功能设计查证** | 当前上下文中不存在的设计概念、不确定的规则约束 |
| **跨文件连通性验证** | 某个函数/类型/变量"在哪里被调用""是否被读取""是否被导出" |
| **存在性确认** | 某个标识符/功能/组件是否存在 |
| **改动影响面评估** | 修改前查所有调用方 |
| **术语映射** | 用户说的中文术语和代码中的英文标识符之间的对应 |
| **冲突裁决** | 需要同时查 L1/L2/L3 对同一概念的表述时 |

* 若没有找到，就作为不确定项标记，然后直接向用户报告