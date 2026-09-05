/**
 * index.ts
 *
 * 功能：
 *
 *     GraphEngine 公开 API 入口。所有外部消费者通过此文件导入。
 *
 * 导出分 7 类：
 *
 *     - apply           — 前端 graph_store 单步提交
 *     - applyBatch      — 前端 operation_controller 批量事务
 *     - replay          — 前端操作日志 历史回溯
 *     - reversal        — 前端 graph_store undo
 *     - compose         — 前端 operation_controller 编排操作
 *     - infrastructure  — 前端 graph_store 初始化、Registry 管理、ID 生成、校验
 *     - derive          — 派生值（form / abstractionLevel 读取时计算）
 *
 * 规则：
 *
 *     - execute / validate / sync / validators / collision / placement / geometry 不导出
 *     - compose 函数只产出 operations，不执行——执行统一经 apply / applyBatch
 *
 * 外部如何使用：
 *
 *     import type { GraphData, NodeData } from '@my-project/graph-engine'
 *     import { applyBatch, searchNodes } from '@my-project/graph-engine'
 */

// ═══════════ Types ═══════════

/** 消费者：全部前端模块（类型注解、接口契约）。 */
export type {
    GraphPosition,
    GraphId,
    NodeId,
    EdgeId,
    GraphKind,
    GraphData,
    GraphCognitiveState,
    FoldedDependencyState,
    NodeKind as NodeRole,
    KnowledgeState as KnowledgeNodeKind,
    RealNodeForm,
    ReferenceNodeKind,
    NodePosition,
    NodeBase,
    KnowledgeNodeData,
    ReferenceNodeData,
    NodeData,
    EdgeKind,
    EdgeDirection,
    EdgeData,
    DeriveNodeForm,
    DeriveAbstractionLevel,
} from './types/graph_data'

/** 消费者：前端 graph_store / operation_controller、引擎 compose 层。 */
export type {
    GraphLookup,
    SearchResult,
    NodeRadiusMap,
} from './types/infrastructure_types'

/** 消费者：引擎内部 & 前端渲染层。 */
export type { LayoutRules } from './core/layout_rules'

/** 消费者：graph_store.applyBatch / operation_controller / 操作日志。 */
export type {
    AddNodeOperation,
    AddEdgeOperation,
    DeleteNodeOperation,
    DeleteEdgeOperation,
    UpdateNodeOperation,
    UpdateEdgeOperation,
    MoveNodeOperation,
    CollapseDependencyOperation,
    ExpandDependencyOperation,
    AddGraphOperation,
    DeleteGraphOperation,
    AtomicOperationInGraph,
    AtomicGraphOperation,
    GraphOperation,
} from './types/atomic_operations'

/** 消费者：graph_store（多图注册表，applyBatches 参数）。 */
export type { GraphRegistry } from './types/graph_data'

/** 消费者：operation_controller（Cognition 模式类型标签）。 */
export type {
    ExploreOperation,
    UnearthOperation,
    DeconstructOperation,
    InduceOperation,
    InternalizeOperation,
    CognitiveOperation,
    CognitiveResult,
} from './types/cognitive_operations'

/** 消费者：graph_store（校验返回值）。 */
export type {
    ValidationSeverity,
    ValidationTargetType,
    ValidationIssue,
    ValidationResult,
} from './types/validation'

/** 消费者：graph_store（操作日志 & undo/redo）。 */
export type {
    BatchesLog,
    CommitLog,
    OperationLogTree,
    State,
} from './types/operation_log'

/** 消费者：graph_persistence.ts（localStorage 实现 SPI 契约）。Phase 3 扩展点。 */
export type { PersistenceAdapter } from './spi/persistence'

// ═══════════════════════════════════════════════════════════════════
// applyBatch — 批量事务（GraphData 修改唯一入口）
//
// 消费者：
//     operation_controller — compose 函数产出 operations 后，
//     由 operation_controller 调 applyBatch 统一提交。
//     Phase 3 AI Runtime — 批量提交操作序列。
// ═══════════════════════════════════════════════════════════════════

/**
 * 功能：
 *
 *     批量事务执行。逐条 validate → 全通过后逐条 execute。
 *     任一失败则整批丢弃。
 *
 * 消费者：
 *
 *     operation_controller（arrangement / cognition 模式确认提交）
 *
 * 使用：
 *
 *     const result = applyBatch(parentGraph, operations, registry)
 *     if (!result.validation.valid) { ... }  // 按钮灰掉
 */
export { applyBatch } from './core/apply_batch'
export type { BatchOptions, PerOpResult, BatchResult } from './core/apply_batch'

// ═══════════════════════════════════════════════════════════════════
// applyBatches — 多图批处理（多图管理层）
//
// 消费者：
//     graph_store.commitBatchToGraphs — 委托 applyBatches 统一执行多批次操作。
//     输入注册表 + 多批次操作，输出新注册表 + 校验 + 逆元序列。
// ═══════════════════════════════════════════════════════════════════

/**
 * 功能：
 *
 *     多图批处理。统一循环处理图内（委托 applyBatch）与图级（add_graph / delete_graph 兑现）
 *     操作，返回新注册表 + 聚合校验 + 逆元序列。
 *
 * 消费者：
 *
 *     graph_store.commitBatchToGraphs（前端对接在 06.3）
 *
 * 使用：
 *
 *     const result = applyBatches(registry, batches)
 *     if (!result.validation.valid) { ... }  // 整批丢弃，注册表不变
 */
export { applyBatches } from './core/apply_batches'
export type { ApplyBatchesResult } from './core/apply_batches'
export type { OperationBatch } from './types/compose_types'

// ═══════════════════════════════════════════════════════════════════
// replay — 历史回溯
//
// 消费者：
//     graph_store 操作日志 — 从基线图 + 操作序列重建任意历史状态。
// ═══════════════════════════════════════════════════════════════════

/**
 * 功能：
 *
 *     操作序列回放。给定基线 GraphData + 操作序列，重建历史状态。
 *
 * 消费者：
 *
 *     graph_store（操作日志历史回溯）
 *
 * 使用：
 *
 *     const state = replayGraph(baseGraph, operations)
 *     const state = replayToStep(baseGraph, operations, step)
 */
export { replayGraph, replayToStep } from './core/replay'

// ═══════════════════════════════════════════════════════════════════
// reversal — undo
//
// 消费者：
//     graph_store — apply 前捕获逆操作，undo 时执行逆操作序列。
// ═══════════════════════════════════════════════════════════════════

/**
 * 功能：
 *
 *     逆操作构造器。在 execute 前调用，捕获操作对象完整前状态，返回逆操作序列。
 *
 * 消费者：
 *
 *     graph_store（undo/redo）
 *
 * 使用：
 *
 *     const reversals = createReversal(graph, operation)
 *     // 执行后追加到 OperationLogTree
 */
export { createReversal } from './core/reversal'

// ═══════════════════════════════════════════════════════════════════
// compose — 编排操作
//
// 消费者：
//     operation_controller — arrangement 和 cognition 两种模式下的编排逻辑。
//     compose 函数只产出 { operations, issues, drafts }，不执行。
//     执行统一经 apply / applyBatch。
// ═══════════════════════════════════════════════════════════════════

/**
 * 功能：
 *
 *     布局与认知编排操作。产出 operations 序列、issues 校验列表和位置草稿。
 *
 * 消费者：
 *
 *     operation_controller
 *
 * 规则：
 *
 *     编排函数纯函数——不持有状态，不写入 graph_store，不直接调 applyBatch。
 *     调用方根据 issues 控制确认按钮，确认后拿 operations 调 applyBatch 提交。
 *
 * 使用：
 *
 *     const result = orbit(params)           // arrangement
 *     const result = deconstruct(params)     // cognitive
 *     // 前端预览 result.drafts，根据 result.issues 亮/灰按钮
 *     // 用户确认 → applyBatch(graph, result.operations, registry)
 */
export {
    // arrangement
    moveNode,
    adjustDistance,
    adjustOrbit,
    orbit,
    pathLayout,
    // cognitive
    deconstruct,
    diverge,
    induce,
    internalize,
    deleteAbstractNode,
} from './compose'
export type {
    DraftPosition,
    ComposeIssue,
    ComposeResult,
    DraftOrbitPosition,
    OrbitParams,
    PathParams,
    DeconstructParams,
    DivergeParams,
    InduceParams,
    InternalizeParams,
    DeleteAbstractNodeParams,
} from './compose'

// ═══════════════════════════════════════════════════════════════════
// infrastructure — 跨图搜索、碰撞检测、布局放置、几何工具
//
// 消费者：
//     前端搜索浮空窗 — diverge 操作前置跨图搜索。
//     compose 层 — 碰撞检测、布局放置。
// ═══════════════════════════════════════════════════════════════════

/**
 * 功能：
 *
 *     跨图节点搜索。按 label 子串匹配，遍历 graphIds 指定的全部图。
 *
 *     多图注册表管理函数（createRegistry / registerGraph / lookupGraph 等）已迁至前端 Runtime——
 *     引擎是纯函数，不持有注册表状态。前端通过 graph_registry.ts 管理 GraphId → GraphData 映射。
 *
 * 消费者：
 *
 *     前端搜索浮空窗（diverge 操作前置搜索）。
 *
 * 使用：
 *
 *     const results = searchNodes('相对论', allGraphIds, lookupGraph)
 *     const results = searchNodes('相对论', allGraphIds, lookupGraph, graphId)  // 限定图
 */
export { searchNodes } from './infrastructure'

/**
 * 功能：
 *
 *     单点碰撞准入判断。判断节点在目标位置是否会与已有节点碰撞。
 *
 * 消费者：
 *
 *     前端 preview_engine — 预览操作前预判碰撞而不实际修改图。
 *
 * 使用：
 *
 *     const collides = hasCollisionAt(nodeId, position, allNodes, nodeRadiusOverrides)
 */
export { hasCollisionAt } from './infrastructure'

/**
 * 功能：
 *
 *     全图 schema 校验。加载图时检查完整性。
 *
 * 消费者：
 *
 *     graph_store（加载图时校验）、test_case_factory
 *
 * 使用：
 *
 *     const result = validateGraph(graph)
 *     if (!result.valid) { ... }  // 拒绝加载
 */
export { validateGraph } from './core/validators/whole_graph_validator'

/**
 * 功能：
 *
 *     统一 ID 生成。使用 crypto.randomUUID()。
 *
 * 消费者：
 *
 *     compose 层（deconstruct / induce / diverge 创建新节点/边/图时）
 *
 * 使用：
 *
 *     const nodeId = generateNodeId()
 *     const edgeId = generateEdgeId()
 *     const graphId = generateGraphId()
 */
export {
    generateNodeId,
    generateEdgeId,
    generateGraphId,
} from './core/utils/id'

export { DEFAULT_LAYOUT_RULES } from './core/layout_rules'

// ═══════════════════════════════════════════════════════════════════
// derive — 派生值（读取时计算，不持久化）
//
// 消费者：
//     compose 层（deconstruct / internalize 的 form 检查）、前端渲染层。
// ═══════════════════════════════════════════════════════════════════

/**
 * 功能：
 *
 *     节点 form / abstractionLevel 的运行时派生函数。派生值不持久化，读取时计算，
 *     权威源为 childGraphId（子图结构）。
 *
 * 消费者：
 *
 *     compose 层（form 检查）、前端渲染层。
 *
 * 使用：
 *
 *     const form = deriveNodeForm(node)
 *     const level = deriveAbstractionLevel(lookupGraph, node)
 */
export { deriveNodeForm, deriveAbstractionLevel } from './core/derive'
