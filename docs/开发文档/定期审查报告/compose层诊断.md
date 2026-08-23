# compose 层诊断

> 针对 `packages/graph-engine/src/compose/` 的专项诊断。来源：06 步骤执行中 oracle 审查发现 + 代码现状核对（2026-08-24）。
>
> 相关上下文：06 步骤（多图管理层）已完成，认知操作返回形态改造为 `{ batches, issues }`；本诊断聚焦 compose 层遗留问题与返回形态分裂。

---

## 一、现状概览

```
packages/graph-engine/src/compose/
├── index.ts                       — 统一出口（cognitive + arrangement + 类型）
├── cognitive/                     — 认知操作（已改造为 batches 判别联合）
│   ├── deconstruct.ts             → { batches: OperationBatch[], issues }
│   ├── induce.ts                  → { batches, issues }
│   ├── internalize.ts             → { batches, issues }
│   └── diverge.ts                 → { batches, issues, drafts }
├── arrangement/                   — 布局操作（仍返回旧 ComposeResult）
│   ├── move.ts / adjust.ts / orbit.ts / path.ts  → ComposeResult{ drafts?, issues, operations }
└── types/compose_types.ts         — ComposeResult + OperationBatch 判别联合
```

**返回形态分裂**（核心现状问题）：

| 层 | 返回形态 | 消费方 |
|---|---|---|
| 认知操作 | `{ batches: OperationBatch[], issues }`（判别联合）| 前端直接传 `result.batches` 给 applyBatches |
| 布局操作 | `ComposeResult{ drafts?, issues, operations: GraphOperation[] }`（旧形态）| 前端 `commitToCurrentGraph` 内部按图级/图内分拆 |

认知与布局的返回形态不一致；`ComposeResult` 类型仍描述旧形态（`operations`），与认知操作的 `batches` 契约漂移。

---

## 二、已知问题

### P-1（严重，预存）：正向认知批在 validate-all-first 下不可执行

- **位置**：`cognitive/induce.ts`（子图填充批）、`cognitive/diverge.ts`（Case B 当前图批）
- **问题**：批内 `add_edge` 端点依赖批内 `add_node`（沟通节点 / 启发节点）。`applyBatch` Phase 1 基于**输入图**校验全部操作 → `EDGE_SOURCE/TARGET_NOT_FOUND` → **整批丢弃**。validate-all-first 无法处理批内操作间的链式依赖。
- **性质**：非 06 回归（与 HEAD 版 pipeline/validate 逐行相同）；06.3 验收测试只模拟了 `add_graph + add_node` 填充，从未用真实 compose 输出跑通。
- **状态**：**dormant**——UI 侧 induce 是空数组 stub（`GraphModeSelector.vue` `controller.induce([])`）、diverge 无调用方，唯一真实接线的 deconstruct（子图批只有 add_node）恰好无链式依赖。
- **影响**：图内/图级平级管道对 4 个认知操作只有 2 个能真正跑通（deconstruct ✅ / internalize ✅ / induce ✗ / diverge Case B ✗）。
- **已知线索**：`BatchOptions.skipValidate` 注释明写"add_edge 端点依赖批内 add_node 恢复的节点必然误报"——设计者已知此问题，但只豁免了 undo 恢复型批，漏了正向 compose 批的同构结构。
- **修复方向**（待用户裁决）：
  1. 链式校验：每个操作对"运行中图"校验（改 validate-all-first 语义，影响面大）
  2. compose 前验证 + 正向 skipValidate：compose 构造时验证批内依赖，正向执行跳过 validate（改动小）
  3. 拆批：add_edge 拆到端点批之后独立成批（compose 调整批次结构）
- **时机**：07 前修 / 并入 07 / 维持 dormant。

### P-2（中，类型漂移）：compose 返回形态分裂

- **位置**：`types/compose_types.ts`（ComposeResult 仍带 `operations: GraphOperation[]`）、四个认知函数各自声明 `{ batches, issues }`、arrangement 仍返回 ComposeResult
- **问题**：认知操作已改造为 `batches` 判别联合，但 `ComposeResult` 类型与布局操作未同步——契约分裂：认知走新形态（batches）、布局走旧形态（operations + 前端分拆）。
- **影响**：类型契约漂移、ComposeResult 注释/文档过时、认知与布局消费路径不一致（认知直传 batches，布局经 commitToCurrentGraph 分拆）。
- **修复**：
  1. 定义共享返回契约（如 `CognitiveComposeResult` 或更新 `ComposeResult` 增加 `batches` 字段）
  2. 布局操作迁移到 `batches` 形态（arrangement 纯图内操作，可统一为 inGraph 批）
  3. 统一消费路径（前端直传 `result.batches`）

### P-3（低）：deconstruct.ts 头部注释过期

- **位置**：`cognitive/deconstruct.ts` 文件头（cleaner S3 遗漏）
- **问题**：规则 2"add_graph（空子图含沟通节点）"、规则 3"applyBatch 统一执行"、usage 示例 `applyBatch(parentGraph, result.operations, registry)` 均与实现不符（现为 add_graph 空图 + add_node 填充、batches 形态）。
- **修复**：更新注释与实现一致。

### P-4（低）：认知操作返回类型未复用共享契约

- **位置**：四个认知函数各自的返回类型声明
- **问题**：`{ batches: OperationBatch[], issues: ComposeIssue[] }` 逐函数重复声明，无共享类型别名；`ComposeResult` 未更新为含 batches。
- **修复**：抽取共享类型（配合 P-2）。

---

## 三、诊断分析

### 3.1. 返回形态分裂的根源

06 步骤改造认知操作返回 `batches`（判别联合），但**布局操作与 `ComposeResult` 类型未同步**——这是 06 范围内"只改认知、未动布局"的遗留。认知/布局两个子系统从此分裂为两条消费路径。

### 3.2. 链式依赖问题的本质

validate-all-first 的"基于输入图逐条校验"**假设批内操作互相独立**（无顺序依赖）。但认知操作的填充批（add_node + add_edge）天然有链式依赖（边依赖节点）。这是"validate-all-first 的独立性假设"与"认知操作批内依赖"的结构冲突。

### 3.3. 与 applyBatches 的衔接

- 认知操作（batches）→ applyBatches：✅ 已通（P-1 缺陷除外）
- 布局操作（operations + 前端分拆）→ applyBatches：⚠️ 经 `commitToCurrentGraph` 分拆，路径绕行
- 修复 P-2 后：认知/布局统一返回 batches → 前端统一直传 → 消费路径单一

---

## 四、修复优先级建议

| 优先级 | 项 | 理由 |
|---|---|---|
| 高 | P-1（链式依赖）| 认知操作 induce/diverge 当前不可执行，影响平级管道的完整性；需用户裁决方向与时机 |
| 中 | P-2（返回形态分裂）| 契约漂移，认知/布局消费路径不一致 |
| 低 | P-3 / P-4（注释 + 共享类型）| 低成本清理，可随 P-2 一并处理 |
