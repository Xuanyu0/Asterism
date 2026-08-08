/**
 * atomic_operations.ts
 *
 * 功能：
 *     定义引擎层原子操作的类型。引擎最小不可分修改单位。
 *
 * 总体结构：
 *     1. 11 种原子操作 interface
 *     2. AtomicOperation：联合类型
 *
 * 规则：
 *     - 原子操作由 execute.ts / validate.ts / reversal.ts / replay.ts 处理
 *     - 认知操作（explore / unearth / deconstruct / induce / internalize）不属于此层
 *     - CognitiveView 合并进原子层（collapse_dependency / expand_dependency 直接修改 cognitiveState）
 *
 * 外部使用方式：
 *     import type { AtomicOperation, AddNodeOperation } from '@my-project/graph-engine'
 */

import type { EdgeData, EdgeId, GraphData, GraphId, NodeData, NodeId, NodePosition } from './graph_data'

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
    /**
     * 显式折叠成员名单。存在时 execute 直接使用字段值照名单恢复，不重算；
     * 缺省时 execute 用 collectDependencyNodeIds 重算（正常折叠路径）。
     * expand_dependency 的逆元（collapse_dependency）携带原折叠条目时使用。
     */
    foldedNodeIds?: NodeId[]
}

export interface ExpandDependencyOperation {
    type: 'expand_dependency'
    targetNodeId: NodeId
}

export interface AddGraphOperation {
    type: 'add_graph'
    graph: GraphData
}

export interface DeleteGraphOperation {
    type: 'delete_graph'
    graphId: GraphId
}

export type AtomicOperation =
    | AddNodeOperation
    | AddEdgeOperation
    | DeleteNodeOperation
    | DeleteEdgeOperation
    | UpdateNodeOperation
    | UpdateEdgeOperation
    | MoveNodeOperation
    | CollapseDependencyOperation
    | ExpandDependencyOperation
    | AddGraphOperation
    | DeleteGraphOperation

/** 向后兼容别名。前端 / 操作日志沿用此名称。 */
export type GraphOperation = AtomicOperation
