/**
 * operations.ts
 *
 * 功能：
 *     定义知识图谱操作 Operation 的类型契约。
 *
 * 总体结构：
 *     1. CognitionOperation：认知演化相关操作
 *     2. DataOperation：直接修改 GraphData 的数据操作
 *     3. CognitiveViewOperation：会持久化的认知显示操作
 *     4. GraphOperation：所有操作的联合类型
 *
 * 设计原则：
 *     1. 本文件只定义操作类型，不执行操作
 *     2. UI 按钮操作可以映射为一个或多个 GraphOperation
 *     3. 浮空窗确认修改也属于 GraphData 更新操作
 *     4. 折叠状态虽然表现为视觉变化，但属于认知状态，需要跟随 GraphData 持久化
 *
 * 外部使用方式：
 *     import type { GraphOperation } from '@my-project/graph-engine'
 */

import type { EdgeData, EdgeId, GraphData, GraphId, NodeData, NodeId, NodePosition } from './graph_data'

export interface ExploreOperation {
    type: 'explore'
}

export interface DiscoverOperation {
    type: 'discover'
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

export interface AddNodeOperation {
    type: 'add_node'
    node: NodeData
}

export interface AddEdgeOperation {
    type: 'add_edge'
    edge: EdgeData
}

export interface DeleteNodeOperation {
    type: 'delete_node'
    nodeId: NodeId
}

export interface DeleteEdgeOperation {
    type: 'delete_edge'
    edgeId: EdgeId
}

export interface UpdateNodeOperation {
    type: 'update_node'
    node: NodeData
}

export interface UpdateEdgeOperation {
    type: 'update_edge'
    edge: EdgeData
}

export interface MoveNodeOperation {
    type: 'move_node'
    nodeId: NodeId
    position: NodePosition
}

export interface CollapseDependencyOperation {
    type: 'collapse_dependency'
    targetNodeId: NodeId
}

export interface ExpandDependencyOperation {
    type: 'expand_dependency'
    targetNodeId: NodeId
}

// Phase 2 additions═══════════════════════════════════════════

export interface AddGraphOperation {
    type: 'add_graph'
    graph: GraphData
}

export interface DeleteGraphOperation {
    type: 'delete_graph'
    graphId: GraphId
}

// 联合类型════════════════════════════════════════════════════

export type CognitionOperation =
    | ExploreOperation
    | DiscoverOperation
    | DeconstructOperation
    | InduceOperation
    | InternalizeOperation

export type DataOperation =
    | AddNodeOperation
    | AddEdgeOperation
    | DeleteNodeOperation
    | DeleteEdgeOperation
    | UpdateNodeOperation
    | UpdateEdgeOperation
    | MoveNodeOperation
    | AddGraphOperation
    | DeleteGraphOperation

export type CognitiveViewOperation =
    | CollapseDependencyOperation
    | ExpandDependencyOperation

export type GraphOperation =
    | CognitionOperation
    | DataOperation
    | CognitiveViewOperation
