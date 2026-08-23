/**
 * 定义认知操作的类型。认知操作是原子操作的编排器——接收用户认知意图，返回原子操作序列。
 *
 * @remarks
 * 认知操作不是原子操作，不直接进入 execute / validate 层——由 compose/cognitive/ 接收后
 * 编排为图内原子操作序列（AtomicOperationInGraph），再经 applyBatch / applyBatches 执行。
 */

import type { NodeId, EdgeId } from './graph_data'
import type { AtomicOperationInGraph } from './atomic_operations'

export interface ExploreOperation {
    type: 'explore'
}

export interface UnearthOperation {
    type: 'unearth'
    targetNodeId?: NodeId
    targetEdgeId?: EdgeId
}

export interface DeconstructOperation {
    type: 'deconstruct'
    nodeId: NodeId
}

export interface InduceOperation {
    type: 'induce'
    nodeIds: NodeId[]
}

export interface InternalizeOperation {
    type: 'internalize'
    nodeIds: NodeId[]
}

export type CognitiveOperation =
    | ExploreOperation
    | UnearthOperation
    | DeconstructOperation
    | InduceOperation
    | InternalizeOperation

/**
 * 功能：
 *     认知操作（deconstruct / induce / internalize / diverge）的统一返回类型。
 *
 * 规则：
 *     - operations：原子操作序列，调用方逐条 apply() 或 applyBatch()（Phase 3）执行
 */
export interface CognitiveResult {
    operations: AtomicOperationInGraph[]
}
