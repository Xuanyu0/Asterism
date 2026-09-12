# Asterism

## 核心定义

- **狭义 GraphData**：`packages/graph-engine/src/types/graph_data.ts` 中需要持久化存储的图结构类型。
- **广义 GraphData**：需要持久化存储的图数据 + 由持久化存储图数据在运行时派生出来的数据。
- **GraphEngine**：框架无关、本项目特定义下无副作用（不通过引用修改外部数据）的广义 GraphData 状态迁移引擎，是系统中所有 GraphData 转换操作的唯一入口。
  （时间戳约定：execute 层不自行生成时间戳，由调用方（Runtime）经裸参数 `executedAt`（本批次执行的时刻）统一传入。对象级 createdAt/updatedAt = 操作携带值 ?? executedAt（逆元快照携带历史值 → undo 恢复历史时刻）。`new Date()` 兜底仅存于调用方缺省路径：`core/replay.ts`（回放时刻）与前端 `commitBatchToGraphs`）
  - 负责：定义类型、validate / execute / compose / replay
  - 不负责：I/O、持久化、持有状态
  - 与框架无关
- **Runtime 层**：位于前端的 GraphData 状态所有者，负责持有运行时状态、编排引擎操作（调 Engine → 后处理）、实现持久化 I/O。Runtime 不负责 UI 渲染和纯函数转换，一定是框架绑定的（当前为模块级单例 + Vue）。Runtime 层内部再分两层：
  - **graph_store.ts（数据核心）**：公开能力为四入口——唯一切换图谱（`loadGraphToView`）、唯一图操作（`commitBatchToGraphs`）、唯一回溯（`undo` / `redo`）。
  - **use-case/（业务用例层）**：图数据业务逻辑的封装，经 store 公开状态访问共享运行时数据，不持有状态本身。依赖方向：业务 → 用例层 → store（单向）
- **Cytoscape 渲染/交互层**：GraphData 的只读映射/拷贝。接收 GraphData 渲染到画布，捕获交互事件后经交互逻辑层（feature-tools/）回流至 Runtime。禁止持有 GraphData 引用、禁止保存业务状态、禁止直接修改 GraphData
- **工具**：前端页面中用户主动激活的状态。在此状态下，用户的画布交互（点击、拖拽）被解释为该工具特有的语义，并最终转化为对 GraphData 的修改。工具不直接操作 GraphData，通过 Runtime 层写入。目前按交互入口分为两类：
  - 常驻操作栏工具：通过工具栏按钮激活，生命周期由 `feature-tools/mediator.ts` 管理
  - 模式工具：先进入 Cognition 或 Arrangement 模式，再选择具体操作
  - 规则：同一时刻最多一个工具处于激活状态，多个入口共享此互斥约束
- **交互逻辑层**：用户与工具的交互通道。采用"水平分层 + 垂直自包含"混合架构，以下是其包含的内容：
  - 水平分层（所有工具共享）：
    - 按钮 UI 定义：`feature-tools/toolbar/config.ts`（图标、标签、处理器工厂）+ `GraphPermanentToolbar.vue`（渲染）
    - 生命周期管理：`feature-tools/mediator.ts`（注册、激活/取消、互斥保证）
    - 事件捕获与转发：`cytoscape/cy_interaction.ts`（Cytoscape 事件 → 语义事件）→ `feature-tools/mediator.ts`（转发至活跃 handler）
  - 垂直自包含（每个工具独立）：
    - 工具逻辑 + 中间变量：每个工具拥有自己的激活状态、光标样式、画布点击处理、操作构造
    - 数据修改：经工具层用例 `useGraphOperation.commitToCurrentGraph`（单图）或 `commitBatches`（跨图批次）委托 Runtime（提交 + 校验同步）
  - 不负责：GraphData 存储、持久化、UI 模式切换

## 命令

```bash
# 启动前端开发服务器
pnpm dev
# 跑所有前端测试
pnpm --filter frontend test
# 跑所有 GE 测试
pnpm --filter @my-project/graph-engine test
# 前端类型校验
pnpm --filter frontend type-check
# GE 类型校验
pnpm --filter @my-project/graph-engine type-check
# 格式化全项目代码（frontend + graph-engine + docs + md）
pnpm format
# 格式化单个文件（自动读取根 .prettierrc.json 配置）
npx prettier --write <文件路径>
```

### 测试文件约定

- vitest `globals: true` 已启用。`test` / `describe` / `expect` / `beforeEach` / `afterAll` / `vi` 均为全局函数，`.test.ts` 文件中**禁止** `import { ... } from 'vitest'`。
- 使用 `test()`，禁止 `it()`。
- 测试物理位置：前端 `frontend/src/**/*.test.ts`（单元 / 组件）+ `frontend/tests/**`（Runtime 集成）；引擎仅 `packages/graph-engine/tests/**`。

## 项目定位

- **Graph Engine 开发目标**：让用户当前的学习 / 认知 / 研究状态可视化、可形式化表达。
- **Asterism** 在管理学习者与知识之间的**学习状态**，而不是认知/知识本身。

## 技术栈

### 前端

- Vue 3 (Composition API + `<script setup>`)
- TypeScript 6.0
- 模块级单例 store（`useGraphStore`，非 Pinia）
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

### MVP 阶段暂不启动

- FastAPI 后端
- Supabase 集成

## 核心原则（必须遵守）

1. **GraphData 是唯一事实源（Single Source of Truth）**
2. **Cytoscape 只是 Renderer**，永远不是事实源
3. **Local First** — 当前用 localStorage 持久化
4. **禁止 `watch` 使用 `deep: true`**：
   - GraphData 变更永远走引用替换（引擎返回新对象），浅层 watch 足够
   - 必要时的替代方案：去掉 `deep`，或窄化到具体叶子属性：`watch(() => store.x.y, cb)`
   - 理由：有经过测试的未知非预期行为

## 文档地图与任务落点

先按「我要做的事」定方向，再读「先读」。

| 我要做的事 | 先读 |
| --- | --- |
| 查设计概念 / 设计名词 | [设计术语表](docs/设计/设计术语表.md) |
| 查前端 / Graph Engine 代码标识符 | [开发术语表](docs/开发文档/开发术语表.md) |
| 查交流口径 / 项目术语 | [项目术语表](项目术语表.md) |
| 写 / 改代码注释 | [注释资料](FOR-AGENTS/注释资料.md) |
| 了解设计意图 / 交互规则 | [docs/设计/](docs/设计/)（L1，最高权威，只读） |
| 查开发历史 / 过程文档 | [docs/开发文档/](docs/开发文档/)（历史快照，不代表当前 API） |
| 了解目录局部规则 | 该目录及祖先目录的 `AGENTS.md`（见下） |
| 理解架构 / 依赖方向 | 本文件「项目架构（分层森林图 · 顶层视图）」节 |
| 查阅外部技术文档 | [Vue 3](https://cn.vuejs.org/guide/introduction.html)、[HTML](https://developer.mozilla.org/zh-CN/docs/Learn_web_development/Core/Structuring_content)、[CSS](https://developer.mozilla.org/zh-CN/docs/Learn_web_development/Core/Styling_basics)、[Tailwind CSS](https://tailwindcss.zhcndoc.com/docs/styling-with-utility-classes)、[Cytoscape](https://js.cytoscape.org/) |

当前版本 tag：`v0.2.0`。

### 目录就地规则（AGENTS.md）

各目录的就地约定写在该目录的 `AGENTS.md`：

- 引擎：[packages/graph-engine/AGENTS.md](packages/graph-engine/AGENTS.md)
- 渲染：[frontend/src/cytoscape/AGENTS.md](frontend/src/cytoscape/AGENTS.md)
- 组件：[frontend/src/components/AGENTS.md](frontend/src/components/AGENTS.md)
- 组合式函数：[frontend/src/composables/AGENTS.md](frontend/src/composables/AGENTS.md)
- 开发工具：[frontend/src/dev/AGENTS.md](frontend/src/dev/AGENTS.md)

**发现机制**：改动任何目录前，先查该目录及其**祖先目录**的 `AGENTS.md`。
**优先级**：`AGENTS.md` 可覆盖 CLAUDE.md 的**默认习惯约定**（且必须在该文件内显式声明这是覆盖），但**不得覆盖核心原则与架构边界**。

### 术语表时效

#### 时间戳

**设计术语表**：`Last updated: 2026-09-07`
**开发术语表**：`Last updated: 2026-09-12`
**项目术语表**：`Last updated: 2026-09-12`

## 项目架构（分层森林图 · 顶层视图）

模型：以 **Asterism** 为根，其下是 **7 个核心分层**，层间用 `↓` 给出数据流。每层给一句自然语言定义，即该层的理想；层的内部结构即现实，在各自的**子架构**文件里递归展开。

> 图例：`≝` 定义，纯自然语言，其本身即集合；`↓` 层间数据流；`←` 旁注；`【】` 标记；`→` 流转或路由。语言分工：**理想用自然语言、现实用代码标识符**。完整模型与图例见 [FOR-AGENTS/架构/README.md](FOR-AGENTS/架构/README.md)。

```text
Asterism
    ├── 用户交互          ≝ 用户与浏览器 DOM 的原生输入事件源   ← 非目录层，仅作数据流起点
    │       ↓ 用户输入被 Cy 捕获  ← cy.on('tap' / 'dragfree')
    ├── 渲染与交互层      ≝ 只读映射 Cytoscape 外部库，并把其原始事件翻译为语义事件的模块集合
    │       ↓ 语义事件  ← onNodeClicked / onCanvasClicked
    ├── 交互逻辑层        ≝ 负责工具注册、激活与互斥，并把语义事件路由到活跃工具的模块集合
    │       ↓ 提交写入  ← commitToCurrentGraph(operations)
    ├── Runtime 状态层    ≝ 持有 GraphData 状态、编排引擎操作、并实现持久化的模块集合
    │       ↓ 委托纯函数  ← result = applyBatches(store.graphRegistry, batches, executedAt)
    ├── GraphEngine       ≝ 框架无关、无副作用地完成 GraphData 转换与校验的模块集合
    │       ↓ 返回新 GraphData  ← GraphView 引用替换 → renderer.syncFromGraphData
    ├── 组件与装配层      ≝ 承载视图单元与页面装配的模块集合
    └── 共享组合式函数    ≝ 工具与组件共用的通用组合式函数集合   ← 横切共享，不在数据流上
```

> 各层子架构（递归）：[FOR-AGENTS/架构/子架构/](FOR-AGENTS/架构/子架构/)（用户交互无目录）　·　契约（规范）：[契约图.md](FOR-AGENTS/架构/契约图.md)　·　依赖：[依赖图.md](FOR-AGENTS/架构/依赖图.md)　·　模型与图例：[README.md](FOR-AGENTS/架构/README.md)

## 前端架构设计

### UI/UX设计指导

- 对于 UX，代码中的状态设计应当遵循用户在交互时可感知的最小**交互单元**
- 对于 UI 的架构设计，应当满足用户在页面上可见的最小可分类的**视觉单元**

---

## 代码规范

### 变量命名规则

- 长度随作用域变化（即：局部变量短小即可）
- 模块级作用域或对象内部跨多个函数体的共享变量命名必须明确，可以被检索

### 标识符别名（禁止）

禁止为项目**内部标识符**创建别名（第二个名字）。包括：

- 导出别名：`export { InternalName as PublicName }`
- 导入改名：`import { InternalName as LocalName }`
- 用 `type B = A` 为已有类型起等价别名；或为同一概念维护两个类型 / 函数 / 常量名（含标注"向后兼容别名"者）

一个概念只对应一个标识符。需要更名时，直接改定义处并同步全部引用，不保留别名。
理由：别名使同一概念出现两个可检索名，破坏 grep 定位与一致性（同义两名）。本项目唯一用户是开发者本人，旧名无外部兼容负担——这是「早期开发策略」（见下）中"不写兼容代码"在标识符层的落地。

> 注：`type NodeData = KnowledgeNodeData | ReferenceNodeData` 这类**并集/派生定义**是定义新概念，不属别名，允许。

### 文件命名（snake_case）

所有 `.ts` 文件统一 `snake_case`：

- ✅ `graph_store.ts`, `graph_registry.ts`, `graph_persistence.ts`
- ❌ `GraphStore.ts`, `graphStore.ts`, `Graph_Store.ts`

其他两类：

1. **Vue 组件文件**（`.vue`）：统一 **PascalCase**（Vue 生态约定）
   - ✅ `GraphFloatingWindow.vue`, `GraphPermanentToolbar.vue`, `NotificationPanel.vue`

2. **Vue 组合式函数**（以 `use` 开头的 `.ts` 文件）：统一 **camelCase**（Vue 生态约定 + 区分于普通工具函数）
   - ✅ `useRenderer.ts`, `useDragPosition.ts`, `useOverflowDetection.ts`
   - ❌ `use_renderer.ts`, `useDrag_Position.ts`

### 缩进规范

**4 空格**。禁止 Tab，禁止 2 空格。

### 注释参考资料

任何要编写或修改代码注释（含单行注释与 TSDoc）的任务，动手前必须先阅读：[注释资料](FOR-AGENTS/注释资料.md)

委派编码子代理（fixer / designer 等）时，若其任务会编写或改动代码注释，须在委托指令中要求该子代理先阅读上述注释资料。

### Import 组织规范

强制分组 + 空行分隔
规则：

- 每组之间空一行
- `type` import 和普通 import 不要混在同一组

### 单次调用函数是否内联

内联的价值是防止阅读时跳来跳去，但前提是和提取成工具函数后一样"职责清晰、分块明显、注意力引导明确"。判断依据是**参数数量**——参数数量约等于提取的理解成本与耦合度：

| 场景 | 拆不拆 |
| --- | --- |
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

**禁止缩写**。Vue 模板中所有指令必须使用完整形式，不准使用@或者:缩写：

### Markdown 文档格式

- 根 `.prettierignore` 已排除 `*.md`：Markdown **不参与 Prettier 格式化**，由手工维护。
- 表格统一**紧凑式**：单元格两侧各一个空格（`| 中文 | 英文 | 含义 |`），分隔行统一 `| --- | --- | --- |`，**不补空格对齐列宽**。

## 早期开发策略

- 在目前这个早期开发阶段，不准任何形式的静默退出。具体做法可参考`graph_store.ts`，思想是报错代码不要打扰核心逻辑代码的阅读
  - 冗长错误消息的构造，提取为私有辅助函数进行调用
  - 校验结果统一模式：GE 产出 `ValidationResult`，前端用例层统一写入 `graphStore.lastValidationResult`，UI 按 `issue.code` 区分提示；业务规则校验（如 title 非空、根图谱间唯一）下沉 GE 图级校验（注册表全量可查），前端不散落
- 本项目当前唯一用户是**开发者本人**（无外部 / 第三方用户）：不写面向外部用户的**数据兼容与版本迁移代码**，以保持代码简洁、核心逻辑突出。破坏性变更（含持久化字段 / 结构）由开发者自行承担——变更前按需备份本地数据（localStorage）
- 写完代码后自查代码本身是否利于未来变更（ETC：Easier To Change，易于变更），否则向上报告

## 设计决策权限

| 行为 | 允许 | 禁止 |
| --- | --- | --- |
| 在对话中提供设计建议、架构方案 | ✅ |  |
| 将自发的设计决策写入文档文件（`docs/` 下的任何 `.md`） |  | ❌ |
| 经用户明确许可后修改文档 | ✅ |  |
| 修改代码（`.ts` / `.vue` 等源文件） | ✅ 按现有规范执行 |  |

规则：

1. **文档修改必须由用户明确许可后执行。** 文档 = `docs/` 目录下所有 `.md` 文件 + `CLAUDE.md` + 项目根目录 `.md`。
2. **不允许主动提出"要不要我把这个写进文档"。** 只在用户问到时回答"需要的话可以"。
3. **代码按现有规范自由修改**，无需额外确认。
4. 此规则旨在确保用户（而非 AI）是设计文档的唯一作者——AI 的产出进入对话和代码，不进设计文档。

## 文档层级与冲突处理

`docs/` 下三个子目录存在严格的权威层级：

| 层级 | 目录 | 角色 | 生命周期 | 内容 |
| --- | --- | --- | --- | --- |
| L1 | `docs/设计/` | 产品 spec | 持久 | 用户亲手书写的设计定义、交互规则、视觉规范。描述产品意图与用户体验目标。 |
| L2 | `步骤/` | 过程文档 | 临时（完成后归档） | 步骤文档（步骤划分、进度跟踪、难度评估、产出 commit 的引用）和发现文档（BUG / 改进 / 不确定项）。服务于实现过程，不可违背 L1。 |
| L3 | `提示词/` | 施工手册 | 一次性 | Agent 执行时的工程契约。包含功能需求、验收标准、scope guard、交互规则。溯源引用 L1 |

**冲突处理规则**：

1. 出现设计冲突时，**优先参考上级文档**。L1 > L2 > L3。
2. 当施工 spec（L3）与设计文档（L1）的意图矛盾时，以设计文档为准。
3. 若施工 spec 未覆盖某话题，开发文档的结论为有效默认值。否则就根据 L1 设计自行推导，最后作为不确定项向上报告

## 该项目 Debug 的特效药

**注意**：修 BUG 时，不要一直推测，如果发现一个 BUG 有多个不确定的修改方向，应主动和用户协商尝试使用以下 Debug 的方法

- 个人推荐首先尝试 log 大法：在项目的流单向数据流下，专治**某一层数据修改异常**、**设计与执行不一致**、**没有 Debug 线索**
- 其次是针对 GE 的单元测试：GE 纯函数式编程，输出可复现。
