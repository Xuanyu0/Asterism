/**
 * 将图内原子操作（AtomicOperationInGraph）转换为新的 GraphData。所有函数为纯函数，不修改入参。
 *
 * @remarks
 * 本模块不负责校验。所有操作返回新的 GraphData（签名 (graph, op, executedAt) → graph）。
 * 时间戳由调用方（Runtime）经裸参数 executedAt 传入——execute 层自身不再生成时间戳，
 * executedAt 语义 = 本批次执行的时刻（正向=真实当前时刻，undo=撤销时刻，redo=历史执行时刻）；
 * 对象级 createdAt/updatedAt = 操作携带值 ?? executedAt（逆元快照携带历史值 → 恢复，正向不携带 → executedAt）。
 * 度数按本图边数增减，不做引用穿透（引用节点度数不跟随源节点），图遍历委托给 traversal.ts。
 * 图级操作（add_graph / delete_graph）不在 execute 层处理——它们是多图注册表层面的操作，
 * 由 applyBatches 统一兑现。
 */

import type { GraphData, NodeId } from '../types/graph_data'
import type { AtomicOperationInGraph } from '../types/atomic_operations'
import {
    collectDependencyNodeIds,
    findReferenceNodesPointingTo,
} from './utils/traversal'

/**
 * 图内原子操作路由：按 type 分派到对应 executeXxx。
 *
 * @param graph - 操作前的图（不修改）
 * @param operation - 待执行的图内原子操作
 * @param executedAt - 执行时间戳
 * @returns 操作后的新图。
 */
export function executeOperation(
    graph: GraphData,
    operation: AtomicOperationInGraph,
    executedAt: string,
): GraphData {
    switch (operation.type) {
        // ── 图内变更：修改当前图中的节点/边，返回新的 GraphData ──
        case 'add_node':
            return executeAddNode(graph, operation, executedAt)

        case 'add_edge':
            return executeAddEdge(graph, operation, executedAt)

        case 'delete_node':
            return executeDeleteNode(graph, operation, executedAt)

        case 'delete_edge':
            return executeDeleteEdge(graph, operation, executedAt)

        case 'update_node':
            return executeUpdateNode(graph, operation, executedAt)

        case 'update_edge':
            return executeUpdateEdge(graph, operation, executedAt)

        case 'move_node':
            return executeMoveNode(graph, operation, executedAt)

        // ── 认知状态变更：修改折叠/展开状态，返回新的 GraphData ──
        case 'collapse_dependency':
            return executeCollapseDependency(graph, operation, executedAt)

        case 'expand_dependency':
            return executeExpandDependency(graph, operation, executedAt)
    }
}

// ------------------------------ add / delete / update / move / fold / expand -----------------------------------------

function executeAddNode(
    graph: GraphData,
    operation: { type: 'add_node'; node: GraphData['nodes'][number] },
    executedAt: string,
): GraphData {
    const createdAt = resolveObjectTimestamp(executedAt, operation.node.createdAt)
    const updatedAt = resolveObjectTimestamp(executedAt, operation.node.updatedAt)

    return {
        ...graph,
        nodes: [...graph.nodes, { ...operation.node, createdAt, updatedAt }],
        updatedAt: executedAt
    }
}

function executeAddEdge(
    graph: GraphData,
    operation: { type: 'add_edge'; edge: GraphData['edges'][number] },
    executedAt: string,
): GraphData {
    const createdAt = resolveObjectTimestamp(executedAt, operation.edge.createdAt)
    const updatedAt = resolveObjectTimestamp(executedAt, operation.edge.updatedAt)

    // 度数只按本图边数计算：仅两端节点 degree +1，引用节点不跟随源节点度数
    const nodes = graph.nodes.map((node) => {
        if (
            node.id === operation.edge.source ||
            node.id === operation.edge.target
        ) {
            return { ...node, degree: node.degree + 1 }
        }

        return node
    })

    return {
        ...graph,
        nodes,
        edges: [...graph.edges, { ...operation.edge, createdAt, updatedAt }],
        updatedAt: executedAt,
    }
}

function executeDeleteNode(
    graph: GraphData,
    operation: { type: 'delete_node'; nodeId: NodeId },
    executedAt: string,
): GraphData {
    const deletedEdges = graph.edges.filter(
        (edge) =>
            edge.source === operation.nodeId ||
            edge.target === operation.nodeId,
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
        findReferenceNodesPointingTo(graph, operation.nodeId).map(
            (node) => node.id,
        ),
    )

    for (const refNodeId of cascadedReferenceNodeIds) {
        for (const edge of graph.edges) {
            if (edge.source === refNodeId || edge.target === refNodeId) {
                if (
                    edge.source !== refNodeId &&
                    !cascadedReferenceNodeIds.has(edge.source)
                ) {
                    degreeLoss.set(
                        edge.source,
                        (degreeLoss.get(edge.source) ?? 0) + 1,
                    )
                }
                if (
                    edge.target !== refNodeId &&
                    !cascadedReferenceNodeIds.has(edge.target)
                ) {
                    degreeLoss.set(
                        edge.target,
                        (degreeLoss.get(edge.target) ?? 0) + 1,
                    )
                }
            }
        }
    }

    const allDeletedNodeIds = new Set([
        operation.nodeId,
        ...cascadedReferenceNodeIds,
    ])

    let result: GraphData = {
        ...graph,
        nodes: graph.nodes
            .filter((node) => !allDeletedNodeIds.has(node.id))
            .map((node) => {
                const loss = degreeLoss.get(node.id) ?? 0

                if (loss > 0) {
                    return { ...node, degree: Math.max(0, node.degree - loss) }
                }

                return node
            }),
        edges: graph.edges.filter(
            (edge) =>
                !allDeletedNodeIds.has(edge.source) &&
                !allDeletedNodeIds.has(edge.target),
        ),
        updatedAt: executedAt,
    }

    // 清理折叠状态中对被删节点的引用。
    // 移除以被删节点为折叠目标的项，从剩余项的 foldedNodeIds 中移除被删节点，整项清空时移除。
    for (const deletedId of allDeletedNodeIds) {
        const cognitiveState = result.cognitiveState

        result = {
            ...result,
            cognitiveState: {
                ...cognitiveState,
                foldedDependencies: cognitiveState.foldedDependencies
                    .filter((item) => item.targetNodeId !== deletedId)
                    .map((item) => ({
                        ...item,
                        foldedNodeIds: item.foldedNodeIds.filter(
                            (nodeId) => nodeId !== deletedId,
                        ),
                    }))
                    .filter((item) => item.foldedNodeIds.length > 0),
            },
        }
    }

    return result
}

function executeDeleteEdge(
    graph: GraphData,
    operation: { type: 'delete_edge'; edgeId: string },
    executedAt: string,
): GraphData {
    const deletedEdge = graph.edges.find((edge) => edge.id === operation.edgeId)

    // 度数只按本图边数计算：仅两端节点 degree -1，引用节点不跟随源节点度数
    const nodes = graph.nodes.map((node) => {
        if (
            deletedEdge &&
            (node.id === deletedEdge.source || node.id === deletedEdge.target)
        ) {
            return { ...node, degree: Math.max(0, node.degree - 1) }
        }

        return node
    })

    return {
        ...graph,
        nodes,
        edges: graph.edges.filter((edge) => edge.id !== operation.edgeId),
        updatedAt: executedAt,
    }
}

/**
 * 更新一个节点的数据（含引用节点穿透）。
 *
 * @remarks
 * 完全替换匹配节点（不是增量合并）。引用节点 label 同步回源节点 label；
 * contextSummary 不穿透（启发节点独立修改）。
 */
function executeUpdateNode(
    graph: GraphData,
    operation: { type: 'update_node'; node: GraphData['nodes'][number] },
    executedAt: string,
): GraphData {
    const updatedAt = resolveObjectTimestamp(executedAt, operation.node.updatedAt)

    let nodes = graph.nodes.map((node) => {
        if (node.id !== operation.node.id) return node

        return { ...operation.node, updatedAt }
    })

    // 引用节点穿透：label 同步到源节点。
    // 启发节点的 contextSummary 独立修改，不穿透。
    if (
        operation.node.role === 'reference' &&
        operation.node.sourceGraphId === graph.id
    ) {
        const refNode = operation.node
        const sourceNodeIdx = nodes.findIndex(
            (node) => node.id === refNode.sourceNodeId,
        )

        if (sourceNodeIdx >= 0 && nodes[sourceNodeIdx]) {
            nodes[sourceNodeIdx] = {
                ...nodes[sourceNodeIdx],
                label: refNode.label,
                // 穿透是图内一致性同步，快照不携带源节点旧值，updatedAt 一律 executedAt
                updatedAt: executedAt,
            }
        }
    }

    return {
        ...graph,
        nodes,
        updatedAt: executedAt,
    }
}

function executeUpdateEdge(
    graph: GraphData,
    operation: { type: 'update_edge'; edge: GraphData['edges'][number] },
    executedAt: string,
): GraphData {
    const updatedAt = resolveObjectTimestamp(executedAt, operation.edge.updatedAt)

    return {
        ...graph,
        edges: graph.edges.map((edge) =>
            edge.id === operation.edge.id
                ? { ...operation.edge, updatedAt }
                : edge,
        ),
        updatedAt: executedAt,
    }
}

function executeMoveNode(
    graph: GraphData,
    operation: {
        type: 'move_node'
        nodeId: NodeId
        position: { x: number; y: number }
    },
    executedAt: string,
): GraphData {
    return {
        ...graph,
        nodes: graph.nodes.map((node) =>
            node.id === operation.nodeId
                ? {
                      ...node,
                      position: operation.position,
                      // move_node 不携带时间戳，对象级 updatedAt 一律 executedAt
                      updatedAt: executedAt,
                  }
                : node,
        ),
        updatedAt: executedAt,
    }
}

function executeCollapseDependency(
    graph: GraphData,
    operation: {
        type: 'collapse_dependency'
        targetNodeId: NodeId
        foldedNodeIds?: NodeId[]
    },
    executedAt: string,
): GraphData {
    // 有显式折叠成员时照名单恢复（undo 逆元路径）；缺省时重算（正常折叠路径）。
    // 字段为空数组与无字段重算结果为空同理：不写折叠条目（空成员静默 no-op）。
    const foldedNodeIds =
        operation.foldedNodeIds ??
        collectDependencyNodeIds(graph, operation.targetNodeId)

    if (foldedNodeIds.length === 0) {
        return graph
    }

    const currentCognitiveState = graph.cognitiveState
    const otherFoldedDependencies =
        currentCognitiveState.foldedDependencies.filter(
            (item) => item.targetNodeId !== operation.targetNodeId,
        )

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
        updatedAt: executedAt,
    }
}

function executeExpandDependency(
    graph: GraphData,
    operation: { type: 'expand_dependency'; targetNodeId: NodeId },
    executedAt: string,
): GraphData {
    const currentCognitiveState = graph.cognitiveState

    return {
        ...graph,
        cognitiveState: {
            ...currentCognitiveState,
            foldedDependencies: currentCognitiveState.foldedDependencies.filter(
                (item) => item.targetNodeId !== operation.targetNodeId,
            ),
        },
        updatedAt: executedAt,
    }
}

/**
 * 解析对象级时间戳应写入的值：操作携带值优先，缺失时兜底 executedAt。
 *
 * @param executedAt - 执行时间戳
 * @param carried - 操作对象携带的时间戳值（可能缺失）
 * @returns 应写入的最终时间戳。
 */
function resolveObjectTimestamp(
    executedAt: string,
    carried: string | undefined,
): string {
    return carried ?? executedAt
}
