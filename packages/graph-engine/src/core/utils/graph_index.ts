/**
 * 图节点索引辅助。
 */

import type { GraphData, NodeData, NodeId } from '../../types/graph_data'

/**
 * 按 id 建立节点索引。
 *
 * @param graph - 待索引的图
 * @returns 节点 id → 节点对象 的 Map
 */
export function indexNodesById(graph: GraphData): Map<NodeId, NodeData> {
    return new Map(graph.nodes.map((node) => [node.id, node]))
}
