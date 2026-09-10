/**
 * atomic_operations.ts
 *
 * 功能：
 *     定义引擎层原子操作的类型。引擎最小不可分修改单位。
 *
 * 总体结构：
 *     1. 12 种原子操作 interface
 *     2. AtomicOperationInGraph：图内 9 种联合
 *     3. AtomicGraphOperation：图级 3 种联合
 *     4. AtomicOperation：全部原子操作的并集（图内 + 图级）
 *
 * 规则：
 *     - 图内原子操作由 execute_operation_in_graph.ts / rules/preconditions/in_graph.ts / create_reversal_in_graph.ts / replay.ts 处理
 *     - 图级原子操作（add_graph / delete_graph / update_graph）由 apply_batches.ts 兑现
 *     - 认知操作（explore / unearth / deconstruct / induce / internalize）不属于此层
 *     - CognitiveView 合并进原子层（collapse_dependency / expand_dependency 直接修改 cognitiveState）
 *
 * 外部使用方式：
 *     import type { AtomicOperationInGraph, AddNodeOperation } from '@my-project/graph-engine'
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
    /**
     * 只构造空图：graph 仅含元数据字段（id / kind / parentGraphId / ownerNodeId / 时间戳），
     * nodes / edges 必须为空（validateGraphOperation 强制校验）。内容统一走图内操作（add_node 等）填充。
     */
    graph: GraphData
}

export interface DeleteGraphOperation {
    type: 'delete_graph'
    /**
     * 携带被删空图的骨架（仅元数据字段 id / kind / parentGraphId / ownerNodeId / 时间戳，nodes / edges 空）。
     * 签名与 AddGraphOperation 统一为 { type, graph }——逆元 add ↔ delete 互逆都操作图数据。
     * 只能删除空图：validateGraphOperation 校验注册表目标图空图（与 add_graph 只建空图对称）。
     */
    graph: GraphData
}

export interface UpdateGraphOperation {
    type: 'update_graph'
    /**
     * 携带更新后的完整图对象（update_node 式全量替换，非字段级增量）。
     * 不新增空值 / 唯一性等业务校验（由前端用例层承担）。
     */
    graph: GraphData
}

/** 图内原子操作：单图变换，由 executeOperation 执行。 */
export type AtomicOperationInGraph =
    | AddNodeOperation
    | AddEdgeOperation
    | DeleteNodeOperation
    | DeleteEdgeOperation
    | UpdateNodeOperation
    | UpdateEdgeOperation
    | MoveNodeOperation
    | CollapseDependencyOperation
    | ExpandDependencyOperation

/** 图级原子操作：多图注册表层面的建图 / 删图 / 整图更新，由 applyBatches 兑现。 */
export type AtomicGraphOperation = AddGraphOperation | DeleteGraphOperation | UpdateGraphOperation

/** 全部原子操作的并集：图内（AtomicOperationInGraph）与图级（AtomicGraphOperation）。 */
export type AtomicOperation = AtomicOperationInGraph | AtomicGraphOperation
