/**
 * 构造图内原子操作的逆操作序列。在执行操作前调用，捕获操作对象完整前状态。
 *
 * @remarks
 * 入参 graph 是操作前的图状态。对信息丢失的操作（delete / update / move / expand）
 * 返回携带完整前状态快照的逆操作；对无信息丢失的操作（add / collapse）不需要额外快照。
 * 9 种图内原子操作全部具备逆元；图级操作（add_graph / delete_graph）不在此构造逆元，
 * 由 applyBatches 统一构造（add ↔ delete 互逆）。目标缺失（正常流程不触发，validate
 * 已保证目标存在）时抛异常，不再静默返回 []。
 */

import type { GraphData } from '../types/graph_data'
import type {
    AtomicOperationInGraph,
    AddNodeOperation,
    AddEdgeOperation,
    DeleteNodeOperation,
    DeleteEdgeOperation,
    UpdateNodeOperation,
    UpdateEdgeOperation,
    MoveNodeOperation,
    CollapseDependencyOperation,
    ExpandDependencyOperation,
} from '../types/atomic_operations'
import { findReferenceNodesPointingTo } from './utils/traversal'

/**
 * 构造单步图内操作的逆操作序列。
 *
 * @remarks
 * 入参 graph 必须在操作执行前传入（此时图仍包含将被修改/删除的对象）。
 * 返回值是一个数组——部分操作的逆需要多个原子操作才能完成。目标缺失时抛异常
 * （显式错误信号），上层回调捕获后阻断整批提交。图级操作不在此构造逆元——
 * 由 applyBatches 统一构造（add ↔ delete 互逆）。
 *
 * @param graph - 操作前的图状态
 * @param operation - 待反转的图内原子操作
 * @returns 逆操作序列。
 */
export function createReversal(
    graph: GraphData,
    operation: AtomicOperationInGraph,
): AtomicOperationInGraph[] {
    switch (operation.type) {
        case 'add_node':
            return createReversalForAddNode(operation)

        case 'add_edge':
            return createReversalForAddEdge(operation)

        case 'delete_node':
            return createReversalForDeleteNode(graph, operation)

        case 'delete_edge':
            return createReversalForDeleteEdge(graph, operation)

        case 'update_node':
            return createReversalForUpdateNode(graph, operation)

        case 'update_edge':
            return createReversalForUpdateEdge(graph, operation)

        case 'move_node':
            return createReversalForMoveNode(graph, operation)

        case 'collapse_dependency':
            return createReversalForCollapseDependency(graph, operation)

        case 'expand_dependency':
            return createReversalForExpandDependency(graph, operation)
    }
}

// add — 无信息丢失，逆操作仅需 ID

function createReversalForAddNode(
    operation: AddNodeOperation,
): AtomicOperationInGraph[] {
    const inverse: DeleteNodeOperation = {
        type: 'delete_node',
        nodeId: operation.node.id,
    }
    return [inverse]
}

function createReversalForAddEdge(
    operation: AddEdgeOperation,
): AtomicOperationInGraph[] {
    const inverse: DeleteEdgeOperation = {
        type: 'delete_edge',
        edgeId: operation.edge.id,
    }
    return [inverse]
}

// delete — 需要从 graph 中捕获被删对象的完整快照

function createReversalForDeleteNode(
    graph: GraphData,
    operation: DeleteNodeOperation,
): AtomicOperationInGraph[] {
    const deletedNode = graph.nodes.find((node) => node.id === operation.nodeId)

    if (!deletedNode) {
        throw new Error(
            `createReversal: delete_node 目标节点不存在: ${operation.nodeId}`,
        )
    }

    // 级联删除面镜像（executeDeleteNode）：
    // 同图内所有指向被删节点的引用节点一并删除，恢复时同样需要重建。
    const cascadedReferenceNodes = findReferenceNodesPointingTo(
        graph,
        operation.nodeId,
    )

    const allDeletedNodeIds = new Set([
        operation.nodeId,
        ...cascadedReferenceNodes.map((node) => node.id),
    ])

    // 捕获被删节点 + 级联引用节点关联的所有边（execute 删除面：任一端点在被删集合即删除）
    const deletedEdges = graph.edges.filter(
        (edge) =>
            allDeletedNodeIds.has(edge.source) ||
            allDeletedNodeIds.has(edge.target),
    )

    const reversals: AtomicOperationInGraph[] = []

    // 先恢复节点（边依赖端点存在）：被删节点 + 级联引用节点
    for (const node of [deletedNode, ...cascadedReferenceNodes]) {
        const addNodeInverse: AddNodeOperation = {
            type: 'add_node',
            node: structuredClone(node),
        }
        reversals.push(addNodeInverse)
    }

    // 再恢复所有关联边
    for (const edge of deletedEdges) {
        const addEdgeInverse: AddEdgeOperation = {
            type: 'add_edge',
            edge: structuredClone(edge),
        }
        reversals.push(addEdgeInverse)
    }

    return reversals
}

function createReversalForDeleteEdge(
    graph: GraphData,
    operation: DeleteEdgeOperation,
): AtomicOperationInGraph[] {
    const deletedEdge = graph.edges.find((edge) => edge.id === operation.edgeId)

    if (!deletedEdge) {
        throw new Error(
            `createReversal: delete_edge 目标边不存在: ${operation.edgeId}`,
        )
    }

    const inverse: AddEdgeOperation = {
        type: 'add_edge',
        edge: structuredClone(deletedEdge),
    }

    return [inverse]
}

// update — 需要从 graph 中捕获修改前的完整对象

function createReversalForUpdateNode(
    graph: GraphData,
    operation: UpdateNodeOperation,
): AtomicOperationInGraph[] {
    const oldNode = graph.nodes.find((node) => node.id === operation.node.id)

    if (!oldNode) {
        throw new Error(
            `createReversal: update_node 目标节点不存在: ${operation.node.id}`,
        )
    }

    const inverse: UpdateNodeOperation = {
        type: 'update_node',
        node: structuredClone(oldNode),
    }

    return [inverse]
}

function createReversalForUpdateEdge(
    graph: GraphData,
    operation: UpdateEdgeOperation,
): AtomicOperationInGraph[] {
    const oldEdge = graph.edges.find((edge) => edge.id === operation.edge.id)

    if (!oldEdge) {
        throw new Error(
            `createReversal: update_edge 目标边不存在: ${operation.edge.id}`,
        )
    }

    const inverse: UpdateEdgeOperation = {
        type: 'update_edge',
        edge: structuredClone(oldEdge),
    }

    return [inverse]
}

// move — 从 graph 中捕获旧位置

function createReversalForMoveNode(
    graph: GraphData,
    operation: MoveNodeOperation,
): AtomicOperationInGraph[] {
    const current = graph.nodes.find((node) => node.id === operation.nodeId)

    // 双条件：节点缺失 或 节点无 position 字段，均视为目标缺失
    if (!current || !current.position) {
        throw new Error(
            `createReversal: move_node 目标节点不存在或无位置: ${operation.nodeId}`,
        )
    }

    const inverse: MoveNodeOperation = {
        type: 'move_node',
        nodeId: operation.nodeId,
        position: { x: current.position.x, y: current.position.y },
    }

    return [inverse]
}

// collapse / expand — 折叠状态在 graph.cognitiveState 中

function createReversalForCollapseDependency(
    graph: GraphData,
    operation: CollapseDependencyOperation,
): AtomicOperationInGraph[] {
    const inverse: ExpandDependencyOperation = {
        type: 'expand_dependency',
        targetNodeId: operation.targetNodeId,
    }

    return [inverse]
}

function createReversalForExpandDependency(
    graph: GraphData,
    operation: ExpandDependencyOperation,
): AtomicOperationInGraph[] {
    // 捕获展开前的折叠条目，逆元照名单恢复（而非重算——undo 链中间时刻重算会数错）
    const currentCognitiveState = graph.cognitiveState
    const existingEntry = currentCognitiveState.foldedDependencies.find(
        (item) => item.targetNodeId === operation.targetNodeId,
    )

    if (!existingEntry) {
        throw new Error(
            `createReversal: expand_dependency 目标折叠条目不存在: ${operation.targetNodeId}`,
        )
    }

    const inverse: CollapseDependencyOperation = {
        type: 'collapse_dependency',
        targetNodeId: operation.targetNodeId,
        foldedNodeIds: existingEntry.foldedNodeIds,
    }

    return [inverse]
}
