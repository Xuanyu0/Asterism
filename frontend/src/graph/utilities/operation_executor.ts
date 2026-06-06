/**
 * operation_executor.ts
 *
 * 功能：
 * 提供 GraphOperation 的执行器函数，将 Operation 转换为新的 GraphData。
 * 所有函数为纯函数，不修改入参，不访问 Pinia Store。
 *
 * 总体结构：
 * 1. applyOperationToGraph — Operation router，按 type 分派
 * 2. shouldPushUndoSnapshot — 判断是否需要保存 Undo Snapshot
 * 3. pushUndoSnapshot — 保存 Undo Snapshot 并限制栈大小
 * 4. privateApplyAddNode / AddEdge / ... — 9 个 Operation 具体执行函数
 *
 * 外部如何使用：
 * import { applyOperationToGraph } from '@/graph/operation_executor'
 */

import type { GraphData } from '@/definitions/types/graph_types'
import type { GraphOperation } from '@/definitions/types/graph_operation_types'
import { cleanGraphAfterDeleteNode, collectDependencyNodeIds } from '@/graph/utilities/graph_utils'


const MAX_UNDO_STACK_SIZE = 20    // 撤销栈最大数量，避免长时间操作后占用过多内存


/**
 * 功能：
 *     将 GraphOperation 转换为新的 GraphData。
 *
 * 规则：
 *     1. 本函数不负责校验。
 *     2. 本函数不修改传入 GraphData。
 *     3. 所有操作返回新的 GraphData。
 *     4. GraphData 是唯一事实源。
 *
 * 使用：
 *     graph_store.applyOperation() 内部调用。
 */
export function applyOperationToGraph(graph: GraphData, operation: GraphOperation): GraphData {
    switch (operation.type) {
        case 'add_node':
            return privateApplyAddNode(graph, operation)

        case 'add_edge':
            return privateApplyAddEdge(graph, operation)

        case 'delete_node':
            return privateApplyDeleteNode(graph, operation)

        case 'delete_edge':
            return privateApplyDeleteEdge(graph, operation)

        case 'update_node':
            return privateApplyUpdateNode(graph, operation)

        case 'update_edge':
            return privateApplyUpdateEdge(graph, operation)

        case 'move_node':
            return privateApplyMoveNode(graph, operation)

        case 'collapse_dependency':
            return privateApplyCollapseDependency(graph, operation)

        case 'expand_dependency':
            return privateApplyExpandDependency(graph, operation)

        default:
            return graph
    }
}

/**
 * 功能：
 *     判断当前 Operation 是否需要保存 Undo Snapshot。
 *
 * 规则：
 *     1. MVP 阶段仅删除操作需要撤销支持。
 *
 * 使用：
 *     graph_store.applyOperation() 内部调用。
 */
export function shouldPushUndoSnapshot(operation: GraphOperation): boolean {
    return operation.type === 'delete_node' || operation.type === 'delete_edge'
}

/**
 * 功能：
 *     保存当前 GraphData 副本到撤销栈，并限制栈最大长度。
 *
 * 规则：
 *     1. 使用结构化深拷贝保存完整 GraphData。
 *     2. 超过 MAX_UNDO_STACK_SIZE 时丢弃最早的快照。
 *
 * 使用：
 *     graph_store.applyOperation() 内部调用。
 */
export function pushUndoSnapshot(undoStack: GraphData[], graph: GraphData): GraphData[] {
    // JSON 序列化而非 structuredClone：
    // graph_store 传入的 currentGraph 是 Pinia reactive proxy，
    // structuredClone 无法克隆包含内部符号的代理对象（抛出 DataCloneError）。
    // GraphData 本身仅含 JSON 可序列化字段（经 localStorage 持久化验证），
    // JSON 往返不会丢失数据。
    const snapshot: GraphData = JSON.parse(JSON.stringify(graph))

    return [...undoStack, snapshot].slice(-MAX_UNDO_STACK_SIZE)
}

// ------------------------------ private section

function privateApplyAddNode(graph: GraphData, operation: Extract<GraphOperation, { type: 'add_node' }>): GraphData {
    return {
        ...graph,
        nodes: [...graph.nodes, operation.node],
        updatedAt: new Date().toISOString(),
    }
}

function privateApplyAddEdge(graph: GraphData, operation: Extract<GraphOperation, { type: 'add_edge' }>): GraphData {
    const { source, target } = operation.edge

    return {
        ...graph,
        nodes: graph.nodes.map(node => {
            if (node.id === source || node.id === target) {
                return { ...node, degree: node.degree + 1 }
            }

            return node
        }),
        edges: [...graph.edges, operation.edge],
        updatedAt: new Date().toISOString(),
    }
}

function privateApplyDeleteNode(graph: GraphData, operation: Extract<GraphOperation, { type: 'delete_node' }>): GraphData {
    const deletedEdges = graph.edges.filter(
        edge => edge.source === operation.nodeId || edge.target === operation.nodeId,
    )

    // 统计每个相邻节点因本次删除失去的边数
    const degreeLoss = new Map<string, number>()
    for (const edge of deletedEdges) {
        if (edge.source !== operation.nodeId) {
            degreeLoss.set(edge.source, (degreeLoss.get(edge.source) ?? 0) + 1)
        }
        if (edge.target !== operation.nodeId) {
            degreeLoss.set(edge.target, (degreeLoss.get(edge.target) ?? 0) + 1)
        }
    }

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
        updatedAt: new Date().toISOString(),
    }, operation.nodeId)
}

function privateApplyDeleteEdge(graph: GraphData, operation: Extract<GraphOperation, { type: 'delete_edge' }>): GraphData {
    const deletedEdge = graph.edges.find(edge => edge.id === operation.edgeId)

    return {
        ...graph,
        nodes: graph.nodes.map(node => {
            if (deletedEdge && (node.id === deletedEdge.source || node.id === deletedEdge.target)) {
                return { ...node, degree: Math.max(0, node.degree - 1) }
            }

            return node
        }),
        edges: graph.edges.filter(edge => edge.id !== operation.edgeId),
        updatedAt: new Date().toISOString(),
    }
}

function privateApplyUpdateNode(graph: GraphData, operation: Extract<GraphOperation, { type: 'update_node' }>): GraphData {
    return {
        ...graph,
        nodes: graph.nodes.map(node => node.id === operation.node.id ? operation.node : node),
        updatedAt: new Date().toISOString(),
    }
}

function privateApplyUpdateEdge(graph: GraphData, operation: Extract<GraphOperation, { type: 'update_edge' }>): GraphData {
    return {
        ...graph,
        edges: graph.edges.map(edge => edge.id === operation.edge.id ? operation.edge : edge),
        updatedAt: new Date().toISOString(),
    }
}

function privateApplyMoveNode(graph: GraphData, operation: Extract<GraphOperation, { type: 'move_node' }>): GraphData {
    return {
        ...graph,
        nodes: graph.nodes.map(node => node.id === operation.nodeId ? {
            ...node,
            position: operation.position,
        } : node),
        updatedAt: new Date().toISOString(),
    }
}

function privateApplyCollapseDependency(graph: GraphData, operation: Extract<GraphOperation, { type: 'collapse_dependency' }>): GraphData {
    const foldedNodeIds = collectDependencyNodeIds(graph, operation.targetNodeId)

    if (foldedNodeIds.length === 0) {
        return graph
    }

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
        updatedAt: new Date().toISOString(),
    }
}

function privateApplyExpandDependency(graph: GraphData, operation: Extract<GraphOperation, { type: 'expand_dependency' }>): GraphData {
    const currentCognitiveState = graph.cognitiveState ?? { foldedDependencies: [] }

    return {
        ...graph,
        cognitiveState: {
            ...currentCognitiveState,
            foldedDependencies: currentCognitiveState.foldedDependencies.filter(item => item.targetNodeId !== operation.targetNodeId),
        },
        updatedAt: new Date().toISOString(),
    }
}
