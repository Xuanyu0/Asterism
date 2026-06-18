/**
 * index.ts
 *
 * 功能：
 *     GraphEngine 公开 API 入口。所有外部消费者通过此文件导入。
 *
 * 规则：
 *     - 只导出外部使用者需要的类型和函数
 *     - 内部实现细节（core/ 内部函数、checkers/ 原子函数）不从此文件暴露
 *     - Phase 2：类型导出 + 核心函数导出
 *     - Phase 3：AI Collabrator 消费接口不变
 *
 * 外部使用方式：
 *     import type { GraphData, NodeData, GraphOperation, ValidationResult } from '@my-project/graph-engine'
 *     import { GraphEngine } from '@my-project/graph-engine'
 */

// Types
export type {
    GraphPosition,
    GraphId,
    NodeId,
    EdgeId,
    GraphKind,
    GraphData,
    GraphCognitiveState,
    FoldedDependencyState,
    NodeRole,
    KnowledgeNodeKind,
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
    GraphRegistry,
    SearchResult,
    NodeRadiusMap,
} from './types/graph_data'

export type { LayoutRules, NodeRules } from './core/rules'

export type { TierAssignment } from './infrastructure/placement'

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
    AtomicOperation,
    GraphOperation,
} from './types/atomic_operations'

export type {
    ExploreOperation,
    DiscoverOperation,
    DeconstructOperation,
    InduceOperation,
    InternalizeOperation,
    CognitiveOperation,
    CognitiveResult,
} from './types/cognitive_operations'

export type {
    ValidationLevel,
    ValidationTargetType,
    ValidationIssue,
    ValidationResult,
} from './types/validation'

export type {
    OperationLogEntry,
    OperationLog,
    State,
} from './types/operation_log'

// Rules
export { DEFAULT_LAYOUT_RULES, DEFAULT_NODE_RULES } from './core/rules'

// Core functions
export { executeOperation } from './core/execute'
export { collectDependencyNodeIds } from './core/traversal'
export { validateOperation } from './core/validate'
export { applyOperation } from './core/apply'
export { normalizeGraph } from './core/normalize'
export { generateNodeId, generateEdgeId, generateGraphId } from './core/id'
export { createReversal } from './core/reversal'
export { replayGraph, replayToStep } from './core/replay'
export { syncReferenceNodeDegree } from './core/sync'
export { validateGraph } from './core/checkers/graph_validator'

// Infrastructure
export {
    createRegistry,
    registerGraph,
    getGraph,
    hasGraph,
    unregisterGraph,
    listGraphs,
    searchNodes,
    hasCollisionInDrafts,
    hasCollisionAt,
    positionOnCircle,
    snapOrbit,
    distributeOnTiers,
    distributeOnLine,
    scatterInCircle,
    computeTierSpacing,
} from './infrastructure'

// Compose
export {
    applyBatch,
    moveNode,
    adjustDistance,
    adjustOrbit,
    orbit,
    pathLayout,
    deconstruct,
    diverge,
    induce,
} from './compose'
export type {
    DraftPosition,
    ComposeIssue,
    ComposeResult,
    BatchOptions,
    PerOpResult,
    BatchResult,
    DraftOrbitPosition,
    OrbitParams,
    PathParams,
    DeconstructParams,
    DivergeParams,
    InduceParams,
} from './compose'

// SPI (Service Provider Interface) types
export type { PersistenceAdapter } from './spi/persistence'
