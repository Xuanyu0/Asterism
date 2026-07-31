# Asterism

## 外部参考文档

[Vue 3 官方文档](https://cn.vuejs.org/guide/introduction.html)
[HTML 基础 参考文档](https://developer.mozilla.org/zh-CN/docs/Learn_web_development/Core/Structuring_content)
[CSS 基础 参考文档](https://developer.mozilla.org/zh-CN/docs/Learn_web_development/Core/Styling_basics)
[Tailwind CSS 参考文档](https://tailwindcss.zhcndoc.com/docs/styling-with-utility-classes)
[Cytoscape 参考文档](https://js.cytoscape.org/)

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
- **工具**：前端页面中用户主动激活的状态。在此状态下，用户的画布交互（点击、拖拽）被解释为该工具特有的语义，并最终转化为对 GraphData 的修改。工具不直接操作 GraphData，通过 Runtime 层写入。目前按交互入口分为两类：
  - 常驻操作栏工具：通过工具栏按钮激活，生命周期由 `feature-tools/mediator.ts` 管理
  - 模式工具：先进入 Cogniton 或 Arrangement 模式，再选择具体操作
  - 规则：同一时刻最多一个工具处于激活状态，多个入口共享此互斥约束
- **交互逻辑层**：用户与工具的交互通道。采用"水平分层 + 垂直自包含"混合架构，以下是其包含的内容：
  - 水平分层（所有工具共享）：
    - 按钮 UI 定义：`feature-tools/toolbar/registry.ts`（图标、标签、处理器工厂）+ `GraphPermanentToolbar.vue`（渲染）
    - 生命周期管理：`feature-tools/mediator.ts`（注册、激活/取消、互斥保证）
    - 事件捕获与转发：`graph_interaction.ts`（Cytoscape 事件 → 语义事件）→ `feature-tools/mediator.ts`（转发至活跃 handler）
  - 垂直自包含（每个工具独立）：
    - 工具逻辑 + 中间变量：每个工具拥有自己的激活状态、光标样式、画布点击处理、操作构造
    - 数据修改：委托 Runtime 层 `graphStore.applyBatch`
  - 不负责：GraphData 存储、持久化、UI 模式切换

## 测试命令

```bash
# 跑所有前端测试
pnpm --filter frontend test
# 跑所有 GE 测试
pnpm --filter @my-project/graph-engine test
```

### 测试文件约定

- vitest `globals: true` 已启用。`test` / `describe` / `expect` / `beforeEach` / `afterAll` / `vi` 均为全局函数，`.test.ts` 文件中**禁止** `import { ... } from 'vitest'`。
- 使用 `test()`，禁止 `it()`。

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
4. **禁止 `watch` 使用 `deep: true`**：
   - GraphData 变更永远走引用替换（引擎返回新对象），浅层 watch 足够
   - 必要时的替代方案：去掉 `deep`，或窄化到具体叶子属性：`watch(() => store.x.y, cb)`
   - 理由：有经过测试的未知非预期行为

## 架构分层（严格单向数据流）

```
用户交互 (DOM)
    ↓
交互逻辑层 (feature-tools/)
    ├── mediator.ts         — 工具注册/激活/事件路由/互斥
    ├── types.ts            — ToolHandler 接口
    ├── toolbar/            — 常驻工具 handler（add-node, add-edge, delete, fold）
    └── cognition/          — 认知工具 handler（deconstruct）
    ↓  事件路由 via mediator
Runtime (graph/)
    ├── graph_store.ts      — Pinia store（currentGraph / undoStack / applyBatch）
    ├── graph_persistence.ts— localStorage 持久化
    └── graph_registry.ts   — 多图注册表（GraphId → GraphData）
    ↓  委托纯函数
GraphEngine (@my-project/graph-engine)
    ├── types/              — 类型定义
    ├── core/               — validate / execute / replay / reversal
    ├── compose/            — 认知编排 + 布局编排
    ├── infrastructure/     — 碰撞检测 / 位置放置 / 搜索
    └── spi/                — 持久化适配器接口
    ↓  watch(currentGraph)
渲染投影层 (cytoscape/)
    ├── graph_element_mapper.ts  — GraphData → CyElements（只读）
    ├── cytoscape_style.ts       — 视觉样式配置
    └── graph_interaction.ts     — Cytoscape 事件 → 语义事件
    ↓  CyElements
Cytoscape Renderer
    └── use_cytoscape_renderer.ts — 挂载/同步/销毁
```

## 前端架构设计

### UI/UX设计指导

- 对于 UX，代码中的状态设计应当遵循用户在交互时可感知的最小**交互单元**
- 对于 UI 的架构设计，应当满足用户在页面上可见的最小可分类的**视觉单元**

## 两个 Pinia Store

| Store | 职责 | 禁止 |
|-------|------|------|
| graph_store | GraphData 唯一事实源，当前图 / undoStack / registry 状态持有者 | Draft/Cytoscape 禁止进入 |
| ui_store | 用户 UI 意图（浮窗状态、画布焦点） | 不保存 GraphData |

## 开发策略

**Graph Engine 是整个项目的底层核心系统**，已作为独立、框架无关的 `@my-project/graph-engine` 包实现。前端通过 `graph_store.ts` 直接调用引擎 API（`applyBatch` / compose 函数）。

## 开发阶段总览

* 注：项目实际内容以最新情况为准，此处仅记录历史情况。

### Phase 1：前端 Runtime 完成 ✅

- **NodeWindow Runtime** — 统一 DraftNode 与 ExistingNode 编辑
- **OperationToolbar Runtime** — 完善 Add Edge / Delete / Fold
- **OperationController 收口** 
- **Node Type 收口** — 引入 discriminated union，消除 `'normal'` 占位符

### Phase 2a：Graph Engine（架构核心层） ✅

将前端职责聚合代码下沉为独立引擎包 `@my-project/graph-engine`：
- 框架无关（不依赖 Pinia / Vue）
- 11 种原子操作的 validate + execute + createReversal
- 批量事务 applyBatch（全量验证 → 全部执行或整批丢弃）
- 认知编排（deconstruct / induce / internalize / diverge）与布局编排（move / orbit / path 等）
- 碰撞检测、位置放置、跨图搜索、ID 生成等基础设施
- 操作日志（OperationLog / State）与回放（replayGraph / replayToStep）
- 前端已全部切到引擎 API，冗余代码已清理

---

### Phase 2b：功能收尾 → MVP 交付

GE 的全部功能在前端完全落地，使 Cognition（除 explore / unearth）和 Arrangement 全部操作可用。

**目标**：用户可以实质性地使用 Asterism 进行学习，完整支持图谱本地持久化和操作回溯。

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

## 设计文档

- 完整设计文档：`docs/设计/`

---

## 代码规范

### 总体原则

代码服务于 **Runtime 规则表达**，而不是实现细节表达。优先描述"这个对象是什么 / 承担什么职责 / 遵守什么规则"，而不是"这行代码在干什么"。

核心：**注释解释规则，代码表达实现。**

### 变量命名规则

* 长度随作用域变化（即：局部变量短小即可）
* 模块级作用域或对象内部跨多个函数体的共享变量命名必须明确，可以被检索

### 文件命名（snake_case）

所有 `.ts` 文件统一 `snake_case`：
- ✅ `graph_store.ts`, `ui_store.ts`, `graph_operation_types.ts`, `graph_persistence.ts`
- ❌ `GraphStore.ts`, `graphStore.ts`, `Graph_Store.ts`

其他两类：

1. **Vue 组件文件**（`.vue`）：统一 **PascalCase**（Vue 生态约定）
   - ✅ `KnowledgeGraph.vue`, `NodeWindow.vue`, `OperationToolbar.vue`

2. **Vue 组合式函数**（以 `use` 开头的 `.ts` 文件）：统一 **camelCase**（Vue 生态约定 + 区分于普通工具函数）
   - ✅ `useRenderer.ts`, `useDragPosition.ts`, `useOverflowDetection.ts`
   - ❌ `use_renderer.ts`, `useDrag_Position.ts`

### 缩进规范

**4 空格**。禁止 Tab，禁止 2 空格。

### 注释规范

* 项目里最严格的注释规范的落实文件可以参考：`frontend/src/graph/graph_store.ts`

#### 写注释的核心前提

* 当代码本身没有办法或者很难通过一种显而易见的方法表现出它的**意图、功能、使用限制、内在结构**的时候，则才需要使用到注释。
* 否则，应该尽可能尝试使用更优秀，且是唯一决定程序行为事实的**代码**来表达。

#### 写单行注释的推荐情况

> 注：以下情形仅供参考，不涵盖所有情况

* 法律信息
* 提供信息：包括编写时决策的上下文或者程序在此处容易遗漏的重要上下文，或者对单行代码中的细微值得说明之处，通过注释放大
* 对不寻常的实现解释意图：可能包括作者本身的权衡
* 阐释陌生代码：如小众外部 API 库的调用规则说明
* 警示后人：防止再度由于同一种原因导致 BUG
* TODO 说明：代码中占位并给出初步编写方向

#### 对于 JSDoc 注释的规范

核心原则：根据实际需要，灵活选择 JSDoc 注释，因为这种注释很贵
* 最低编写限度：至少包含说明条目（可以是对其功能、角色 / 作用、架构地位的说明）
* 按需：引入函数传入的参数说明条目
* 按需：引入注释对象在项目架构中的地位
* 按需：引入其他个人觉得必要的条目
* 对于契约复杂的函数：必须编写使用 调用契约/代码修改契约 条目
* 对于有潜在风险的函数：必须编写注意条目

几点说明：
1. JSDoc 本质是 markdown。各条目的小节标题后必须空一行，再写内容。
   空行 = markdown 段落分隔。不加空行则 LSP hover 浮空窗会把标题和后续内容挤成同一段，不换行显示。
2. 文件头注释的编写可以直接参考这里的建议
3. 公开函数一定要有 JSDoc，非公开函数、接口等按需决定
4. 文件头不要写文件名
5. 注释应该按照其所在的地方有针对性

JSDoc 基础模板：
```
/**
 * 说明：
 *     
 *     (...)
 */
```

扩展条目按需追加，格式同"说明"，小节标题后空一行再写内容。如：
```
/**
 * 说明：
 * 
 *     (...)
 *
 * 参数：
 *
 *     paramName — 是什么 / 从哪来 / 特殊规则
 *
 * 调用契约：
 *
 *     (...)
 *
 * 代码修改契约：
 *
 *     (...)
 *
 * 注意：
 *
 *     (...)
 */
```

#### 注释规则推荐

1. **非直觉实现**。代码逻辑正确但为什么这样写不是一眼能看懂的。

### GraphData 唯一事实源（项目基石）

GraphData 是唯一事实源。修改 GraphData 的两条合法路径：
1. **原子操作**：`graphStore.applyBatch([operation])`（单个 add/delete/update/move/fold/expand 包装为单元素数组）
2. **编排操作**：Engine compose 函数返回新 GraphData → `graphStore.currentGraph = ...`（deconstruct / induce / internalize / diverge 等认知和布局操作）

### Import 组织规范

强制分组 + 空行分隔
规则：
- 每组之间空一行
- `type` import 和普通 import 不要混在同一组

### 单次调用函数是否内联

内联的价值是防止阅读时跳来跳去，但前提是和提取成工具函数后一样"职责清晰、分块明显、注意力引导明确"。判断依据是**参数数量**——参数数量约等于提取的理解成本与耦合度：

| 场景 | 拆不拆 |
|------|--------|
| 无参 / 单参，只调 1 次 | ✅ 允许提取（提取成本低、函数名即注意力引导），不强制内联 |
| 多参，只调 1 次 | ❌ 倾向内联（多参提取会把与主流程的耦合摊到函数签名上，读者仍需停下来想） |
| 被 ≥2 个函数调用 | ✅ 拆为辅助函数 |
| export 为公开 API | ✅ 独立函数及文档注释 |

### 私有函数放在文件末尾

模块内部辅助函数（不 export）按调用链从公开到私有的顺序排列，即私有函数放在文件末尾。阅读者自上而下先看到公开 API，按需跳转到末尾的私有实现。

```ts
// 推荐的顺序
export function publicApi() { ... }          // 公开函数在前

function helperA() { ... }                   // 私有辅助在末尾
function helperB() { ... }
```

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

### 文档层级与冲突处理

`docs/` 下三个子目录存在严格的权威层级：

| 层级 | 目录 | 角色 | 生命周期 | 内容 |
|------|------|------|---------|------|
| L1 | `docs/设计/` | 产品 spec | 持久 | 用户亲手书写的设计定义、交互规则、视觉规范。描述产品意图与用户体验目标。 |
| L2 | `docs/*开发文档/` | 过程文档 | 临时（完成后归档） | 步骤文档（步骤划分、进度跟踪、难度评估、产出 commit 的引用）和发现文档（BUG / 改进 / 不确定项）。服务于实现过程，不可违背 L1。 |
| L3 | `*开发文档/提示词/` | 施工手册 | 一次性 | Agent 执行时的工程契约。包含功能需求、验收标准、scope guard、交互规则。溯源引用 L1 |

**冲突处理规则**：

1. 出现设计冲突时，**优先参考上级文档**。L1 > L2 > L3。
2. 当施工 spec（L3）与设计文档（L1）的意图矛盾时，以设计文档为准。
3. 若施工 spec 未覆盖某话题，开发文档的结论为有效默认值。否则就根据L1设计自行推导，最后作为不确定项向上报告

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