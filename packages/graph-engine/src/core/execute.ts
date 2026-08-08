/**
 * execute.ts
 *
 * 功能：
 *
 *     将 GraphOperation 转换为新的 GraphData。所有函数为纯函数，不修改入参。
 *
 * 总体结构：
 *
 *     1. executeOperation — Operation router，按 type 分派
 *     2. 各 executeXxx — 9 种图内变更操作的具体执行函数
 *
 * 规则：
 *
 *     1. 本模块不负责校验。
 *     2. 所有操作返回新的 GraphData，不修改传入 GraphData。
 *     3. 所有图内变更操作会写入 timestamp。
 *     4. 签名 (graph, op) → graph。
 *     5. 度数按本图边数增减，不做引用穿透（引用节点度数不跟随源节点）。图遍历委托给 traversal.ts。
 *     6. add_graph / delete_graph 不在 execute 层处理——它们是 compose→Runtime 信号，
 *        落到 default 分支静默返回原 graph。Runtime 在 applyBatch 返回后读 operations
 *        数组中的 add_graph/delete_graph 操作自行处理 registry 副作用。
 *
 * 外部如何使用：
 *     import { executeOperation } from '@my-project/graph-engine'
 */

import type { GraphData, NodeId } from '../types/graph_data'
import type { GraphOperation } from '../types/atomic_operations'
import { collectDependencyNodeIds, findReferenceNodesPointingTo } from './utils/traversal'

export function executeOperation(graph: GraphData, operation: GraphOperation): GraphData {
    switch (operation.type) {
        // ── 图内变更：修改当前图中的节点/边，返回新的 GraphData ──
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

        // ── 认知状态变更：修改折叠/展开状态，返回新的 GraphData ──
        case 'collapse_dependency':
            return executeCollapseDependency(graph, operation)

        case 'expand_dependency':
            return executeExpandDependency(graph, operation)

        default:
            return graph
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

    // 度数只按本图边数计算：仅两端节点 degree +1，引用节点不跟随源节点度数
    const nodes = graph.nodes.map(node => {
        if (node.id === operation.edge.source || node.id === operation.edge.target) {
            return { ...node, degree: node.degree + 1 }
        }

        return node
    })

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
        findReferenceNodesPointingTo(graph, operation.nodeId).map(node => node.id),
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

    // 清理折叠状态中对被删节点的引用。
    // 移除以被删节点为折叠目标的项，从剩余项的 foldedNodeIds 中移除被删节点，整项清空时移除。
    for (const deletedId of allDeletedNodeIds) {
        const cognitiveState = result.cognitiveState ?? { foldedDependencies: [] }

        result = {
            ...result,
            cognitiveState: {
                ...cognitiveState,
                foldedDependencies: cognitiveState.foldedDependencies
                    .filter(item => item.targetNodeId !== deletedId)
                    .map(item => ({
                        ...item,
                        foldedNodeIds: item.foldedNodeIds.filter(nodeId => nodeId !== deletedId),
                    }))
                    .filter(item => item.foldedNodeIds.length > 0),
            },
        }
    }

    return result
}

function executeDeleteEdge(graph: GraphData, operation: { type: 'delete_edge'; edgeId: string }): GraphData {
    const deletedEdge = graph.edges.find(edge => edge.id === operation.edgeId)
    const now = new Date().toISOString()

    // 度数只按本图边数计算：仅两端节点 degree -1，引用节点不跟随源节点度数
    const nodes = graph.nodes.map(node => {
        if (deletedEdge && (node.id === deletedEdge.source || node.id === deletedEdge.target)) {
            return { ...node, degree: Math.max(0, node.degree - 1) }
        }

        return node
    })

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
    // 启发节点的 contextSummary 独立修改，不穿透。
    if (operation.node.role === 'reference' && operation.node.sourceGraphId === graph.id) {
        const refNode = operation.node
        const sourceNodeIdx = nodes.findIndex(node => node.id === refNode.sourceNodeId)

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

function executeCollapseDependency(
    graph: GraphData,
    operation: { type: 'collapse_dependency'; targetNodeId: NodeId; foldedNodeIds?: NodeId[] },
): GraphData {
    // 有显式折叠成员时照名单恢复（undo 逆元路径）；缺省时重算（正常折叠路径）。
    // 字段为空数组与无字段重算结果为空同理：不写折叠条目（空成员静默 no-op）。
    const foldedNodeIds = operation.foldedNodeIds ?? collectDependencyNodeIds(graph, operation.targetNodeId)

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
