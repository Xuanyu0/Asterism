/**
 * execute.ts
 *
 * 功能：
 *     将 GraphOperation 转换为新的 GraphData。所有函数为纯函数，不修改入参。
 *
 * 总体结构：
 *     1. executeOperation — Operation router，按 type 分派
 *     2. cleanGraphAfterDeleteNode — 删除节点后清理失效的折叠状态
 *     3. collectDependencyNodeIds — 从目标节点反向搜索有向实边前置依赖
 *     4. 各 executeXxx — 11 种 Operation 具体执行函数
 *
 * 规则：
 *     1. 本模块不负责校验。
 *     2. 所有操作返回新的 GraphData，不修改传入 GraphData。
 *     3. 所有变更操作会写入 timestamp。
 *
 * 外部如何使用：
 *     import { executeOperation, collectDependencyNodeIds } from '@my-project/graph-engine'
 */

import type { GraphData, NodeId } from '../types/graph_data'
import type { GraphOperation } from '../types/atomic_operations'

/**
 * 功能：
 *     将 GraphOperation 转换为新的 GraphData。
 *
 * 规则：
 *     1. 本函数不负责校验。
 *     2. 本函数不修改传入 GraphData。
 *     3. 所有操作返回新的 GraphData。
 */
export function executeOperation(graph: GraphData, operation: GraphOperation): GraphData {
    switch (operation.type) {
        case 'add_node':
            return executeAddNode(graph, operation)

        case 'add_edge':
            return executeAddEdge(graph, operation)

        case 'delete_node':
            return executeDeleteNode(graph, operation)

        case 'delete_edge':
            return executeDeleteEdge(graph, operation)

        case 'update_node':
            return executeUpdateNode(graph, operation)

        case 'update_edge':
            return executeUpdateEdge(graph, operation)

        case 'move_node':
            return executeMoveNode(graph, operation)

        case 'collapse_dependency':
            return executeCollapseDependency(graph, operation)

        case 'expand_dependency':
            return executeExpandDependency(graph, operation)

        case 'add_graph':
        case 'delete_graph':
            // Phase 3: 多图上下文由 graph_registry + compose/ 层管理
            return graph

        default:
            return graph
    }
}

/**
 * 功能：
 *     从目标节点沿有向实边反向搜索所有前置依赖节点。
 *
 * 规则：
 *     1. 只沿有向实边（directed + real）搜索。
 *     2. 使用栈迭代实现搜索。
 *     3. 目标节点本身不会出现在结果中。
 *
 * 使用：
 *     executeCollapseDependency 内部调用。
 *     validate.ts 导入用于 collapse_dependency 校验。
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
 *     删除节点后清理 GraphData 中失效的折叠状态。
 *
 * 规则：
 *     1. 移除以被删节点为折叠目标的状态记录。
 *     2. 从其他折叠状态的 foldedNodeIds 中移除被删节点。
 *     3. 如果折叠状态的 foldedNodeIds 变空，移除该状态记录。
 *
 * 使用：
 *     executeDeleteNode 内部调用。
 */
function cleanGraphAfterDeleteNode(graph: GraphData, deletedNodeId: NodeId): GraphData {
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

// ------------------------------ add / delete / update / move / fold / expand

function executeAddNode(graph: GraphData, operation: { type: 'add_node'; node: GraphData['nodes'][number] }): GraphData {
    const now = new Date().toISOString()

    return {
        ...graph,
        nodes: [...graph.nodes, { ...operation.node, createdAt: now, updatedAt: now }],
        updatedAt: now,
    }
}

function executeAddEdge(graph: GraphData, operation: { type: 'add_edge'; edge: GraphData['edges'][number] }): GraphData {
    const { source, target } = operation.edge
    const now = new Date().toISOString()

    return {
        ...graph,
        nodes: graph.nodes.map(node => {
            if (node.id === source || node.id === target) {
                return { ...node, degree: node.degree + 1 }
            }

            return node
        }),
        edges: [...graph.edges, { ...operation.edge, createdAt: now, updatedAt: now }],
        updatedAt: now,
    }
}

function executeDeleteNode(graph: GraphData, operation: { type: 'delete_node'; nodeId: NodeId }): GraphData {
    const deletedEdges = graph.edges.filter(
        edge => edge.source === operation.nodeId || edge.target === operation.nodeId,
    )

    // 统计每个相邻节点因本次删除失去的边数。
    // delete_node 必须同步更新 degree，否则后续操作（如渲染线宽）会基于错误的度数。
    const degreeLoss = new Map<string, number>()
    for (const edge of deletedEdges) {
        if (edge.source !== operation.nodeId) {
            degreeLoss.set(edge.source, (degreeLoss.get(edge.source) ?? 0) + 1)
        }
        if (edge.target !== operation.nodeId) {
            degreeLoss.set(edge.target, (degreeLoss.get(edge.target) ?? 0) + 1)
        }
    }

    const now = new Date().toISOString()

    return cleanGraphAfterDeleteNode({
        ...graph,
        nodes: graph.nodes
            .filter(node => node.id !== operation.nodeId)
            .map(node => {
                const loss = degreeLoss.get(node.id) ?? 0

                if (loss > 0) {
                    return { ...node, degree: Math.max(0, node.degree - loss) }
                }

                return node
            }),
        edges: graph.edges.filter(edge => edge.source !== operation.nodeId && edge.target !== operation.nodeId),
        updatedAt: now,
    }, operation.nodeId)
}

function executeDeleteEdge(graph: GraphData, operation: { type: 'delete_edge'; edgeId: string }): GraphData {
    const deletedEdge = graph.edges.find(edge => edge.id === operation.edgeId)
    const now = new Date().toISOString()

    return {
        ...graph,
        nodes: graph.nodes.map(node => {
            if (deletedEdge && (node.id === deletedEdge.source || node.id === deletedEdge.target)) {
                return { ...node, degree: Math.max(0, node.degree - 1) }
            }

            return node
        }),
        edges: graph.edges.filter(edge => edge.id !== operation.edgeId),
        updatedAt: now,
    }
}

function executeUpdateNode(graph: GraphData, operation: { type: 'update_node'; node: GraphData['nodes'][number] }): GraphData {
    const now = new Date().toISOString()

    return {
        ...graph,
        nodes: graph.nodes.map(node =>
            node.id === operation.node.id
                ? { ...operation.node, updatedAt: now }
                : node,
        ),
        updatedAt: now,
    }
}

function executeUpdateEdge(graph: GraphData, operation: { type: 'update_edge'; edge: GraphData['edges'][number] }): GraphData {
    const now = new Date().toISOString()

    return {
        ...graph,
        edges: graph.edges.map(edge =>
            edge.id === operation.edge.id
                ? { ...operation.edge, updatedAt: now }
                : edge,
        ),
        updatedAt: now,
    }
}

function executeMoveNode(graph: GraphData, operation: { type: 'move_node'; nodeId: NodeId; position: { x: number; y: number } }): GraphData {
    const now = new Date().toISOString()

    return {
        ...graph,
        nodes: graph.nodes.map(node => node.id === operation.nodeId ? {
            ...node,
            position: operation.position,
            updatedAt: now,
        } : node),
        updatedAt: now,
    }
}

function executeCollapseDependency(graph: GraphData, operation: { type: 'collapse_dependency'; targetNodeId: NodeId }): GraphData {
    const foldedNodeIds = collectDependencyNodeIds(graph, operation.targetNodeId)

    if (foldedNodeIds.length === 0) {
        return graph
    }

    const now = new Date().toISOString()
    const currentCognitiveState = graph.cognitiveState ?? { foldedDependencies: [] }
    const otherFoldedDependencies = currentCognitiveState.foldedDependencies.filter(item => item.targetNodeId !== operation.targetNodeId)

    return {
        ...graph,
        cognitiveState: {
            ...currentCognitiveState,
            foldedDependencies: [
                ...otherFoldedDependencies,
                {
                    targetNodeId: operation.targetNodeId,
                    foldedNodeIds,
                },
            ],
        },
        updatedAt: now,
    }
}

function executeExpandDependency(graph: GraphData, operation: { type: 'expand_dependency'; targetNodeId: NodeId }): GraphData {
    const currentCognitiveState = graph.cognitiveState ?? { foldedDependencies: [] }
    const now = new Date().toISOString()

    return {
        ...graph,
        cognitiveState: {
            ...currentCognitiveState,
            foldedDependencies: currentCognitiveState.foldedDependencies.filter(item => item.targetNodeId !== operation.targetNodeId),
        },
        updatedAt: now,
    }
}
