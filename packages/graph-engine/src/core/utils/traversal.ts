/**
 * traversal.ts
 *
 * 功能：
 *     图遍历算法与引用节点查询。从目标节点沿有向实边反向搜索所有前置依赖节点，
 *     并查询同图内指向某源节点的引用节点。
 *
 * 总体结构：
 *     1. collectDependencyNodeIds — 反向 DFS 搜索前置依赖节点 ID
 *     2. findReferenceNodesPointingTo — 查找同图内指向该源节点的引用节点
 *
 * 规则：
 *     1. 仅搜索 direction === 'directed' 且 kind === 'real' 的边。
 *     2. targetNodeId 本身不在返回结果中。
 *
 * 外部如何使用：
 *     import { collectDependencyNodeIds, findReferenceNodesPointingTo } from './utils/traversal'
 */

import type { GraphData, NodeData, NodeId } from '../../types/graph_data'

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

/**
 * 功能：
 *     查找同图内指向该源节点的引用节点。
 *
 * 规则：
 *     谓词：role === 'reference' && sourceNodeId === 入参 && sourceGraphId === graph.id。
 *     executeDeleteNode 的级联删除面与 reversal 的逆元捕获面共用此谓词，
 *     避免同一语义在三处各自书写而漂移。
 */
export function findReferenceNodesPointingTo(graph: GraphData, sourceNodeId: NodeId): NodeData[] {
    return graph.nodes.filter(
        node => node.role === 'reference' &&
            node.sourceNodeId === sourceNodeId &&
            node.sourceGraphId === graph.id,
    )
}
