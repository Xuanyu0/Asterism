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

export type {
    ExploreOperation,
    DiscoverOperation,
    DeconstructOperation,
    InduceOperation,
    InternalizeOperation,
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
    CognitionOperation,
    DataOperation,
    CognitiveViewOperation,
    GraphOperation,
} from './types/operations'

export type {
    ValidationLevel,
    ValidationTargetType,
    ValidationIssue,
    ValidationResult,
} from './types/validation'

export type { CognitiveResult } from './types/cognitive'

export type {
    OperationLogEntry,
    OperationLog,
    ReflogEntry,
} from './types/operation_log'
