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
 *     4. 引用节点穿透（update_node）与级联删除（delete_node）在本模块内实现。
 *     5. 引用节点度数跟随原节点。有向虚边对度数的影响同时作用于原节点与引用节点。
 *        跨图场景（Phase 3）依赖 GraphRegistry（Step 5）。
 *
 * 外部如何使用：
 *     import { executeOperation, collectDependencyNodeIds } from '@my-project/graph-engine'
 */

import type { GraphData, NodeData, NodeId } from '../types/graph_data'
import type { GraphOperation } from '../types/atomic_operations'

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
            return graph

        default:
            return graph
    }
}

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

// ------------------------------ helpers -------------------------------------

/**
 * 功能：
 *     度数变更后，将 source 节点的度数同步到同图内所有指向它的引用节点。
 *
 * 规则：
 *     引用节点的度数跟随原节点，不独立计算。
 *     跨图引用节点（sourceGraphId !== 本图 id）由 Phase 3 GraphRegistry 处理。
 */
function syncReferenceNodeDegree(nodes: NodeData[], graphId: string, sourceNodeId: NodeId): NodeData[] {
    const sourceNode = nodes.find(n => n.id === sourceNodeId)

    if (!sourceNode || sourceNode.role !== 'knowledge') return nodes

    return nodes.map(n => {
        if (n.role === 'reference' && n.sourceGraphId === graphId && n.sourceNodeId === sourceNodeId) {
            return { ...n, degree: sourceNode.degree }
        }

        return n
    })
}

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

// ------------------------------ add / delete / update / move / fold / expand -----------------------------------------

function executeAddNode(graph: GraphData, operation: { type: 'add_node'; node: GraphData['nodes'][number] }): GraphData {
    const now = new Date().toISOString()

    return {
        ...graph,
        nodes: [...graph.nodes, { ...operation.node, createdAt: now, updatedAt: now }],
        updatedAt: now,
    }
}

function executeAddEdge(graph: GraphData, operation: { type: 'add_edge'; edge: GraphData['edges'][number] }): GraphData {
    const now = new Date().toISOString()

    // 有向虚边对度数的影响同时作用于原节点与引用节点。
    // 若边的端点是引用节点，degree 变更穿透到原节点，再同步回所有引用节点。
    let nodes = graph.nodes.map(node => {
        if (node.id === operation.edge.source || node.id === operation.edge.target) {
            return { ...node, degree: node.degree + 1 }
        }

        return node
    })

    // 端点穿透：若 source 或 target 是引用节点，原节点也加 degree
    for (const endpointId of [operation.edge.source, operation.edge.target]) {
        const endpointNode = nodes.find(n => n.id === endpointId)

        if (endpointNode?.role === 'reference' && endpointNode.sourceGraphId === graph.id) {
            nodes = nodes.map(n => {
                if (n.id === endpointNode.sourceNodeId) {
                    return { ...n, degree: n.degree + 1 }
                }

                return n
            })
            // 源节点 degree 变更后，同步给所有同图引用节点
            nodes = syncReferenceNodeDegree(nodes, graph.id, endpointNode.sourceNodeId)
        }
    }

// 若加边直接连到知识节点，该知识节点的引用节点也同步
    for (const endpointId of [operation.edge.source, operation.edge.target]) {
        const endpointNode = nodes.find(n => n.id === endpointId)

        if (endpointNode?.role === 'knowledge') {
            nodes = syncReferenceNodeDegree(nodes, graph.id, endpointId)
        }
    }

    return {
        ...graph,
        nodes,
        edges: [...graph.edges, { ...operation.edge, createdAt: now, updatedAt: now }],
        updatedAt: now,
    }
}

function executeDeleteNode(graph: GraphData, operation: { type: 'delete_node'; nodeId: NodeId }): GraphData {
    const deletedEdges = graph.edges.filter(
        edge => edge.source === operation.nodeId || edge.target === operation.nodeId,
    )

    const degreeLoss = new Map<string, number>()
    for (const edge of deletedEdges) {
        if (edge.source !== operation.nodeId) {
            degreeLoss.set(edge.source, (degreeLoss.get(edge.source) ?? 0) + 1)
        }
        if (edge.target !== operation.nodeId) {
            degreeLoss.set(edge.target, (degreeLoss.get(edge.target) ?? 0) + 1)
        }
    }

    // 引用节点级联删除。
    // 删除知识节点时，同图内所有指向它的引用节点同步移除。
    const cascadedReferenceNodeIds = new Set(
        graph.nodes
            .filter(n => n.role === 'reference' && n.sourceNodeId === operation.nodeId && n.sourceGraphId === graph.id)
            .map(n => n.id),
    )

    for (const refNodeId of cascadedReferenceNodeIds) {
        for (const edge of graph.edges) {
            if (edge.source === refNodeId || edge.target === refNodeId) {
                if (edge.source !== refNodeId && !cascadedReferenceNodeIds.has(edge.source)) {
                    degreeLoss.set(edge.source, (degreeLoss.get(edge.source) ?? 0) + 1)
                }
                if (edge.target !== refNodeId && !cascadedReferenceNodeIds.has(edge.target)) {
                    degreeLoss.set(edge.target, (degreeLoss.get(edge.target) ?? 0) + 1)
                }
            }
        }
    }

    const allDeletedNodeIds = new Set([operation.nodeId, ...cascadedReferenceNodeIds])

    const now = new Date().toISOString()

    let result: GraphData = {
        ...graph,
        nodes: graph.nodes
            .filter(node => !allDeletedNodeIds.has(node.id))
            .map(node => {
                const loss = degreeLoss.get(node.id) ?? 0

                if (loss > 0) {
                    return { ...node, degree: Math.max(0, node.degree - loss) }
                }

                return node
            }),
        edges: graph.edges.filter(edge => !allDeletedNodeIds.has(edge.source) && !allDeletedNodeIds.has(edge.target)),
        updatedAt: now,
    }

    for (const deletedId of allDeletedNodeIds) {
        result = cleanGraphAfterDeleteNode(result, deletedId)
    }

    return result
}

function executeDeleteEdge(graph: GraphData, operation: { type: 'delete_edge'; edgeId: string }): GraphData {
    const deletedEdge = graph.edges.find(edge => edge.id === operation.edgeId)
    const now = new Date().toISOString()

    let nodes = graph.nodes.map(node => {
        if (deletedEdge && (node.id === deletedEdge.source || node.id === deletedEdge.target)) {
            return { ...node, degree: Math.max(0, node.degree - 1) }
        }

        return node
    })

    // 端点穿透：同 add_edge 方向
    if (deletedEdge) {
        for (const endpointId of [deletedEdge.source, deletedEdge.target]) {
            const endpointNode = nodes.find(n => n.id === endpointId)

            if (endpointNode?.role === 'reference' && endpointNode.sourceGraphId === graph.id) {
                nodes = nodes.map(n => {
                    if (n.id === endpointNode.sourceNodeId) {
                        return { ...n, degree: Math.max(0, n.degree - 1) }
                    }

                    return n
                })
                nodes = syncReferenceNodeDegree(nodes, graph.id, endpointNode.sourceNodeId)
            }
        }

        for (const endpointId of [deletedEdge.source, deletedEdge.target]) {
            const endpointNode = nodes.find(n => n.id === endpointId)

            if (endpointNode?.role === 'knowledge') {
                nodes = syncReferenceNodeDegree(nodes, graph.id, endpointId)
            }
        }
    }

    return {
        ...graph,
        nodes,
        edges: graph.edges.filter(edge => edge.id !== operation.edgeId),
        updatedAt: now,
    }
}

/**
 * 功能：
 *     更新一个节点的数据。含引用节点穿透。
 *
 * 规则：
 *     1. 完全替换匹配节点（不是增量合并）。
 *     2. 引用节点 label 同步回源节点 label。contextSummary 不穿透（启发节点独立修改）。
 */
function executeUpdateNode(graph: GraphData, operation: { type: 'update_node'; node: GraphData['nodes'][number] }): GraphData {
    const now = new Date().toISOString()

    let nodes = graph.nodes.map(node => {
        if (node.id !== operation.node.id) return node

        return { ...operation.node, updatedAt: now }
    })

    // 引用节点穿透：label 同步到源节点。
    // 启发节点的 contextSummary 独立修改，不穿孔。
    if (operation.node.role === 'reference' && operation.node.sourceGraphId === graph.id) {
        const refNode = operation.node
        const sourceNodeIdx = nodes.findIndex(n => n.id === refNode.sourceNodeId)

        if (sourceNodeIdx >= 0 && nodes[sourceNodeIdx]) {
            nodes[sourceNodeIdx] = {
                ...nodes[sourceNodeIdx],
                label: refNode.label,
                updatedAt: now,
            }
        }
    }

    return {
        ...graph,
        nodes,
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
