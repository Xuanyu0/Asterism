/**
 * cognitive_operations.ts
 *
 * 功能：
 *     定义认知操作的类型。认知操作是原子操作的编排器——接收用户认知意图，返回原子操作序列。
 *
 * 总体结构：
 *     1. 5 种认知操作 interface
 *     2. CognitiveOperation：联合类型
 *     3. CognitiveResult：认知操作返回类型
 *
 * 规则：
 *     - 认知操作不直接被 execute.ts 处理（execute 对它们走 default: return graph）
 *     - compose/cognitive/ 接收认知操作，编排为原子操作序列后通过 apply() 执行
 *
 * 外部使用方式：
 *     import type { CognitiveOperation, CognitiveResult } from '@my-project/graph-engine'
 */

import type { NodeId, EdgeId } from './graph_data'
import type { AtomicOperation } from './atomic_operations'

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
    operations: AtomicOperation[]
}
