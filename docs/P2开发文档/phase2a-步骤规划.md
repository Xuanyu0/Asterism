# Phase 2 步骤规划  — 已完成（历史参考）

> 抽取自 `graph-engine开发手册.md §十`。本文档定义 Phase 2 的任务分解、难度评估和阶段划分。

---

# 十、Phase 2 任务分解

## 难度一览

| Step | 内容 | 难度 | 代码量（搬家 + 新增） | 修正说明 |
|------|------|------|---------------------|---------|
| 1 | 骨架搭建 | 🟢 极低 ✅ | ~20 行新增 | — |
| 2 | 类型层迁移 | 🟢 低 ✅ | ~310 行搬家 + ~30 行新增 | — |
| 3 | **核心引擎迁移 + 整合** | 🟡 中 ✅ | ~660 行 | 已完成。引用节点穿透 + 级联删除 + reversal + replay + apply + id 生成 |
| 4 | **规则约束层合并** | 🟡 中 ✅ | ~700 行 | 已完成。引用节点边约束、虚节点可操作性、引用节点操作约束等 |
| 5 | **基础设施** | 🟡 中 ✅ | ~360 行 | 已完成。graph_registry + search + collision + placement（六函数） |
| 6 | **Compose 基础层** | 🟢 低 ✅ | ~170 行 | 已完成。ComposeResult<Draft> + applyBatch 事务流水线 + 类型定义 |
| 7 | 布局操作层 | 🟡 中 ✅ | ~200 行 | 已完成。orbit / path / adjust / move（cloud 延后至 Phase 2b） |
| 7.5 | **认知操作 Spec** | 🟢 低 ✅ | 7 份文档 | 已完成。arrangement/orbit + cognitive/deconstruct/diverge/induce/internalize + graph-registry |
| 8 | 认知操作层 | 🔴→🟢 ✅ | ~1180 行 | 已完成。deconstruct / diverge / induce / internalize 全部实现 |
| 9 | 测试覆盖 | 🟡 中 ✅ | ~800 行 | 20 测试文件 119 测试。9.10 rule_checkers 单元测试跳过（规则已由 validate.test.ts 间接覆盖） |
| 10 | 公开 API 收口 | 🟢 低 ✅ | ~20 行 | 按 6 类组织 index.ts 导出，26 处消费者标注，不导出列表验证通过 |
| 11 | **前端适配** | 🟡 中 ✅ | ~150 行改动 | graph_store 退化 + 调引擎 apply / compose + import 路径更新 + 清理前端/GE 重合代码 |

## 阶段划分

### Step 1：Engine 项目骨架搭建  --Complete

| # | 任务 | 产出 |
|---|------|------|
| 1.1 | 配置 `pnpm-workspace.yaml`，声明 `packages/*` 为 workspace | pnpm workspace 就绪 |
| 1.2 | 创建 `packages/graph-engine/package.json`，包名 `@my-project/graph-engine` | 包元信息 |
| 1.3 | 创建 `packages/graph-engine/tsconfig.json`，配置项目引用 | tsc 编译就绪 |
| 1.4 | 安装 vitest | 测试框架就绪 |

### Step 2：类型层迁移（types/）  --Complete

| # | 任务 | 说明 |
|---|------|------|
| 2.1 | 迁移 GraphData 类型 | `frontend/definitions/types/graph_types.ts` → `engine/src/types/graph_data.ts`。新增 `GraphRegistry` 类型、`SearchResult` 类型、`NodeRadiusMap` 类型、`NodeData.groupId?: string` 预留字段 |
| 2.2 | 迁移 Operation 类型 | `frontend/definitions/types/graph_operation_types.ts` → `engine/src/types/operations.ts` |
| 2.3 | 迁移 Validation 类型 | `frontend/definitions/types/validation_types.ts` → `engine/src/types/validation.ts` |
| 2.4 | 新增 CognitiveResult 类型 | `engine/src/types/cognitive.ts`（新增） |
| 2.5 | 新增操作日志类型 | `engine/src/types/operation_log.ts`（新增）。定义 `OperationLogEntry`、`OperationLog`、`ReflogEntry`。支持 Git 追加模型 |
| 2.6 | 更新前端 import 路径 | 所有 `@/definitions/types/xxx` → `@my-project/graph-engine` |

### Step 3：核心引擎迁移（core/）  --Complete

**⚠️ 新增逻辑**：迁移时需补充引用节点穿透（update_node 时同步修改原节点）、引用节点级联删除（delete_node 时跟随原节点生命周期）、虚节点约束校验。这些是 Phase 1 未实现的功能。

> **跨图依赖**：引用穿透、级联删除、度数双向同步当前仅处理同图（`sourceGraphId === graph.id`）。跨图场景需 Step 5 `graph_registry.ts` 就绪后才能补齐。当前代码中已预留守卫，受影响的函数：`executeAddEdge`、`executeDeleteNode`、`executeUpdateNode`、`syncReferenceNodeDegree`。

| # | 任务 | 说明 |
|---|------|------|
| 3.1 | 迁移 `operation_executor.ts` → `engine/src/core/execute.ts` | 纯函数。`executeDeleteNode` 内联折叠状态清理（方案 A）。**新增**：delete_node 级联删除引用节点；update_node 引用穿透逻辑 |
| 3.2 | 迁移 `operation_validator.ts` → `engine/src/core/validate.ts` | 将 Phase 1 的编排逻辑合并为 `validate.ts`，通过调用 `core/checkers/` 中的原子校验函数实现。**非零改动**：需新增引用节点边约束、虚节点可操作性、引用节点操作约束等检查。`validate.ts` 是 `core/` 其他模块的唯一校验入口，不直接调用 checkers/ |
| 3.3 | 迁移 `graph_utils.ts` 中的 `normalizeGraph` → `engine/src/core/normalize.ts` | 从 `utilities/` 迁入 |
| 3.4 | 新建 `engine/src/core/id.ts` | 统一 ID 生成，使用 `crypto.randomUUID()`。从 `frontend/src/ui/operation_controller.ts` 的 `createNodeId()` 迁出并扩展（当前仅有 `createNodeId`，需补充 `generateEdgeId` / `generateGraphId`） |
| 3.5 | 新建 `engine/src/core/apply.ts` | validate + execute 统一入口：`applyOperation(graph, op) → { graph, validation }` |
| 3.6 | 新建 `engine/src/core/reversal.ts` | 逆元构造器。在 execute 前调用，捕获操作对象完整前状态，返回逆操作序列。11 种原子操作全部覆盖。已通过 `index.ts` 导出，接入调用链路在 Step 10.6 |
| 3.7 | 新建 `engine/src/core/replay.ts` | 操作序列回放。`replayGraph(base, ops) → GraphData` / `replayToStep(base, ops, step) → GraphData`。纯函数。已通过 `index.ts` 导出，接入调用链路在 Step 10.6 |

### Step 4：规则约束层合并（core/checkers/）  --Complete

**新增逻辑**：rule_checkers 需新增引用节点边约束、虚节点度数规则（r₀ 固定）、启发节点操作约束等。非纯搬家。迁移目标为 `core/checkers/`（`core/` 子文件夹），由 `core/validate.ts` 编排。

| # | 任务 | 说明 |
|---|------|------|
| 4.1 | 迁移 `graph_rules.ts` → `engine/src/core/checkers/rules.ts` | 从 `rules/` 迁入。需新增引用节点数量限制常量（R1 待定，暂设为与普通节点同值） |
| 4.2 | 迁移 `rule_checkers.ts` → `engine/src/core/checkers/rule_checkers.ts` | **新增**：引用节点边类型校验（启发节点只能有向虚边）、引用节点操作约束校验（禁止解构/内化）、虚节点度数规则校验 |
| 4.3 | 迁移 `graph_validator.ts` → `engine/src/core/checkers/` | 全图体检。**新增**：全图范围内引用节点一致性校验（dangling 引用检测） |
| 4.4 | 新建 `engine/src/core/checkers/registry.ts` | `DEFAULT_RULES` 启用表，约 20 行。Phase 3 扩展点 |
| — | ~~迁移 `operation_validator.ts` 至 checkers/~~ | **已由 3.2 处理**：编排逻辑由 `core/validate.ts` 承接，checkers/ 仅存放原子规则和常量 |

### Step 5：基础设施实现（infrastructure/）  --Complete

**目标**：实现认知操作和布局操作共同依赖的底层能力 + 持久化接口迁入。全部是纯函数。

**跨图补齐**：`graph_registry.ts` 已就绪。跨图同步（端点穿透、级联删除、label 穿透）不在 `execute.ts` 中补齐——`execute.ts` 保持 `(graph, op) → graph` 单图纯函数签名。跨图副效应由编排层（`compose/`）持有 registry 并逐图 apply 操作序列实现，`execute.ts` 中的 `sourceGraphId !== graph.id` 守卫继续作为安全空转保留。

**infrastructure/ 职责边界**：

- `collision.ts` 负责"这个位置能不能放"——碰撞判定
- `placement.ts` 负责"草稿位置应该在哪"——位置生成
- 两者都是纯几何计算，不判定边类型、不区分业务规则、不组装 GraphOperation

| # | 任务 | 说明 | 估算 |
|---|------|------|------|
| 5.1 | `graph_registry.ts` | `Map<GraphId, GraphData>` 包装，提供 `get / set / has / delete / list` | ~50 行 |
| 5.2 | `search.ts` | `searchNodes(query, registry, graphId?) → SearchResult[]`——label 子串匹配。`graphId` 传入时只搜指定图，不传时搜所有图。结果含 `graphPath` 字段（通过 `parentGraphId` 回溯到根图），保证导航卡片和 diverge 可展示完整路径。0 结果时直接返回 `[]`，不报错 | ~30 行 |
| 5.3 | `collision.ts` | 两个原语。**`hasCollisionAt`**：单点碰撞准入判断（布尔查询），用平方距离省 sqrt。**`hasCollisionInDrafts`**：批量草稿碰撞检测，同时覆盖草稿互碰和草稿 vs 已有节点。全部节点统一外接圆模型——正多边形与圆形统一外接圆半径。半径公式 `r = r₀ · √(1 + degree)` 无上限。NodeRadiusMap 为特例覆盖 | ~110 行（已完成） |
| 5.4 | **新增** `placement.ts` | 层级布局原语。六个函数：**`positionOnCircle`**（给定圆心+半径+角度→圆上坐标）、**`snapOrbit`**（给定中心+光标→吸附至最近层级轨道，同时确定角度和层级）、**`distributeOnTiers`**（自动挡均分环绕，内部保证不碰撞）、**`distributeOnLine`**（沿射线等距排列）、**`scatterInCircle`**（圆内均匀随机位置）、**`computeTierSpacing`**（层级间距 D₀ = centerRadius + maxSatelliteRadius + r₀）。全部不判定碰撞——碰撞由调用方调 collision 处理 | ~160 行（已完成） |
| 5.5 | 迁入 `persistence.ts` | `PersistenceAdapter` 接口定义，从 `graph_persistence.ts`（~112 行）迁入，保留接口 | ~110 行搬家 |

**placement 层级模型**：

- 层级是离散的轨道半径档位。层级 n 的轨道半径 = `(n+1) · D₀`。n = 0, 1, 2...（对应主量子数 n+1 = 1, 2, 3...）。
- 类比 2D 玻尔模型：轨道半径 `r ∝ n`（等间距），而非 3D 的 `r ∝ n²`。2D 下力律 F ∝ 1/r 导致轨道等间距。
- 约束 A（中心 ↔ 层级 0）：`D₀ = centerRadius + maxSatelliteRadius + r₀`。
- 约束 B（层级间）：因 `centerRadius ≥ maxSatelliteRadius`（中心节点连接所有卫星 → 度数最高 → 半径最大），`D₀ ≥ 2·maxSatelliteRadius + r₀` 自动满足。
- 约束 C（层内）：`distributeOnTiers` 内部检查弦距 `2·Rₙ·sin(π/N) ≥ 2·tierMaxRadius + r₀`。若不足则扩展 D₀。
- `distributeOnTiers` 不扩展 D₀ 至外层级（即 D₀ 被约束 C 扩展后，所有层级同步放大，内部层级不一定被扩展）。当前实现为单 D₀ 全局缩放。
- 间距中 `r₀` 项保证层间可容纳一个孤立节点。

### Step 6：Compose 基础层实现（compose/）  --Complete

**目标**：提取布局操作（Step 7）和认知操作（Step 8）共享的类型定义和事务流水线，避免在 9 个 compose 模块中各自重复实现 `{ drafts, issues }` 契约和操作序列事务语义。

**动机**：Step 7（arrangement）和 Step 8（cognitive）在以下三个方面共享完全相同的控制流和数据结构：

| 共享内容 | Step 7 用到 | Step 8 用到 |
|---------|:----------:|:----------:|
| `ComposeResult` — `{ drafts, issues }` 返回契约 | orbit / path / adjust / cloud / move | induce / internalize / diverge（deconstruct 不需位置预览） |
| `applyBatch` — 事务流水线（全通过→执行，任一失败→丢弃） | move 批量移动、orbit 批量写入 | induce 三组原子操作协调、internalize 递归搬运 |
| 碰撞准入 `hasCollisionAt` | Arrange 预览确认前校验 | 自动找空位时的逐点碰撞检查 |

三个共享点中，`hasCollisionAt` 已在 Step 5 的 `collision.ts` 中实现。本 Step 完成前两个。

**目录结构**：

```
packages/graph-engine/src/compose/
├── types.ts              # ComposeResult<Draft> 泛型类型
├── pipeline.ts           # applyBatch 事务流水线
├── arrangement/          # Step 7 填充
├── cognitive/            # Step 8 填充
└── index.ts              # Step 7.5 / 8.5 填充（re-export）
```

| # | 任务 | 说明 |
|---|------|------|
| 6.1 | `compose/types.ts` (~25 行) | `ComposeResult<Draft>` 泛型：`{ drafts: Draft[], issues: ComposeIssue[] }`。`DraftPosition` 基础类型（`{ nodeId, x, y }`）。`ComposeIssue` 类型（`{ message, severity: 'error'\|'warning' }`）。Step 7/8 的各模块可在此基础上扩展更具体的 Draft 类型 |
| 6.2 | `compose/pipeline.ts` (~35 行) | `applyBatch(graph, ops, options?) → { graph, validation, results }`。内部逐条 validate → 全通过后逐条 execute。任一失败则整批丢弃，入参 graph 原封不动，validation 聚合并所有 issue。可选 `dryRun?: boolean` 模式：只 validate 不 execute，返回每个 op 的 validation 供前端预览判定。可选 `stopOnFirst?: boolean`：遇第一个失败即停（默认 `false`，聚合所有 issue） |

**`applyBatch` 的事务语义**：

```
applyBatch(graph, ops):
    results = []
    for each op in ops:
        v = validate(graph, op)
        results.push({ op, validation: v })
        if !v.valid: break if stopOnFirst else continue
    
    if any !valid:
        return { graph, validation: aggregateInvalid(results), results }  // graph 不变
    
    // 全通过
    for each { op } in results:
        graph = execute(graph, op)
    
    return { graph, validation: { valid: true, issues: [] }, results }
```

**与 reversal 的调用关系**：`applyBatch` 不内部调用 `createReversal`。reversal 的调用时机由上层（`graph_store` 或 `operation_controller`）在调用 `applyBatch` 之前决定——这是 Step 11（前端适配）中 `graph_store` 的职责。`applyBatch` 是纯函数，不产生副效应。

---

### Step 7：布局操作层实现（compose/arrangement/）  --Complete

**目标**：将 Arrange 模式下的位置计算编排逻辑下沉为引擎纯函数。依赖 Step 5 的 `collision` 和 `placement` 基础设施。

**架构原则**：

- "草稿"和"结果确认"是 UI 概念。引擎不区分"预览"和"最终写入"——引擎只有 GraphData 状态。草稿位置是渲染层的临时视觉对象，不进入 GraphData。确认后才通过 `move_node` operation 写入。
- 操作规则（"只有实边才能参与 Orbit"等）属于业务逻辑，在 `compose/arrangement/` 内校验。`infrastructure/collision.ts` 和 `infrastructure/placement.ts` 是纯几何原语，不判断边类型。
- `compose/` 的函数向前端暴露 `{ drafts, issues }` 结构——前端收到 drafts 做预览，issues 控制确认按钮灰不灰。

**碰撞交互模型**：

所有 Arrange 操作共享同一交互模式：选择操作对象 → 预览草稿 → 碰撞检测 → 确认写入 / 取消丢弃。引擎封装碰撞判定，前端仅拿 `blocked: boolean` 灰/红草稿和灰/亮确认按钮。

**布局生效时的平滑动画**：

布局确认后节点从当前位置移动至目标位置，不是瞬间闪现——渲染层通过缓动函数（Cytoscape 内置动画）实现平滑过渡。引擎不参与动画逻辑：

- 动画是渲染层视觉过渡，不是数据层职责。引擎只输出最终位置，不持有时间轴状态。
- 批量 `move_node` 逐一 `apply()` 后，渲染层 watch GraphData 变化统一触发多节点动画。
- 当前 `use_cytoscape_renderer.ts` 中设 `autoungrabify: true`，Phase 2 进入 Arrangement 模式时改为 `cy.nodes().grabify()` 启用拾取放置。

**Adjust 的连续性区分**：

| 操作 | 连续性 | step（每帧） | commit（确认） |
|------|--------|-------------|---------------|
| **Adjust Distance** | 连续 | `adjustDistanceStep` → `{ position, blocked }` | `adjustDistanceCommit` → `ComposeResult` |
| **Adjust Orbit** | 离散 | `adjustOrbitStep` → `{ position, tier, angle, blocked }` | `adjustOrbitCommit` → `ComposeResult` |

Adjust Orbit 融合了原 Adjust Angle 的操作语义——拾取放置同时改变角度和层级（离散档位），节点的角度跟踪鼠标位置，层级吸附至最近轨道。

**层级术语**：

- "层级"（Tier）= 离散轨道半径档位。层级 n 的轨道半径 = `(n+1) · D₀`。n = 0, 1, 2...
- D₀ 由 `computeTierSpacing` 计算，同一画布上所有布局操作共享此间距。
- 层级分配（哪个节点在哪层）由 UI 层用户选择 / 编排层策略决定，placement 原语不分配层级。

| # | 任务 | 说明 |
|---|------|------|
| 7.1 | `move.ts` | 单节点移动。`moveNode(params) → ComposeResult<DraftPosition>`。内部 `hasCollisionAt` 判碰，碰撞则 issues 含 error。前端微调时反复调此函数拿 drafts + issues 预览，确认时拿最后一次返回的 operations（含单条 `move_node`）调 `applyBatch`。 |
| 7.2 | `adjust.ts` | **Adjust Distance**：`adjustDistance(params) → ComposeResult<DraftPosition>`。内部 `positionOnCircle` 算草稿位置 + `hasCollisionAt` 判碰。<br>**Adjust Orbit**：`adjustOrbit(params) → ComposeResult<DraftPosition>`。内部 `snapOrbit` 算吸附位置 + `hasCollisionAt` 判碰，返回 `{ position, tier, angle }` 扩展 Draft 字段。 |
| 7.3 | `orbit.ts` | 环绕布局。`orbit(params) → ComposeResult<DraftPosition>`。校验：参与节点必须通过实边（有向或无向）与中心节点连接，禁止虚边。内部 `snapOrbit` 逐卫星算吸附位置 + `hasCollisionInDrafts` 批量判碰。**初始化**：首次调用时自动将所选节点吸附至最近轨道。**手动微调**：前端改变单个卫星的层级/角度后重新调此函数，引擎算全部卫星草稿 + 判碰。**自动挡**：调 `distributeOnTiers` 均分环绕（内部保证不碰撞）。 |
| 7.4 | `path.ts` | 路径布局。`pathLayout(params) → ComposeResult<DraftPosition>`。校验：参与节点必须通过有向实边与轴心节点连接。内部 `distributeOnLine` 沿射线等距排列 + `hasCollisionInDrafts` 批量判碰。前端改变方向角后重新调此函数拿最新 drafts + issues。 |
| 7.5 | `cloud.ts` | 云布局。`cloudLayout(params) → ComposeResult<DraftPosition>`。任意节点和边类型均可参与。内部 `scatterInCircle` 生成随机位置 + `hasCollisionInDrafts` 批量判碰，循环重试至不碰或达上限。<br>> **延后至 Phase 2b**：约束布局算法。当前用 scatterInCircle 作为简单替代。 |

### Step 7.5：认知操作 Spec 编写（docs/spec/）  --Complete

**目标**：在动工 Step 8 之前，为 4 个认知操作各写一份精确规格说明书，关闭所有"边写边决策"的敞口。

**动机**：Step 7 的 arrangement 操作足够简单——单步 move_node，逻辑一个自然段说清楚。Step 8 的 cognitive 操作不同——每个涉及跨图、沟通节点创建/删除、边复制/下沉、多图事务协调。今天 14 个 Q&A 中 12 个是 Step 8 的，说明设计信息散落在文档和对话里，缺一份集中的规格来源。


| # | 产出 | 说明 |
|---|------|------|
| 7.5.1 | `docs/specs/deconstruct.md` | 最简认知操作：原子实节点 → 抽象节点 + 空子图。边保留父图 + 下沉复制到子图（邻居变沟通节点），方向/类型保留原样。空子图自动创建沟通节点 |
| 7.5.2 | `docs/specs/induce.md` | Phase 2 最大挑战：多节点 → 抽象节点 + 子图 + 沟通节点/边。外部边共享沟通节点、禁止重边冲突、一票否决。抽象节点位置 = 选择集形心 |
| 7.5.3 | `docs/specs/internalize.md` | 转移节点至常识层：沟通节点删除、普通边全删、节点位置不变。scatterInCircle 找空位。递归子图处理 |
| 7.5.4 | `docs/specs/diverge.md` | 跨图创建启发节点 + 有向虚边。三种 case + 镜像完成（同一事务、一票否决）。方向由前端定。scatterInCircle 自动放位 |

> **依赖**：Step 7.5 的 Spec 是 Step 8 的输入。先写 Spec，再写代码——Spec 定稿后再开工 coding。

### Step 8：认知操作层实现（compose/cognitive/）  --Complete

**目标**：根据 Step 7.5 的 Spec，将 `operation_controller.ts` 中 Cognition 模式的 TODO stubs 下沉为引擎纯函数。依赖 Step 5 的基础设施（registry、search、placement）和 Step 7 的布局编排。



| # | 任务 | 说明 |
|---|------|------|
| 8.1 | `deconstruct.ts` (~60 行) | 解构：原子实节点 → 抽象节点 + 空子图。无跨图依赖，最简认知操作。⚠️ **注意**：解构时原有边的继承规则待定，详见 §十三 A2 |
| 8.2 | `induce.ts` (~120 行) | 归纳：多节点 → 抽象节点 + 子图 + 沟通节点/边。沟通节点位置：虚中心（选择集形心）+ `distributeOnTiers` 均匀环绕。抽象节点位置：选择集形心。**Phase 2 最大技术挑战**——父图删除 + 子图创建 + 沟通节点/边创建的三组原子操作协调 |
| 8.3 | `internalize.ts` (~70 行) | 内化：转移节点至常识层，`scatterInCircle` 找空位。若为抽象节点，子图子树位置不动，只断边。常识化由前端用户确认，引擎只做纯搬运 |
| 8.4 | `diverge.ts` (~90 行) | 发散：跨图创建启发节点 + 有向虚边。三种 case 场景处理 + `scatterInCircle` 自动生成镜像节点位置。依赖 `search` 做跨图节点查找 |
| 8.5 | 新建 `compose/index.ts` (~5 行) | 统一 re-export 所有认知操作和布局操作。Phase 3 扩展点 |

### Step 9：测试覆盖  --Complete

| # | 任务 | 测试数 | 状态 |
|---|------|:--:|:--:|
| 9.1 | `core/validate.test.ts` | 17 | ✅ |
| 9.2 | `core/execute.test.ts` | 13 | ✅ |
| 9.3 | `core/reversal.test.ts` | 8 | ✅ |
| 9.4 | `core/replay.test.ts` | 3 | ✅ |
| 9.5 | `core/sync.test.ts` | 3 | ✅ |
| 9.6 | `infrastructure/graph_registry.test.ts` | 6 | ✅ |
| 9.7 | `infrastructure/search.test.ts` | 3 | ✅ |
| 9.8 | `collision.test.ts` | 14 | ✅ |
| 9.9 | `infrastructure/placement.test.ts` | 9 | ✅ |
| 9.10 | `core/checkers/rule_checkers.test.ts` | — | 跳过。6 项原子规则 + Phase 2 新增规则全部通过 validate.test.ts 间接覆盖 |
| 9.11 | `compose/pipeline.test.ts` | 5 | ✅ |
| 9.12 | `compose/arrangement/move.test.ts` | 2 | ✅ |
| 9.13 | `compose/arrangement/orbit.test.ts` | 4 | ✅ |
| 9.14 | `compose/arrangement/path.test.ts` | 2 | ✅ |
| 9.15 | `compose/arrangement/adjust.test.ts` | 3 | ✅ |
| 9.16 | `compose/cognitive/deconstruct.test.ts` | 5 | ✅ |
| 9.17 | `compose/cognitive/induce.test.ts` | 4 | ✅ |
| 9.18 | `compose/cognitive/internalize.test.ts` | 4 | ✅ |
| 9.19 | `compose/cognitive/diverge.test.ts` | 3 | ✅ |

重复文件已检测：根目录 `tests/pipeline.test.ts`（6 tests）和 `tests/search.test.ts`（9 tests）功能被 `compose/pipeline.test.ts` 和 `infrastructure/search.test.ts` 覆盖，后续可清理。

### Step 10：公开 API 收口（先于 Step 11）  --Complete

导出分为 6 类：

| 分类 | 导出函数 | 消费者 |
|------|---------|--------|
| `apply` | `applyOperation` | graph_store 单步提交 |
| `applyBatch` | `applyBatch` | operation_controller 批量事务（compose 函数只产出 operations，不执行） |
| `replay` | `replayGraph` / `replayToStep` | 历史回溯 |
| `reversal` | `createReversal` | graph_store undo |
| `compose` | arrangement + cognitive 全部编排函数 | operation_controller |
| `infrastructure` | registry / search / ID 生成 / normalize / validateGraph / 常量 | graph_store 初始化与查询 |

不导出（引擎内部）：

| 文件 | 原因 |
|------|------|
| `execute.ts` | 仅被 apply / applyBatch / replay 内部调用 |
| `validate.ts` | 仅被 apply / applyBatch 内部调用 |
| `sync.ts` | 仅被 execute.ts 内部调用 |
| `checkers/` | 原子规则，被 validate 编排 |
| `collision.ts` / `placement.ts` / `geometry.ts` | compose 内部原语 |

| # | 任务 | 说明 |
|---|------|------|
| 10.1 ✅ | 按 6 类重新组织 `engine/src/index.ts` 导出结构 | apply / applyBatch / replay / reversal / compose / infrastructure 六大块，含分区标题和消费者说明 |
| 10.2 ✅ | 为每个导出函数标注消费者 | `/** 消费者：graph_store */` 或 `/** 消费者：operation_controller */`，共 26 处 |
| 10.3 ✅ | 确认不导出列表 | execute / validate / sync / checkers / collision / placement / geometry 均不出现在 index.ts（仅 `validateGraph` 例外——公开全图体检函数） |

### Step 11：前端适配（依赖 Step 10 的 API 收口）  --Complete

| # | 任务 | 说明 |
|---|------|------|
| 11.1 ✅ | `graph_store.ts` 改为调 `GraphEngine.apply()` | store 退化：保留 undoStack、selectedNodeId 等 UI 状态；替换 apply 路径；lastValidationResult 改为引用 Engine 返回值 |
| 11.2 ✅ | `operation_controller.ts` Arrangement 模式改为调 `GraphEngine.compose.arrangement.xxx()` | 替换位置计算 stubs。`handleMoveNode` 调引擎 `moveNode` compose 函数 → applyBatch 提交。草稿预览 UI 在 Phase 2b 实现 |
| 11.3 ✅ | `operation_controller.ts` 认知操作 stubs 改为调 `GraphEngine.compose.cognitive.xxx()` | 替换 TODO stubs。deconstruct / induce / internalize 已接入引擎 compose 函数 + applyBatch。diverge 工具栏入口待后续添加 |
| 11.4 ✅ | `graph_persistence.ts` 实现 `PersistenceAdapter`（localStorage） | `localStorageAdapter` 实现 `PersistenceAdapter` 接口。所有方法返回 Promise |
| 11.5 ✅ | 更新前端所有 import 路径 | `@/definitions/validators/xxx` → `@my-project/graph-engine`。剩余前端专属类型（draft_types / ui_types）保持不变。编译通过 |
| 11.6 ✅ | 清理前端与 GE 职责重合的冗余代码 | 删除 6 个文件：`operation_executor.ts`、`operation_validator.ts`、`rule_checkers.ts`、`graph_rules.ts`、`graph_validator.ts`、`graph_utils.ts`。ID 生成替换为引擎 `generateNodeId` / `generateEdgeId`。编译通过，119 引擎测试通过 |

---