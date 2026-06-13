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

import type { GraphData } from '@my-project/graph-engine'
import type { GraphOperation } from '@my-project/graph-engine'
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

/**
 * 功能：
 *     向当前图添加一个新节点。
 *
 * 规则：
 *     1. 节点直接追加到 nodes 列表末尾。
 *     2. 不校验节点合法性（统一在 OperationValidator 入口校验）。
 */
function privateApplyAddNode(graph: GraphData, operation: Extract<GraphOperation, { type: 'add_node' }>): GraphData {
    const now = new Date().toISOString()

    return {
        ...graph,
        nodes: [...graph.nodes, { ...operation.node, createdAt: now, updatedAt: [now] }],
        updatedAt: [...(graph.updatedAt ?? []), now],
    }
}

/**
 * 功能：
 *     向当前图添加一条新边。
 *
 * 规则：
 *     1. 同步增加两端节点的 degree 值。
 *     2. 边直接追加到 edges 列表末尾。
 */
function privateApplyAddEdge(graph: GraphData, operation: Extract<GraphOperation, { type: 'add_edge' }>): GraphData {
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
        edges: [...graph.edges, { ...operation.edge, createdAt: now, updatedAt: [now] }],
        updatedAt: [...(graph.updatedAt ?? []), now],
    }
}

/**
 * 功能：
 *     从当前图删除一个节点。
 *
 * 规则：
 *     1. 同步删除与该节点关联的所有边。
 *     2. 更新相邻节点的 degree 值（减去失去的边数）。
 *     3. 清理 cognitiveState 中对该节点的折叠引用。
 */
function privateApplyDeleteNode(graph: GraphData, operation: Extract<GraphOperation, { type: 'delete_node' }>): GraphData {
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
        updatedAt: [...(graph.updatedAt ?? []), now],
    }, operation.nodeId)
}

/**
 * 功能：
 *     从当前图删除一条边。
 *
 * 规则：
 *     1. 同步降低两端节点的 degree 值。
 */
function privateApplyDeleteEdge(graph: GraphData, operation: Extract<GraphOperation, { type: 'delete_edge' }>): GraphData {
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
        updatedAt: [...(graph.updatedAt ?? []), now],
    }
}

/**
 * 功能：
 *     更新一个节点的数据。
 *
 * 规则：
 *     1. 完全替换匹配节点（不是增量合并）。
 */
function privateApplyUpdateNode(graph: GraphData, operation: Extract<GraphOperation, { type: 'update_node' }>): GraphData {
    const now = new Date().toISOString()

    return {
        ...graph,
        nodes: graph.nodes.map(node =>
            node.id === operation.node.id
                ? { ...operation.node, updatedAt: [...(node.updatedAt ?? []), now] }
                : node,
        ),
        updatedAt: [...(graph.updatedAt ?? []), now],
    }
}

/**
 * 功能：
 *     更新一条边的数据。
 *
 * 规则：
 *     1. 完全替换匹配边（不是增量合并）。
 */
function privateApplyUpdateEdge(graph: GraphData, operation: Extract<GraphOperation, { type: 'update_edge' }>): GraphData {
    const now = new Date().toISOString()

    return {
        ...graph,
        edges: graph.edges.map(edge =>
            edge.id === operation.edge.id
                ? { ...operation.edge, updatedAt: [...(edge.updatedAt ?? []), now] }
                : edge,
        ),
        updatedAt: [...(graph.updatedAt ?? []), now],
    }
}

/**
 * 功能：
 *     移动一个节点的位置坐标。
 *
 * 规则：
 *     1. 只更新 position 字段，不影响节点其他属性。
 */
function privateApplyMoveNode(graph: GraphData, operation: Extract<GraphOperation, { type: 'move_node' }>): GraphData {
    const now = new Date().toISOString()

    return {
        ...graph,
        nodes: graph.nodes.map(node => node.id === operation.nodeId ? {
            ...node,
            position: operation.position,
            updatedAt: [...(node.updatedAt ?? []), now],
        } : node),
        updatedAt: [...(graph.updatedAt ?? []), now],
    }
}

/**
 * 功能：
 *     折叠目标节点的依赖子图。
 *
 * 规则：
 *     1. 仅当存在可折叠的依赖节点时才创建折叠状态。
 *     2. 折叠状态写入 cognitiveState，随 GraphData 持久化。
 */
function privateApplyCollapseDependency(graph: GraphData, operation: Extract<GraphOperation, { type: 'collapse_dependency' }>): GraphData {
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
        updatedAt: [...(graph.updatedAt ?? []), now],
    }
}

/**
 * 功能：
 *     展开目标节点的折叠状态。
 *
 * 规则：
 *     1. 从 cognitiveState 中移除对应的折叠条目。
 *     2. 不修改 GraphData 的 nodes / edges。
 */
function privateApplyExpandDependency(graph: GraphData, operation: Extract<GraphOperation, { type: 'expand_dependency' }>): GraphData {
    const currentCognitiveState = graph.cognitiveState ?? { foldedDependencies: [] }
    const now = new Date().toISOString()

    return {
        ...graph,
        cognitiveState: {
            ...currentCognitiveState,
            foldedDependencies: currentCognitiveState.foldedDependencies.filter(item => item.targetNodeId !== operation.targetNodeId),
        },
        updatedAt: [...(graph.updatedAt ?? []), now],
    }
}
