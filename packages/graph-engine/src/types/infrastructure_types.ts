/**
 * infrastructure_types.ts
 *
 * 功能：
 *     定义基础设施层（infrastructure/）和 compose 层依赖的运行时辅助类型。
 *     这些类型不参与 GraphData 持久化——它们是运行时索引、查询结果、渲染辅助。
 *
 * 总体结构：
 *     1. GraphRegistry  — 多图运行时索引
 *     2. SearchResult   — 跨图节点搜索结果
 *     3. NodeRadiusMap  — 碰撞检测半径特例覆盖
 *
 * 规则：
 *     1. 本文件中的类型不写入 localStorage / JSONB。
 *     2. 与 graph_data.ts 分离——graph_data.ts 只包含可持久化的图结构类型。
 *
 * 外部如何使用：
 *     import type { GraphRegistry, SearchResult, NodeRadiusMap } from '@my-project/graph-engine'
 */

import type { GraphData, GraphId, NodeId, NodeData } from './graph_data'

/** 多图上下文。Map<GraphId, GraphData> 的类型别名。 */
export type GraphRegistry = Map<GraphId, GraphData>

/** 跨图节点搜索结果。 */
export interface SearchResult {
    /** 节点所在图 ID。 */
    graphId: GraphId
    /** 节点 ID。 */
    nodeId: NodeId
    /** 节点完整数据。 */
    node: NodeData
    /** 从根图到该节点所在图的 ID 路径（含 graphId），通过注册表 parentGraphId 回溯得到。 */
    graphPath: GraphId[]
}

/**
 * 节点半径特例覆盖。
 *
 * 碰撞检测默认按 r = r₀ · √(1 + degree) 计算半径。
 * 此 Map 中注册的节点使用指定半径，覆盖公式计算结果。
 */
export type NodeRadiusMap = Map<NodeId, number>
