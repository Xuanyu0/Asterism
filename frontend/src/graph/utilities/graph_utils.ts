/**
 * graph_utils.ts
 *
 * 功能：
 * 提供 GraphData 操作相关的纯工具函数，不依赖 Pinia Store。
 *
 * 总体结构：
 * 1. normalizeGraph — 补齐 GraphData 的认知状态默认值
 * 2. cleanGraphAfterDeleteNode — 删除节点后清理失效的折叠状态
 * 3. collectDependencyNodeIds — 从目标节点反向搜索有向实边前置依赖
 *
 * 外部如何使用：
 * import { normalizeGraph } from '@/graph/graph_utils'
 */

import type { GraphData, NodeId } from '@/definitions/types/graph_types'

/**
 * 功能：
 *     补齐 GraphData 的认知状态默认值。
 *
 * 规则：
 *     1. 只补充缺失的默认字段。
 *     2. 不修改已有字段。
 *
 * 使用：
 *     graphStore.setCurrentGraph() 内部调用。
 */
export function normalizeGraph(graph: GraphData): GraphData {
    return {
        ...graph,
        cognitiveState: graph.cognitiveState ?? {
            foldedDependencies: [],
        },
    }
}

/**
 * 功能：
 *     删除节点后清理 GraphData 中失效的折叠状态。
 *
 * 规则：
 *     1. 移除以被删节点为折叠目标的状态记录。
 *     2. 从其他折叠状态的 foldedNodeIds 中移除被删节点。
 *     3. 如果折叠状态的 foldedNodeIds 变空，移除该状态记录。
 *
 * 使用：
 *     operation_executor.ts 内部调用。
 */
export function cleanGraphAfterDeleteNode(graph: GraphData, deletedNodeId: NodeId): GraphData {
    const currentCognitiveState = graph.cognitiveState ?? { foldedDependencies: [] }

    return {
        ...graph,
        cognitiveState: {
            ...currentCognitiveState,
            foldedDependencies: currentCognitiveState.foldedDependencies
                .filter(item => item.targetNodeId !== deletedNodeId)
                .map(item => ({
                    ...item,
                    foldedNodeIds: item.foldedNodeIds.filter(nodeId => nodeId !== deletedNodeId),
                }))
                .filter(item => item.foldedNodeIds.length > 0),
        },
    }
}

/**
 * 功能：
 *     从目标节点沿有向实边反向搜索所有前置依赖节点。
 *
 * 规则：
 *     1. 只沿有向实边（directed + real）搜索。
 *     2. 使用栈迭代实现搜索，避免递归栈溢出。
 *     3. 目标节点本身不会出现在结果中。
 *
 * 使用：
 *     operation_executor.ts 内部调用。
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
