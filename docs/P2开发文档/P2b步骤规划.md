# Phase 2b — 功能收尾 → MVP 交付

## 总体方向

1. **首要任务**：实现多根图谱切换（保存/加载/切换 UI），让用户能管理多个独立知识图谱。此功能对前端的实际使用体验最为关键。
2. **核心功能**：落实 Cognition（induce / internalize 多选 UI、diverge 跨图搜索）和 Arrangement（moveNode 拖拽、orbit / path 布局、adjust 连续调整）全部操作的前端端到端链路。
3. **共依赖优先**：先开发 Cognition 和 Arrangement 共同依赖的基础能力（多选机制、交互模式框架），再分别实现各操作。
4. **Undo / Redo 延后**，置于 Phase 2b 末尾。
5. **文档层级继承**：任何新功能的加入，必须先在设计文档（`docs/设计/`）完成概要设计，再拟定对应开发文档（`docs/开发文档/`），如有必要可写 spec（`docs/spec/`）。始终确保下级文档中的功能设计概念在上游文档中有明确继承来源——开发文档中的技术决策必须溯源到设计文档的意图，spec 中的实现细节必须溯源到开发文档的规划。

---

## 开发范式指导

以下范式来自游戏业界经过验证的团队工程实践，经提取后适配至 Asterism 的单人上下文。每一条在本项目中均有对应的技术手段或组织方式落地。

### 1. 逻辑层与表现层彻底分离

**核心主张**：游戏逻辑必须能在不启动游戏引擎、不挂载 UI、不依赖渲染的条件下独立运行和测试。表现层只读取逻辑层的状态然后画在屏幕上。

**本项目落地**：

- GraphEngine（`@my-project/graph-engine`）是框架无关的纯函数包——不依赖 Pinia / Vue / Cytoscape。119 个与核心功能逻辑挂钩的测试在 vitest 里直接跑，不启动浏览器。
- Cytoscape 渲染层是 GraphData 的只读投影——禁止持有 GraphData 引用、禁止保存业务状态、禁止直接修改 GraphData。
- 架构分层严格单向：`UI 适配层 → Runtime → GraphEngine → 渲染投影层 → Cytoscape`。

### 2. 改一行代码到看见效果不超过 30 秒

**核心主张**：日常 UI / 交互 / 视觉参数的迭代循环（改值 → 验证 → 确认）必须在不打断心流的状态下快速完成。

**本项目落地**：

- Vite HMR（热模块替换）覆盖了全部 Vue 模板、Tailwind CSS、TypeScript 业务逻辑——保存文件到浏览器刷新 < 1 秒。
- 字体大小、节点大小、颜色、按钮位置、动效时长、交互逻辑、错误提示呈现——以上全部改动即时可见，不需要重启、不需要手动走到测试点。
- 仅 Cytoscape 实例初始化参数（`onMounted` 中创建）改动需要 F5 刷新页面，2-3 秒，仍远低于 30 秒阈值。
- 明确区分 UI 组件，组件在界面上的布置，UI 交互逻辑在项目中不同的位置。从而达到修改代码极其便捷。

### 3. 先想清楚功能实现在页面上的反馈再写代码

**核心主张**：在动手写代码前，先明确操作的完整 UI 交互流程：入口在哪里、用户每一步看到什么、操作成功/失败时视觉反馈是什么。先定义架构边界，再定义每步用户交互，最后才写代码实现。

**本项目落地**：Phase 2b 的 Step 1（交互模式架构设计与反馈规范）即在写代码前定义 Cognition 和 Arrangement 两种模式下全部操作的 UI 交互流程，包含：模式切换方式、子工具选择、用户每步操作顺序、前端即时反馈、确认/取消机制、完成状态、错误状态。

### 4. 部分验证先行——在投入全量实现前用最小成本检验设计假设

**来源**：任天堂 EPD（荒野之息 2D 原型）。

**核心主张**：在写全量代码之前，先用最简原型验证核心假设。荒野之息的 2D 原型用基本几何图形验证物理、化学、温度等所有交互规则——规则全部跑通后才开始做 3D。本质是把"设计是不是对的"从"代码是不是对的"里剥离出来。

**本项目落地**：

- 引擎侧的 compose 函数接受 `{ dryRun: true }` 参数——只校验不执行，用于操作正式提交前预判合法性。
- Step 1 的交互架构设计本身即是一种"纸上原型"——在代码写出来之前，通过设计文档逐步骤走通每条操作路径，发现流程断点。比起写一半发现走不通再推倒，纸上修改成本为零。

## 开发步骤

### Step -1：设计文档补完

**背景**：CLAUDE.md 的文档层级继承规则（第六条）要求"开发文档中的技术决策必须溯源到设计文档的意图"。但当前代码中已存在一系列设计层面的概念（架构分层、操作类型系统、编排契约、操作日志模型、验证系统、逆转机制等），仅在 `开发文档/` 或代码中定义，在 `设计/` 下没有对应来源。

**目标**：扫描代码与开发文档中已有的设计层面概念，将 `docs/设计/` 下缺失的内容补完。

**原则**：

- 只补充**已存在于代码或开发文档中**的概念——不创造新设计
- 只补充**设计层面**的内容（架构、语义、契约）——不搬运实现细节
- 写入位置遵循既有分类逻辑（核心定义进 `01-核心定义.md`，交互模式进 `02-交互设计.md` 等）
- 语言风格与既有设计文档一致（`*` 列表、定义/规则/约束结构）

**待补完内容**：

| # | 概念 | 现有位置 | 补入文档 |
|---|------|---------|---------|
| 1 | 操作日志树模型（两层、分支语义、State 标签） | `operation_log.ts`、`开发指南.md` | `01-核心定义.md` |
| 2 | 逆转/逆操作系统（全覆盖、捕获前状态） | `reversal.ts`、`开发指南.md` | `01-核心定义.md` |

---

### Step 0：架构调整 — GraphRegistry 归入 Runtime ✅ 已完成

**背景**：Phase 2a 将 `graph_registry.ts`（`Map<GraphId, GraphData>`）随 compose 层迁入引擎，但按核心定义：

- Registry 不持久化 → 不属于广义 GraphData
- 不持久化的数据结构 → 不属于 GraphEngine 职责
- GraphEngine 是纯函数引擎，不持有状态 → `registerGraph` 等写操作不应在 `execute.ts` 中出现

**目标**：将 GraphRegistry 的类型定义和实现从 engine 迁移至前端 Runtime，清理 `execute.ts` 中的副作用调用。

**子任务**：

| # | 内容 | 注意事项 |
|---|------|---------|
| 0.1 | 确定迁移方案：引擎的 `GraphRegistry` 类型引用（import type）完全移除 | 跨图搜索（diverge/induce）的 compose 层只读 registry——可以接受由 Runtime 注入的查找函数 `(graphId) → GraphData | undefined`，不依赖具体 Map 实现 |
| 0.2 | 将 `graph_registry.ts` 从 `packages/graph-engine/src/infrastructure/` 迁至 `frontend/src/graph/utilities/` | 更新所有 import |
| 0.3 | 移除 `execute.ts` 中 `executeAddGraph` / `executeDeleteGraph` 对 `registerGraph` / `unregisterGraph` 的调用 | `executeAddGraph` 只做校验和返回结果，不操作 registry。registry 写操作由 Runtime 在 `applyBatch` 返回后统一处理（已有 `graph_store.registerNewGraph` 可覆盖持久化 + registry） |
| 0.4 | 更新 `graph_store.ts` 中 registry 相关逻辑，确认 `initRegistry`、`registerNewGraph`、`getGraphById` 等不受影响 | |
| 0.5 | 更新 `graph_operations.ts` 中 registry 传入逻辑，确认 compose 层的只读查询仍能工作 | 引擎 compose 函数目前接受 `registry` 参数做跨图搜索——改为接受查找函数 |
| 0.6 | 运行全部测试（engine 119 + 前端），确认无回归 | |
| 0.7 | 清理引擎 `packages/graph-engine/src/infrastructure/` 目录，如仅剩 `graph_registry.ts` 则删除该目录 | |

**验收标准**：
- `packages/graph-engine` 不再导出 `graph_registry` 相关函数
- `execute.ts` 不再调用 `registerGraph` / `unregisterGraph`
- 前端所有 registry 操作集中在 `graph_store.ts` 中
- 测试全部通过

---

### Step 1：规则系统架构定位与前端入口规划 ✅ 1.1 已完成

**目标**：
1. 确定规则系统在架构中的定位，完成引擎层规则校验路径统一（1.1）。
2. 决策 `applyBatch` 在前端的统一入口是否完全落入 `graphStore`（1.2，待决策）。
3. 完成交互模式代码架构设计与错误反馈机制设计（1.3）。
4. 明确所有操作的 UI 交互流程规范（1.4）。

#### 1.1 规则系统的架构定位 ✅ 已完成

**已完成的核心改造**：

| 决策 | 实现 |
|------|------|
| `applyBatch` 作为唯一入口 | `pipeline.ts` 新增 Phase 3 全局规则校验；`applyOperation` 已彻底删除 |
| 全局规则表 | 新建 `core/checkers/global_rules_table.ts`，所有全局规则签名统一为 `(graph) => ValidationIssue[]` |
| 局部规则清理 | `validate.ts` 只保留操作前提条件校验（ID 重复、节点存在、位置有效、折叠条件） |
| 全图体检复用 | `graph_validator.ts` 直接调用 `runGlobalRules(graph)` |
| 类型字段对齐 | `ValidationIssue.level` → `severity`；`ComposeIssue` 补齐 `code` |
| 类型文件迁移 | `compose/types.ts` → `types/compose_types.ts` |

**执行流程**：

```
调用方
  ↓ applyBatch(ops)
  ├─ Phase 1: 局部规则校验（操作前提）
  ├─ Phase 2: dry-run execute → resultGraph
  ├─ Phase 3: 全局规则校验 resultGraph
  │   └─ 任一 error → 整批丢弃
  │   └─ 全部通过 → 正式返回 resultGraph
  └─ 返回 GraphData + validation
```

**全局规则开关**：`BatchOptions.globalRulesTable?: GlobalRulesTable`，默认 `DEFAULT_GLOBAL_RULES_TABLE` 全部开启，可单独关闭指定规则。

#### 1.2 applyBatch 前端入口统一（待 Step 1.2 决策）

**当前状态**：

Step 1.1 完成后，前端修改 GraphData 已全部通过引擎 `applyBatch`，但入口不统一：

| 调用方 | 入口 | 原因 |
|--------|------|------|
| 单步操作（add/delete/update/move/fold） | `graphStore.applyBatch([op])` | 只操作 currentGraph |
| 认知操作（deconstruct/induce/internalize/diverge） | 直接 `import { applyBatch }` 对 parent/child/peer 图分别执行 | 需要跨图操作，graphStore 只持有 currentGraph |

**待决策问题**：是否所有 `applyBatch` 调用都应统一经过 `graphStore` 的 action？

**方案 A：维持现状**
- 单步走 `graphStore.applyBatch([op])`
- 跨图认知操作直接调引擎 `applyBatch`
- 优点：简单，符合 graphStore 只持有 currentGraph 的职责
- 缺点："所有 GraphData 修改经过 graphStore" 的直觉被打破

**方案 B：graphStore 增加通用执行入口**
- 新增 `graphStore.applyBatchToGraph(graph, operations): { graph, validation }`
- 单步操作和跨图操作都经过 graphStore
- graphStore 负责：执行 applyBatch、更新传入的 graph 对象、undo snapshot、持久化（如需要）
- 优点：入口统一，便于集中管理 side effect（undo、持久化、registry）
- 缺点：graphStore 职责变宽，需要处理任意图而不仅是 currentGraph

**Step 1.2 任务**：在实现 Cognition / Arrangement 前端 UI 前，先选定方案 A 或方案 B，并重构 `graph_operations.ts`。

> **共识：Registry 修改统一经过 apply 入口（除初始化外）。**
>
> `graphRegistry` 虽然不是 GraphData 本身，但它是 Runtime 层的核心运行时索引。除 `initRegistry`（启动重建）和 `loadGraphToView`（加载时注册）外，所有对 registry 的写操作（`registerGraph` / `unregisterGraph`）都应当由 `applyBatchToGraph` / `applyBatchToGraphs` 在执行业务操作的过程中统一完成。
>
> 理由：
> - 保证 registry 与 GraphData 事实源始终一致
> - 避免调用方绕过 apply 入口直接修改 registry，破坏事务边界
> - `add_graph` / `delete_graph` 操作作为 compose→Runtime 信号，由 apply 入口统一兑现 registry 副作用
>
> 已按此共识移除 `graph_store.ts` 中的 `registerNewGraph` action；`saveGraphView` action 也因自动保存策略而移除。

#### 1.3 交互架构设计与错误反馈机制

**依据**：`docs/设计/02-交互设计.md`。

**交互架构**：

- 定义 `CognitionController` 和 `ArrangementController` 在 `operation_controller.ts` 中的扩展方式
- 明确两种模式的状态管理（`ui_store` 的模式状态 + 子工具选择）
- 明确"多选"机制如何与两种模式交互
- 明确拖拽/预览/确认三阶段的架构边界（引擎负责计算，controller 负责编排，UI 负责渲染反馈）

**错误反馈机制（规则 → 用户可见）**：

规则校验结果必须通过一条完整的管道从 engine 到达用户屏幕，中间不能有断点：

```
规则被执行
  ├─ 全局规则列表（applyBatch Phase 3）  → 产出 ValidationIssue[]
  └─ compose 语义预检                    → 产出 ComposeIssue[]
    ↓ 字段结构已对齐（severity/code/message）
引擎返回结果（applyBatch）
    ↓ 携带 issues
graph_store / graph_operations 接收
    ↓ 存入 ui_store.lastOperationValidation
Vue 组件读取
    ↓ 渲染到用户可见位置
用户看到错误信息
```

**当前缺陷**：
- `graph_operations.ts` 中的编排操作（induce/internalize/...）返回的是 `ComposeIssue[]`，需要在接收端转换（`ComposeIssue` → `ValidationIssue` 或统一展示形态）才能存入 `lastOperationValidation`。字段对齐后转换成本已降低
- 没有统一的"错误清除"时机规范

**架构产出物**：

| 产物 | 说明 |
|------|------|
| 统一 Issue 类型定义 | 合并 `ComposeIssue` → `ValidationIssue`（或反之），统一整条管道的类型 |
| 错误路由规范 | 浮空窗内错误就近显示，画布操作错误统一在底部通知区，全局规则错误在确认前阻断 |
| 清除时机 | 用户关闭浮空窗、开始新操作、点击确认后清除错误状态 |

#### 1.4 用户交互反馈规范

为每个操作定义以下内容并写入设计文档：

| 维度 | 内容 |
|------|------|
| **UI 入口** | 按钮位置、模式切换方式、子工具选择方式 |
| **用户操作步骤** | 每次点击/拖拽/选择的顺序 |
| **前端即时反馈** | 每一步用户能看到的视觉变化 |
| **确认/取消** | 如何确认写入、如何取消退出 |
| **完成状态** | 操作成功后画布和数据的最终状态 |
| **错误状态** | 操作失败时用户看到什么 |

> **设计原则**：每个操作的交互反馈必须是**用户可感知的**。不允许存在"用户点了但没有任何事发生"的断点。

#### 1.5 术语统一：主图/主图谱 → 根图谱

**背景**：设计文档中"主图"和"主图谱"两个术语混用，且与代码枚举值 `'main'` 的语义不一致（"主"暗示等级关系，"根"表达结构关系）。

**改动范围**：`docs/设计/`、`docs/开发文档/`、`docs/spec/` 下所有 `.md` 文件中"主图"和"主图谱"统一替换为"根图谱"。术语映射表同步更新。代码中的 `GraphKind='main'` 保持不变——只改文档层。

**子任务**：

| # | 内容 | 注意事项 |
|---|------|---------|
| 1.4.1 | 扫描全部文档文件，替换"主图"/"主图谱"→"根图谱" | ✅ 已完成 |
| 1.4.2 | 更新术语映射表 | ✅ 已完成 |
| 1.4.3 | 代码中 `GraphKind` 枚举值 `'main'` → `'root'`，同步更新所有 `kind === 'main'` 的判断和 `createGraphId` 等默认值 | 含测试文件中的字面量、`graph_types.ts`、`graph_data.ts`、`graph_store.ts` 等引用位置 |

#### 1.6 已知 Bug 记录：internalize 子图删除操作未分发

**状态**：方案 B 重构完成后发现，待修复。

**问题描述**：

`composeInternalize` 返回的 `operations.child` 是一个扁平的 `GraphOperation[]`，包含抽象节点子图上的 `delete_node` / `delete_edge` 操作。但返回值**没有携带每个操作对应的目标子图 ID**。

`graph_operations.ts` 中的 `internalize` 函数当前只能把 `operations.parent` 提交到 `graphView`，把 `operations.commonLayer` 提交到 `commonLayer`，而无法将 `operations.child` 正确路由到对应的子图。

**导致的后果**：

- 若被内化的节点位于抽象节点的子图中，子图内的沟通节点和相关边不会被删除。
- 子图中残留本应被清理的数据，造成数据不一致。

**修复方案**：

1. 修改 `packages/graph-engine/src/compose/cognitive/internalize.ts` 的返回类型，将 `operations.child` 改为按子图分组：

   ```ts
   operations: {
       parent: GraphOperation[]
       childByGraph: { graphId: GraphId; operations: GraphOperation[] }[]
       commonLayer: GraphOperation[]
   }
   ```

2. 更新 `frontend/src/graph/graph_operations.ts` 中的 `internalize` 函数：
   - 遍历 `result.operations.childByGraph`
   - 通过 `graphStore.getGraphById(graphId)` 获取子图
   - 将每个子图的 operations 加入 `applyBatchToGraphs` 的 `targets`

3. 更新 `packages/graph-engine/tests/compose/cognitive/internalize.test.ts` 中的相关断言。

**修复优先级**：高。该 bug 会导致跨图内化后的数据不一致，但本次方案 B 重构尚未引入新 bug，只是暴露并保留了 Phase 2a 的既有问题。

#### 1.7 已知 Bug 与设计决策：diverge 跨图 peer 图路由 + 同图启发节点规则提升

**状态**：方案 B 重构后代码审查发现，待后续统一修复。

##### Bug：diverge 无法正确找到 peer 图

**问题描述**：

`frontend/src/graph/graph_operations.ts` 中的 `diverge` 函数通过遍历 `result.drafts` 来查找 peer 图：

```ts
for (const draft of result.drafts) {
    if ('graphId' in draft && draft.graphId !== graphStore.graphView?.id) {
        const peerGraph = graphStore.getGraphById(draft.graphId)
        ...
    }
}
```

但 `packages/graph-engine/src/compose/cognitive/diverge.ts:322-326` 明确说明，`drafts` 只包含当前图的启发节点预览：

```ts
const drafts: DraftHeuristicPosition[] = [{
    nodeId: heuristicId,
    position: heuristicPosition,
    graphId: currentGraph.id,  // 永远只含当前图
}]
```

因此 `draft.graphId !== graphStore.graphView?.id` 永远不会成立，`peerGraph` 永远不会被找到，`result.operations.peer` 永远不会被提交。

**导致的后果**：

- 跨图 diverge 实际上只修改了 current 图，peer 图没有任何变化。
- peer 图中的镜像启发节点和镜像有向虚边不会被创建。

**修复方案**：

1. 修改 `packages/graph-engine/src/compose/cognitive/diverge.ts` 的返回类型，增加 `peerGraphId`：

   ```ts
   return {
       operations: { current: currentOps, peer: peerOps },
       drafts,
       peerGraphId: peerGraph.graph.id,  // 新增
       issues,
   }
   ```

2. 更新 `frontend/src/graph/graph_operations.ts` 中的 `diverge` 函数：

   ```ts
   if (result.operations.peer.length > 0 && result.peerGraphId) {
       const peerGraph = graphStore.getGraphById(result.peerGraphId)
       if (peerGraph) {
           targets.push({ graph: peerGraph, operations: result.operations.peer })
       }
   }
   ```

3. 更新 `packages/graph-engine/tests/compose/cognitive/diverge.test.ts` 中的相关断言。

##### 设计决策：将"禁止同图启发节点引用"提升为全局规则

**背景**：

当前 `composeDiverge` 在 Case B（创建启发节点）中硬编码了同图检查：

```ts
if (sourceInCurrent && targetInCurrent) {
    issues.push({ code: 'DIVERGE_BOTH_NODES_IN_CURRENT_GRAPH', ... })
}
```

设计文档 `docs/设计/02-交互设计.md` 的三种情况也隐含：同图发散直接连边，不创建启发节点。

**决策**：

将这条 inline 规则提取为全局规则 `INTRA_GRAPH_HEURISTIC_REFERENCE_FORBIDDEN`，由 `applyBatch` Phase 3 在 resultGraph 上统一执行。

**理由**：

1. 引用节点是 GraphData 的一部分，同图引用属于图数据层面的约束，适合全局规则。
2. 统一在 applyBatch Phase 3 执行，所有产生 GraphData 的路径自动遵守，不再依赖单个 compose 函数的局部预检。
3. 当前没有长期用户数据，默认开启不会破坏既有数据。

**实施方案**：

1. 在 `packages/graph-engine/src/core/checkers/global_rules_table.ts` 新增规则函数：

   ```ts
   function checkNoIntraGraphHeuristicReference(graph: GraphData): ValidationIssue[] {
       const issues: ValidationIssue[] = []
       for (const node of graph.nodes) {
           if (
               node.role === 'reference'
               && node.referenceKind === 'heuristic'
               && node.sourceGraphId === graph.id
           ) {
               issues.push({
                   severity: 'error',
                   code: 'INTRA_GRAPH_HEURISTIC_REFERENCE_FORBIDDEN',
                   message: `启发节点 ${node.id} 的源图与当前图相同，禁止同图引用。`,
                   targetType: 'node',
                   targetId: node.id,
               })
           }
       }
       return issues
   }
   ```

2. 将规则加入 `DEFAULT_GLOBAL_RULES_TABLE`，默认开启。
3. 从 `packages/graph-engine/src/compose/cognitive/diverge.ts` 中移除 `DIVERGE_BOTH_NODES_IN_CURRENT_GRAPH` 的 inline 检查。
4. 更新 `packages/graph-engine/tests/compose/cognitive/diverge.test.ts`：
   - 移除对 `DIVERGE_BOTH_NODES_IN_CURRENT_GRAPH` 的断言
   - 新增测试验证同图 diverge 返回的 operations 经过 `applyBatch` 后被全局规则拒绝
5. 更新 `frontend/src/graph/graph_operations.ts` 中的 `diverge` 函数，移除对旧错误码的专门处理。

**规则范围**：

- 仅针对 `referenceKind === 'heuristic'` 的引用节点。
- 沟通节点（`referenceKind === 'communication'`）天然跨图（子图 → 父图），不受此规则影响。

**修复优先级**：中。该问题影响跨图 diverge 的完整性，但当前 UI 尚未开放 diverge 的完整入口，用户暂时不会触发。

---

### Step 2：多根图谱切换 — 保存/加载/切换 UI（首要任务）

**目标**：用户能在前端保存当前根图谱、列出所有已保存的根图谱、切换到另一个已保存的根图谱。

#### 2.1 数据层确认

- `graph_store.ts` 中 `loadGraphToView` / `deleteSavedGraph` 已实现；保存功能由 `applyBatchToGraph` / `applyBatchToGraphs` 在 `persist: true` 时自动完成，不再提供独立的 `saveCurrentGraph` / `saveGraphView` action

#### 2.2 UI 组件实现

在 `OperationToolbar.vue` 或导航区域添加：

- **保存按钮**：保存当前根图谱至 localStorage
- **加载对话框**：列出所有已保存根图谱，点击后切换
- **删除按钮**：删除已保存图谱，操作后列表刷新

#### 2.3 哨兵加载

修改 `KnowledgeGraph.vue` / `main.ts` 的启动逻辑：

- 首次启动 → 新建空根图谱
- 非首次启动 → 自动加载上次使用的图谱（读取 `lastSaveTime` + 对应 ID）

#### 2.4 用户可见反馈

| 操作 | 视觉反馈 |
|------|---------|
| 保存成功 | 保存按钮状态变化 |
| 加载列表 | 对话框列出所有根图谱（名称/ID + 保存时间） |
| 切换图谱 | 画布刷新，新的图谱完全替换当前视图 |
| 删除图谱 | 图谱从列表消失，无法再加载 |

#### 待决设计问题

> **Q1**：保存成功后，是否需要额外的即时反馈告知用户"保存已完成"？例如短暂的通知消息。

**建议**：需要。保存是静默操作——用户点了按钮后如果没有反馈，可能会不确定是否生效。建议画布左下角短暂显示"已保存"文字，2 秒后自动消失。理由：信息量极小，不打断用户注意流，且不依赖任何第三方库即可实现。

> **Q2**：首次启动时新建的"空根图谱"——它真的是空画布吗？还是需要预设一个引导节点？

**建议**：画布完全为空更好。理由：空画布是用户的知识空白最诚实的表达。首次使用时工具栏和模式按钮已经在屏幕上，用户不需要被"教"怎么用——直接点"添加实节点"即可开始。如果空画布导致 Cytoscape 初始化报错，就用一个仅有 `nodes: [], edges: []` 的合法空 GraphData。

---

### Step 3：共依赖 — 多选机制 + 非 Arrange 拖拽基础设施

**目标**：为 Cognition（induce / internalize）和 Arrangement（orbit / path 多节点选择）提供共享的多选能力。同时为 Arrangement（moveNode 拖拽）提供基础的拖拽解禁。

#### 3.1 多选机制

**当前状态**：`graph_store.selectedNodeId: NodeId | null` 仅支持单选。

**设计文档依据**：`docs/设计/02-交互设计.md` 中归纳和内化操作的"作用对象"均为"多个节点"。

**改动**：
- `graph_store.ts` 新增 `selectedNodeIds: Set<NodeId>`（或 `NodeId[]`）
- 新增 `toggleNodeSelection(nodeId)` / `clearNodeSelection()` 动作
- `use_graph_interaction.ts`：普通点击 = 单选并清空其他；配合修饰键或框选实现多选

#### 3.2 拖拽解禁

**设计文档依据**：`docs/设计/02-交互设计.md:10` 定义默认模式"可拖拽相机镜头"，Move / Adjust / Orbit / Path 操作均涉及画布拖拽或节点移动。

**改动**：
- 进入 Arrangement 模式时启用节点拖拽
- 推出 Arrangement 模式时恢复禁止拖拽
- `use_graph_interaction.ts` 绑定拖拽结束事件 → 映射到语义事件 `NodeDragEnded`

#### 3.3 多选 UI 反馈（视觉）

| 状态 | 视觉反馈 |
|------|---------|
| 未选中 | 正常渲染 |
| 单个选中 | 高亮边框（现有单选逻辑） |
| 多个选中 | 所有选中节点统一高亮样式 |

#### 待决设计问题

> **Q3**：多选节点的交互方式是什么？"Ctrl/Shift + 点击" vs "直接逐个点击（toggle 模式，再点取消选中）" vs "拖拽框选"。

**建议**：拖拽框选作为主要多选方式，辅以 toggle 点击（不需要修饰键——直接点击已选中节点则取消选中，点击未选中节点则加入选中）。理由：拖拽框选是画布应用最直觉的多选方式（Cytoscape 原生支持 `boxselect`），而 toggle 点击不需要修饰键降低了操作门槛，符合"低认知负担"设计原则。Ctrl/Shift 是桌面习惯，不适合本应用的沉浸式画布体验。

> **Q4**：框选拖拽过程中，选中区域的视觉呈现是什么？

**建议**：Cytoscape 原生提供的半透明蓝色选框即可。理由：不做自定义渲染——这是通用交互范式，用户不需要被教。后续如果需要统一视觉风格再替换。

#### 3.4 待解决设计问题：选中状态归属

**问题**：`graph_store.ts` 当前持有 `selectedNodeId` / `selectedEdgeId`，但选中状态本质上是 UI Runtime 状态，不是 GraphData。

**两种方案**：

| 方案 | 位置 | 优点 | 缺点 |
|------|------|------|------|
| A（当前） | `graph_store.ts` | 与图数据邻近，组件读取方便 | 污染 GraphData Store 的纯度 |
| B | `ui_store.ts` | UI 状态归位，graph_store 只保留 GraphData | 部分读取路径需改到 ui_store |

**建议**：方案 A 在 Phase 2b 可接受，因为当前选中状态主要用于图操作路由；若未来 UI 需要根据选中状态做复杂反馈（如右键菜单、批量操作面板），再迁移到 `ui_store.ts`。

**结论**：暂不迁移，本问题在 Step 3 记录，后续视 UI 复杂度决定是否调整。

---

### Step 4：Cognition 操作实现

#### 4.1 Induce / Internalize 多选入口

- `OperationToolbar.vue`：cognition 子工具栏的 induce / internalize 按钮读取 `selectedNodeIds.length`，≥2 时启用
- 点击 induce：调 `controller.induce(selectedNodeIds)` → `graph_operations.induce()` → engine `composeInduce` → `applyBatch`
- 点击 internalize：同上，调 `internalize`
- 抽象节点 internalize 前弹确认框（设计文档依据：`docs/设计/01-核心定义.md`）

**用户可见反馈**：

| 步骤 | 视觉反馈 |
|------|---------|
| 选中 ≥2 节点 | induce / internalize 按钮变为可点击态 |
| 点击 induce | 原节点消失 → 新抽象节点出现 |
| 点击 internalize | 选中节点消失，转移至常识层 |
| 抽象节点 internalize | 确认弹窗："将递归转移所有子图子树" |
| 操作失败 | 错误信息显示（虚节点不可归纳、实节点不可内化等） |

#### 待决设计问题

> **Q5**：induce 执行后，是否自动展开新抽象节点的子图让用户看到内部？

**建议**：不自动展开。理由：induce 的目的是"把多个节点收进一个抽象概念"，用户的操作意图在此已达到。自动跳转子图相当于替用户做了一个额外的导航决策，打断了原有视野。用户如果想看子图内容，可以双击抽象节点手动展开。

#### 4.2 Diverge 跨图搜索 UI

- 设计搜索浮空窗组件 `GraphSearchPanel.vue`（或集成到已有浮空窗体系）
- 在 `CognitionAction` 类型中新增 `'diverge'`，工具栏添加 diverge 按钮
- 实现三种情况的事件调度：

**设计文档依据**：`docs/设计/02-交互设计.md §发散` 明确列出三种情况的操作流程。以下描述全部出自设计文档原文。

**操作流程**：

| 场景 | 用户操作步骤 | 反馈 |
|------|------------|------|
| Case 1：空白→搜→节点 | ①点空白处 → ②弹出搜索浮空窗 → ③输入过滤 → ④选目标节点 → ⑤在图上显示启发节点 → ⑥再点另一节点连线 | ①光标变化；②浮空窗弹出；③搜索过滤；④启发节点出现在空白位置；⑤有向虚边连接 |
| Case 2：节点→空→搜 | ①点源节点 → ②虚线跟随鼠标 → ③点空白 → ④弹出搜索浮空窗 → ⑤选目标 | ①节点高亮；②有向虚边从节点延伸跟随鼠标；④搜索浮空窗弹出；⑤自动完成边 |
| Case 3：节点→节点同图 | ①点源节点 → ②点目标节点 | ①节点高亮 → ②有向虚边直接创建 |

#### 待决设计问题

> **Q6**：搜索浮空窗的"搜索过滤"是实时过滤（边输入边缩小结果）还是输完后点搜索？

**建议**：实时过滤。理由：用户搜索的目标是已经在圖中存在的节点（引擎 `searchNodes` 做的是子串匹配），不是调用外部 API。本地过滤延迟为零，实时更新不给用户增加等待感。如果未来需要跨网络的全局搜索，可以理解为那个功能的优化需求。

> **Q7**：Case 1 中"光标变化"具体变成什么？

**建议**：十字准星（crosshair）。理由：暗示"你即将在精确位置放置一个节点"。两个节点间的连线操作（Case 2/3）可以直接用默认光标，因为虚线跟随已经表达了"即将连线"。

#### 4.3 Deconstruct 入口完善

- 已打通全链路，确认 edge case 覆盖（虚节点不可解构、引用节点不可解构等）
- 验证操作失败时错误信息能反馈给用户

---

### Step 5：Arrangement 操作实现

**设计文档依据**：`docs/设计/02-交互设计.md §Arangement` 定义统一操作流程——"选择操作对象 → 确认选择完毕 → 预览布局 → 用户确认后写入 Data"。所有 Arrange 子操作均遵循此流程。

#### 5.1 MoveNode 拖拽移动

**数据流**：
```
Cytoscape drag（Arrangement 模式下启用节点拖拽）
  → use_graph_interaction: drag 结束事件 → NodeDragEnded(nodeId, newPosition)
  → operation_controller: 调 moveNode(nodeId, position)
  → graph_operations: composeMoveNode → engine collision detection
  → 碰撞则不写入，无碰撞直接 move_node → applyOperation
```

**设计文档依据**：`docs/设计/02-交互设计.md §单点移动` 定义操作对象为"单个节点"，功能为"单独移动一个节点在图谱中的绝对位置"。

**用户可见反馈**：

| 步骤 | 视觉反馈 |
|------|---------|
| 进入 Arrangement 模式 | 节点变为可拖拽 |
| 拖拽中 | 节点跟随鼠标（视觉层偏移，不写 GraphData） |
| 放下（无碰撞） | 节点固定新位置，GraphData 更新 |
| 放下（有碰撞） | 拒绝写入，节点弹回原位 + 错误提示 |

#### 待决设计问题

> **Q8**：碰撞时"拒绝写入"的视觉反馈是什么？节点弹回原位，还需要额外的碰撞指示吗？

**建议**：节点弹回原位本身已是足够的反馈——用户看到节点"弹回去"，自然明白此处不可放。不做额外红色指示。理由：弹回动画本身就是负反馈信号。叠加红色反而在执行两个语义上等价但视觉重复的提示。且设计文档只说"如果产生碰撞则不能点击确认"（`02-交互设计.md:137`），没有要求碰撞指示。

#### 5.2 Orbit 环绕布局

- `graph_operations.ts` 导入 `composeOrbit`（从 engine 的 arrangement 导出）
- `operation_controller.ts` 暴露 orbit 选择流
- `OperationToolbar.vue` arrangement 子工具栏添加 orbit 按钮

**设计文档依据**：`docs/设计/02-交互设计.md §Orbit 环绕布局`。

**操作流程与反馈**：

| 步骤 | 用户操作 | 视觉反馈 |
|------|---------|---------|
| ① | 点击 orbit 按钮 | 工具栏显示选中态，光标变为 orbit 选择模式 |
| ② | 点击中心节点 | 该节点高亮标记 |
| ③ | 依次点击环绕节点 | 每次点击，节点依次高亮标记 |
| ④ | 确认选择 | 系统计算位置并在画布显示草稿预览；如有碰撞标记 |
| ⑤ | 拖拽微调卫星 | 卫星吸附最近轨道（adjust orbit 逻辑） |
| ⑥ | 确认写入 | 位置固定，预览标记消失 |

**设计约束**（出自 `02-交互设计.md`）：
- 仅选择的节点参与布局，未选节点保持原位
- 仅实边邻居可作为环绕节点（禁止虚边）
- 引擎负责碰撞检测，UI 负责预览渲染

#### 待决设计问题

> **Q9**：步骤②中"中心节点高亮标记"——高亮的视觉形式是什么？

**建议**：边框加粗 + 颜色变为选中色（与单选高亮一致即可）。理由：中心节点在 Orbit 操作中的语义就是"被选中的操作对象"，复用已有单选视觉能降低认知负担。不需要引入额外的"光环"等特效——会创造新的视觉语言，用户需要重新学习其含义。

> **Q10**：步骤④"确认选择"的触发方式是什么？"双击空白"、"点击确认按钮"、还是自动确认？

**建议**：在工具栏 Orbit 按钮旁显示一个"确认选择"子按钮，当中心节点 + 至少一个环绕节点已选择后变为可点击。理由：双击空白有歧义——用户可能只是误双击。显式按钮的意图更清晰，且符合"选择对象 → 确认选择"的设计流程。选择完毕后也可以再次点击 Orbit 按钮来取消选择回到选择前状态。

#### 5.3 Path 路径布局

- `graph_operations.ts` 导入 `composePathLayout`
- `operation_controller.ts` 暴露 path 选择流
- `OperationToolbar.vue` arrangement 子工具栏添加 path 按钮

**设计文档依据**：`docs/设计/02-交互设计.md §Path 路径布局`。

**操作流程与反馈**：

| 步骤 | 用户操作 | 视觉反馈 |
|------|---------|---------|
| ① | 点击 path 按钮 | 工具栏选中态，光标变为 path 选择模式 |
| ② | 点击轴心节点 | 轴心节点高亮，显示为路径锚点 |
| ③ | 依次点击路径节点 | 每个节点依次高亮 |
| ④ | 选择完毕拖拽确定旋转角 | 节点预览排列在线上 |
| ⑤ | 确认写入 | 位置固定，预览消失 |

**设计约束**（出自 `02-交互设计.md`）：
- 仅允许有向实边连接路径节点
- 引擎负责计算直线排列 + 碰撞检测

#### 待决设计问题

> **Q11**：步骤④"选择完毕拖拽确定旋转角"——拖拽时是否需要一条从轴心延伸的方向指示线？

**建议**：需要。不画线则用户无法判断当前旋转角——线是"角度"这个抽象概念最直接的视觉表达。线从轴心节点中心延伸至鼠标光标位置，路径节点沿此线排列预览。理由：设计文档提及"确定旋转角"（`02-交互设计.md:160`），没有视觉辅助用户无法确定角度。

#### 5.4 Adjust Distance / Orbit

- `graph_operations.ts` 导入 `composeAdjustDistance` / `composeAdjustOrbit`
- `operation_controller.ts` 暴露 adjust 选择流
- `OperationToolbar.vue` arrangement 子工具栏添加 adjust 按钮（或作为拖拽微调模式）

**设计文档依据**：`docs/设计/02-交互设计.md §Adjust Distance / Adjust Orbit`。

**Adjust Distance 流程与反馈**：

| 步骤 | 用户操作 | 视觉反馈 |
|------|---------|---------|
| ① | 选择 adjust distance | 进入两点选择模式 |
| ② | 选"不动节点" | 节点高亮标记为锚点 |
| ③ | 选"动节点" | 节点高亮标记为动点，进入拖拽模式 |
| ④ | 画布拖拽 | 动节点沿两节点连线方向实时移动，边长连续变化（预览） |
| ⑤ | 确认 | 位置写入 |

**Adjust Orbit 流程与反馈**：

| 步骤 | 用户操作 | 视觉反馈 |
|------|---------|---------|
| ① | 选择 adjust orbit | 进入两点选择模式 |
| ② | 选"不动节点" | 锚点高亮 |
| ③ | 选"动节点" | 动点高亮，进入拖拽模式 |
| ④ | 画布拖拽 | 动节点自动吸附最近离散轨道 |
| ⑤ | 确认 | 位置写入 |

#### 待决设计问题

> **Q12**：碰撞时确认按钮灰显（不可点击）vs 确认后弹错误提示——哪个更好？

**建议**：确认后弹错误提示更好。理由：灰显确认按钮是一种"无声的拒绝"——用户看到按钮不可点但不知道为什么，不符合"操作失败时用户能看到什么"的反馈原则。确认后弹出具体错误信息（如"该位置与 'XX 节点' 重叠，请微调"）能给用户可操作的信息。且 adjust 是连续拖拽调整，用户可以立即重新拖拽修正，不需要按钮灰显这种僵硬的阻断。

> **Q13**：adjust orbit 拖拽时卫星吸附到离散轨道——用户能感知到"吸附"吗？需不需要触觉以外的视觉反馈？

**建议**：不需要额外的"咔哒"音效或视觉效果。理由：轨道吸附本身在视觉上是可感知的——节点从自由拖拽变成"跳"到固定轨道位置——用户的眼睛能看到这个跳跃。加音效或特效反而过度设计。

---

### Step 6：错误反馈链路（lastOperationValidation 读取端）

- 读取 `uiStore.lastOperationValidation`
- 操作失败时显示 `ValidationResult.issues` 中的错误信息
- 用户关闭浮空窗或点击确认后清除错误状态

**用户可见反馈**：

| 场景 | 反馈 |
|------|------|
| 操作成功 | 无额外提示 |
| 操作失败 | 错误信息显示 |
| 验证失败 | 保留 UI 状态不变，用户可修改后重试 |

#### 待决设计问题

> **Q14**：错误信息显示在哪个位置？"NodeWindow 浮空窗内"、"画布底部通知栏"、还是"错误 toast"？

**建议**：浮空窗内操作时错误显示在浮空窗内；其他操作（Cognition / Arrangement）错误显示在画布底部半透明通知区。理由：浮空窗内的错误就近原则——用户正在编辑节点，眼睛就在浮空窗上。画布操作的错误统一在底部——底部的信息不阻挡画布视野，且用户操作完成后视线自然下移看反馈。不引入 toast 库——信息量极小，用现有 UI 容器即可。

---

### Step 7：Undo / Redo（Phase 2b 末尾）

**延后处理**，当前 `undoStack`（全量快照）继续使用，升级为 `OperationLog`（树形操作树 + 增量逆操作）待此步骤执行。

**设计文档依据**：`docs/设计/04-UI与笔记库.md §Button设计` 定义左下角回溯按钮及其灰显规则。

> **共识：所有关于 Undo / Redo 的问题统一在本步骤解决，不在此前步骤做局部补丁。**
>
> 当前已知、待 Step 7 统一处理的 Undo 相关问题：
> - `undoStack` 是完整 GraphData 快照，刷新后失效
> - 跨图操作（`induce` / `internalize` / `diverge`）修改了 peer / child / commonLayer 图，`undoDelete` 只恢复 `graphView`
> - `add_graph` 创建的子图在 undo 后不会自动删除，可能成为 orphan 图
> - undo / redo 的 cursor 边界灰显规则
>
> 在 Step 7 之前，`graph_store.ts` 继续用 `undoStack` + `pushUndoSnapshot` 做最小可用实现，不引入 OperationLog 的局部补丁。

#### 7.1 操作日志升级

- 引入 `OperationLogEntry` / `OperationLog` 类型（引擎 `types/operation_log.ts` 已定义）
- `graph_store.ts`：`undoStack` → `OperationLog`，`pushUndoSnapshot` → 增量记录 `reversalOperations`
- cursor 管理：线性操作阶段只有单链，redo 在 0~1 子节点时自动走

#### 7.2 回溯按钮 UI

- 左下角 ← → 按钮
- ← 灰：cursor = 0（无向前操作）
- → 灰：cursor = 末尾（无向后操作）
- 多分支时弹选择（≥2 子节点）

---

## Phase 2b 完成标志 = MVP 交付

1. **多根图谱切换**：用户可保存当前图谱、列出所有已保存图谱、切换到另一个图谱；启动时自动加载上次使用的图谱
2. **Cognition 操作**：用户可通过 deconstruct / induce / internalize / diverge 改变知识结构
3. **Arrangement 操作**：用户可拖拽移动节点、使用 orbit / path 布局、adjust 连续微调
4. **操作失败可见**：用户在所有操作失败时能看到错误提示
5. **Undo / Redo**：用户可回溯操作，按钮在边界时灰显
6. **explore / unearth 保持 TODO**（Phase 4 AI Runtime）
7. **Cloud Layout / Knowledge Group 保持 TODO**（非 MVP）
