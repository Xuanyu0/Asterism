/**
 * traversal.ts
 *
 * 功能：
 *     图遍历算法。从目标节点沿有向实边反向搜索所有前置依赖节点。
 *
 * 总体结构：
 *     1. collectDependencyNodeIds — 反向 DFS 搜索前置依赖节点 ID
 *
 * 规则：
 *     1. 仅搜索 direction === 'directed' 且 kind === 'real' 的边。
 *     2. targetNodeId 本身不在返回结果中。
 *
 * 外部如何使用：
 *     import { collectDependencyNodeIds } from './traversal'
 */

import type { GraphData, NodeId } from '../types/graph_data'

/**
 * 功能：
 *     从目标节点沿有向实边反向搜索所有前置依赖节点。
 */
export function collectDependencyNodeIds(graph: GraphData, targetNodeId: NodeId): NodeId[] {
    const visitedNodeIds = new Set<NodeId>()
    const stack: NodeId[] = [targetNodeId]

    while (stack.length > 0) {
        const currentNodeId = stack.pop()

        if (!currentNodeId) {
            continue
        }

        const incomingDependencyEdges = graph.edges.filter(edge =>
            edge.target === currentNodeId &&
            edge.kind === 'real' &&
            edge.direction === 'directed',
        )

        for (const edge of incomingDependencyEdges) {
            if (!visitedNodeIds.has(edge.source)) {
                visitedNodeIds.add(edge.source)
                stack.push(edge.source)
            }
        }
    }

    visitedNodeIds.delete(targetNodeId)

    return Array.from(visitedNodeIds)
}
