/**
 * reversal.ts
 *
 * 功能：
 *     构造原子操作的逆操作序列。在执行操作前调用，捕获操作对象完整前状态。
 *
 * 总体结构：
 *     1. createReversal — 统一入口，按 type 分派
 *     2. 各 createReversalForXxx — 按操作类型构造逆操作
 *
 * 规则：
 *     1. 入参 graph 是操作前的图状态。
 *     2. 对信息丢失的操作（delete / update / move），返回携带完整前状态快照的逆操作。
 *     3. 对无信息丢失的操作（add / collapse），不需要额外快照数据。
 *     4. 11 种原子操作全部具备逆元。
 *
 * 使用：
 *     Pinia store 在 apply() 前调用 createReversal，将逆操作序列写入 OperationLogEntry。
 */

import type { GraphData, NodeId, EdgeId, NodeData, EdgeData, GraphPosition } from '../types/graph_data'
import type {
    GraphOperation,
    AddNodeOperation,
    AddEdgeOperation,
    DeleteNodeOperation,
    DeleteEdgeOperation,
    UpdateNodeOperation,
    UpdateEdgeOperation,
    MoveNodeOperation,
    CollapseDependencyOperation,
    ExpandDependencyOperation,
    AddGraphOperation,
    DeleteGraphOperation,
} from '../types/operations'

/**
 * 功能：
 *     构造单步操作的逆操作序列。
 *
 * 规则：
 *     入参 graph 必须在操作执行前传入（此时图仍包含将被修改/删除的对象）。
 *     返回值是一个数组——部分操作的逆需要多个原子操作才能完成。
 */
export function createReversal(graph: GraphData, operation: GraphOperation): GraphOperation[] {
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

        case 'add_graph':
            return createReversalForAddGraph(operation)

        case 'delete_graph':
            return createReversalForDeleteGraph(graph, operation)

        default:
            return []
    }
}

// add — 无信息丢失，逆操作仅需 ID

function createReversalForAddNode(operation: AddNodeOperation): GraphOperation[] {
    const inverse: DeleteNodeOperation = {
        type: 'delete_node',
        nodeId: operation.node.id,
    }
    return [inverse]
}

function createReversalForAddEdge(operation: AddEdgeOperation): GraphOperation[] {
    const inverse: DeleteEdgeOperation = {
        type: 'delete_edge',
        edgeId: operation.edge.id,
    }
    return [inverse]
}

function createReversalForAddGraph(operation: AddGraphOperation): GraphOperation[] {
    const inverse: DeleteGraphOperation = {
        type: 'delete_graph',
        graphId: operation.graph.id,
    }
    return [inverse]
}

// delete — 需要从 graph 中捕获被删对象的完整快照

function createReversalForDeleteNode(graph: GraphData, operation: DeleteNodeOperation): GraphOperation[] {
    const deletedNode = graph.nodes.find(n => n.id === operation.nodeId)

    if (!deletedNode) {
        return []
    }

    // 捕获被删节点的所有关联边
    const incidentEdges = graph.edges.filter(
        e => e.source === operation.nodeId || e.target === operation.nodeId,
    )

    const reversals: GraphOperation[] = []

    // 先恢复节点
    const addNodeInverse: AddNodeOperation = {
        type: 'add_node',
        node: structuredClone(deletedNode) as NodeData,
    }
    reversals.push(addNodeInverse)

    // 再恢复所有关联边
    for (const edge of incidentEdges) {
        const addEdgeInverse: AddEdgeOperation = {
            type: 'add_edge',
            edge: structuredClone(edge) as EdgeData,
        }
        reversals.push(addEdgeInverse)
    }

    return reversals
}

function createReversalForDeleteEdge(graph: GraphData, operation: DeleteEdgeOperation): GraphOperation[] {
    const deletedEdge = graph.edges.find(e => e.id === operation.edgeId)

    if (!deletedEdge) {
        return []
    }

    const inverse: AddEdgeOperation = {
        type: 'add_edge',
        edge: structuredClone(deletedEdge) as EdgeData,
    }

    return [inverse]
}

function createReversalForDeleteGraph(graph: GraphData, operation: DeleteGraphOperation): GraphOperation[] {
    const reversals: GraphOperation[] = []

    // 恢复图本身
    const addGraphInverse: AddGraphOperation = {
        type: 'add_graph',
        graph: structuredClone(graph) as GraphData,
    }
    reversals.push(addGraphInverse)

    return reversals
}

// update — 需要从 graph 中捕获修改前的完整对象

function createReversalForUpdateNode(graph: GraphData, operation: UpdateNodeOperation): GraphOperation[] {
    const oldNode = graph.nodes.find(n => n.id === operation.node.id)

    if (!oldNode) {
        return []
    }

    const inverse: UpdateNodeOperation = {
        type: 'update_node',
        node: structuredClone(oldNode) as NodeData,
    }

    return [inverse]
}

function createReversalForUpdateEdge(graph: GraphData, operation: UpdateEdgeOperation): GraphOperation[] {
    const oldEdge = graph.edges.find(e => e.id === operation.edge.id)

    if (!oldEdge) {
        return []
    }

    const inverse: UpdateEdgeOperation = {
        type: 'update_edge',
        edge: structuredClone(oldEdge) as EdgeData,
    }

    return [inverse]
}

// move — 从 graph 中捕获旧位置

function createReversalForMoveNode(graph: GraphData, operation: MoveNodeOperation): GraphOperation[] {
    const node = graph.nodes.find(n => n.id === operation.nodeId)

    if (!node || !node.position) {
        return []
    }

    const inverse: MoveNodeOperation = {
        type: 'move_node',
        nodeId: operation.nodeId,
        position: { x: node.position.x, y: node.position.y },
    }

    return [inverse]
}

// collapse / expand — 折叠状态在 graph.cognitiveState 中

function createReversalForCollapseDependency(
    graph: GraphData,
    operation: CollapseDependencyOperation,
): GraphOperation[] {
    const inverse: ExpandDependencyOperation = {
        type: 'expand_dependency',
        targetNodeId: operation.targetNodeId,
    }

    return [inverse]
}

function createReversalForExpandDependency(
    graph: GraphData,
    operation: ExpandDependencyOperation,
): GraphOperation[] {
    // 捕获展开前的折叠状态
    const currentCognitiveState = graph.cognitiveState ?? { foldedDependencies: [] }
    const existingEntry = currentCognitiveState.foldedDependencies.find(
        item => item.targetNodeId === operation.targetNodeId,
    )

    if (!existingEntry) {
        return []
    }

    const inverse: CollapseDependencyOperation = {
        type: 'collapse_dependency',
        targetNodeId: operation.targetNodeId,
    }

    return [inverse]
}
