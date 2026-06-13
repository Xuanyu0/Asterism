/**
 * graph_operation_types.ts
 *
 * 功能：
 * 定义知识图谱操作 Operation 的类型契约。
 *
 * 总体结构：
 * 1. CognitionOperation：认知演化相关操作
 * 2. DataOperation：直接修改 GraphData 的数据操作
 * 3. CognitiveViewOperation：会持久化的认知显示操作
 * 4. GraphOperation：所有操作的联合类型
 *
 * 设计原则：
 * 1. 本文件只定义操作类型，不执行操作
 * 2. UI 按钮操作可以映射为一个或多个 GraphOperation
 * 3. 浮空窗确认修改也属于 GraphData 更新操作
 * 4. 折叠状态虽然表现为视觉变化，但属于认知状态，需要跟随 GraphData 持久化
 *
 * 外部使用方式：
 * import type { GraphOperation } from '@/definations/types/graph_operation_types'
 */

import type { EdgeData, EdgeId, NodeData, NodeId, NodePosition } from '@my-project/graph-engine'

export interface ExploreOperation {
    type: 'explore' // 探索：开始新一轮学习，结束后添加知识块
}

export interface DiscoverOperation {
    type: 'discover' // 发掘：对虚节点或无向虚边开启学习
    targetNodeId?: NodeId // 发掘目标节点 id
    targetEdgeId?: EdgeId // 发掘目标边 id
}

export interface DeconstructOperation {
    type: 'deconstruct' // 解构：单个节点抽象并建立子图
    nodeId: NodeId // 被解构节点 id
}

export interface InduceOperation {
    type: 'induce' // 归纳：多个节点聚合为抽象节点
    nodeIds: NodeId[] // 被归纳节点 id 数组
}

export interface InternalizeOperation {
    type: 'internalize' // 内化：常识化实节点
    nodeIds: NodeId[] // 被内化节点 id 数组
}

export interface AddNodeOperation {
    type: 'add_node' // 添加节点
    node: NodeData // 准备添加的节点
}

export interface AddEdgeOperation {
    type: 'add_edge' // 添加边
    edge: EdgeData // 准备添加的边
}

export interface DeleteNodeOperation {
    type: 'delete_node' // 删除节点
    nodeId: NodeId // 准备删除的节点 id
}

export interface DeleteEdgeOperation {
    type: 'delete_edge' // 删除边
    edgeId: EdgeId // 准备删除的边 id
}

export interface UpdateNodeOperation {
    type: 'update_node' // 更新节点，通常由浮空窗确认触发
    node: NodeData // 更新后的节点
}

export interface UpdateEdgeOperation {
    type: 'update_edge' // 更新边，通常由浮空窗确认触发
    edge: EdgeData // 更新后的边
}

export interface MoveNodeOperation {
    type: 'move_node' // 移动节点，拖动结束后写回 GraphData
    nodeId: NodeId // 被移动节点 id
    position: NodePosition // 新节点坐标
}

export interface CollapseDependencyOperation {
    type: 'collapse_dependency' // 依赖折叠，视觉表现变化，但认知状态需要持久化
    targetNodeId: NodeId // DAG 末尾节点 id
}

export interface ExpandDependencyOperation {
    type: 'expand_dependency' // 依赖展开，移除对应目标节点的折叠认知状态
    targetNodeId: NodeId // 展开的目标节点 id
}

export type CognitionOperation =
    | ExploreOperation
    | DiscoverOperation
    | DeconstructOperation
    | InduceOperation
    | InternalizeOperation // 认知演化操作集合

export type DataOperation =
    | AddNodeOperation
    | AddEdgeOperation
    | DeleteNodeOperation
    | DeleteEdgeOperation
    | UpdateNodeOperation
    | UpdateEdgeOperation
    | MoveNodeOperation // 直接修改 GraphData 的操作集合

export type CognitiveViewOperation =
    | CollapseDependencyOperation
    | ExpandDependencyOperation // 会持久化的认知显示操作集合

export type GraphOperation =
    | CognitionOperation
    | DataOperation
    | CognitiveViewOperation // 全部图操作联合类型
