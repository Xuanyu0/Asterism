/**
 * 校验单步图内原子操作的前提条件。
 *
 * @remarks
 * 只校验操作前提（ID 重复、节点存在、位置有效、折叠条件等），GraphData 不变量
 * （标签长度、自环、重边、成环等）由 applyBatch Phase 3 全局规则统一校验。
 * 图级操作（add_graph / delete_graph）不在此校验——由 validate_graph_operation.ts
 * 在多图上下文校验。
 */

import type { GraphData, NodeData, EdgeData, NodeId } from '../types/graph_data'
import type { AtomicOperationInGraph } from '../types/atomic_operations'
import type { ValidationIssue, ValidationResult } from '../types/validation'
import { collectDependencyNodeIds } from './utils/traversal'
import { DEFAULT_GRAPH_RULES } from './validators/thresholds'
import { hasCollisionAt } from '../infrastructure/collision'

/**
 * 校验单步图内原子操作的前提条件。
 *
 * @remarks
 * 只校验局部前提条件；GraphData 不变量由 applyBatch Phase 3 统一校验。
 * 由 applyBatch 内部 Phase 1 调用。
 *
 * @param graph - 操作前的图
 * @param operation - 待校验的图内原子操作
 * @returns 校验结果（valid + issues）。
 */
export function validateOperationInGraph(
    graph: GraphData,
    operation: AtomicOperationInGraph,
): ValidationResult {
    switch (operation.type) {
        case 'add_node':
            return validateAddNode(graph, operation)

        case 'add_edge':
            return validateAddEdge(graph, operation)

        case 'delete_node':
            return validateDeleteNode(graph, operation)

        case 'delete_edge':
            return validateDeleteEdge(graph, operation)

        case 'update_node':
            return validateUpdateNode(graph, operation)

        case 'update_edge':
            return validateUpdateEdge(graph, operation)

        case 'move_node':
            return validateMoveNode(graph, operation)

        case 'collapse_dependency':
            return validateCollapseDependency(graph, operation)

        case 'expand_dependency':
            return validateExpandDependency(graph, operation)
    }
}

// ═══════════ 工具函数 ═══════════

function hasNode(graph: GraphData, nodeId: NodeId): boolean {
    return graph.nodes.some((node) => node.id === nodeId)
}

function createResult(issues: ValidationIssue[]): ValidationResult {
    return {
        valid: issues.every((issue) => issue.severity !== 'error'),
        issues,
    }
}

// ═══════════ 操作校验 ═══════════

function validateAddNode(
    graph: GraphData,
    operation: { type: 'add_node'; node: NodeData },
): ValidationResult {
    const issues: ValidationIssue[] = []

    // 图规则：label 非空（trim 后），空标签节点禁止添加
    if (operation.node.label.trim() === '') {
        issues.push({
            severity: 'error',
            code: 'EMPTY_LABEL',
            message: '节点标签不能为空。',
            targetType: 'node',
            targetId: operation.node.id,
        })
    }

    if (graph.nodes.some((node) => node.id === operation.node.id)) {
        issues.push({
            severity: 'error',
            code: 'NODE_ID_DUPLICATED',
            message: '不能添加 id 已存在的节点。',
            targetType: 'node',
            targetId: operation.node.id,
        })
    }

    if (graph.nodes.length + 1 > DEFAULT_GRAPH_RULES.nodeHardLimit) {
        issues.push({
            severity: 'error',
            code: 'NODE_COUNT_HARD_LIMIT_EXCEEDED',
            message: `当前图节点数即将超过 ${DEFAULT_GRAPH_RULES.nodeHardLimit}，禁止继续添加新节点。`,
            targetType: 'graph',
            targetId: graph.id,
        })
    }

    // 新节点位置碰撞检测：Phase 1 局部规则，只检测新节点与已有节点是否重叠
    if (
        operation.node.position &&
        hasCollisionAt(
            operation.node.id,
            operation.node.position,
            graph.nodes,
            new Map(),
        )
    ) {
        issues.push({
            severity: 'error',
            code: 'NODE_COLLISION',
            message: '节点位置与已有节点碰撞，无法放置。',
            targetType: 'node',
            targetId: operation.node.id,
        })
    }

    return createResult(issues)
}

function validateAddEdge(
    graph: GraphData,
    operation: { type: 'add_edge'; edge: EdgeData },
): ValidationResult {
    const issues: ValidationIssue[] = []

    issues.push(...validateEdgeEndpointExists(graph, operation.edge))

    return createResult(issues)
}

function validateDeleteNode(
    graph: GraphData,
    operation: { type: 'delete_node'; nodeId: NodeId },
): ValidationResult {
    const issues: ValidationIssue[] = []

    if (!hasNode(graph, operation.nodeId)) {
        issues.push({
            severity: 'error',
            code: 'NODE_NOT_FOUND',
            message: '不能删除不存在的节点。',
            targetType: 'node',
            targetId: operation.nodeId,
        })
    }

    return createResult(issues)
}

function validateDeleteEdge(
    graph: GraphData,
    operation: { type: 'delete_edge'; edgeId: string },
): ValidationResult {
    const issues: ValidationIssue[] = []

    if (!graph.edges.some((edge) => edge.id === operation.edgeId)) {
        issues.push({
            severity: 'error',
            code: 'EDGE_NOT_FOUND',
            message: '不能删除不存在的边。',
            targetType: 'edge',
            targetId: operation.edgeId,
        })
    }

    return createResult(issues)
}

function validateUpdateNode(
    graph: GraphData,
    operation: { type: 'update_node'; node: NodeData },
): ValidationResult {
    const issues: ValidationIssue[] = []

    if (!hasNode(graph, operation.node.id)) {
        issues.push({
            severity: 'error',
            code: 'NODE_NOT_FOUND',
            message: '不能更新不存在的节点。',
            targetType: 'node',
            targetId: operation.node.id,
        })
    }

    return createResult(issues)
}

function validateUpdateEdge(
    graph: GraphData,
    operation: { type: 'update_edge'; edge: EdgeData },
): ValidationResult {
    const issues: ValidationIssue[] = []

    if (!graph.edges.some((edge) => edge.id === operation.edge.id)) {
        issues.push({
            severity: 'error',
            code: 'EDGE_NOT_FOUND',
            message: '不能更新不存在的边。',
            targetType: 'edge',
            targetId: operation.edge.id,
        })
    }

    issues.push(...validateEdgeEndpointExists(graph, operation.edge))

    return createResult(issues)
}

function validateMoveNode(
    graph: GraphData,
    operation: {
        type: 'move_node'
        nodeId: NodeId
        position: { x: number; y: number }
    },
): ValidationResult {
    const issues: ValidationIssue[] = []

    if (!hasNode(graph, operation.nodeId)) {
        issues.push({
            severity: 'error',
            code: 'NODE_NOT_FOUND',
            message: '不能移动不存在的节点。',
            targetType: 'node',
            targetId: operation.nodeId,
        })
    }

    if (
        !Number.isFinite(operation.position.x) ||
        !Number.isFinite(operation.position.y)
    ) {
        issues.push({
            severity: 'error',
            code: 'INVALID_NODE_POSITION',
            message: '节点位置必须是有效数字。',
            targetType: 'node',
            targetId: operation.nodeId,
        })
    }

    return createResult(issues)
}

function validateCollapseDependency(
    graph: GraphData,
    operation: {
        type: 'collapse_dependency'
        targetNodeId: NodeId
        foldedNodeIds?: NodeId[]
    },
): ValidationResult {
    const issues: ValidationIssue[] = []
    // 显式折叠成员（undo 逆元路径）：成员来自操作前快照，必然非空，
    // 依赖拓扑重算无意义且可能误报（如折叠后依赖边被删，undo 重算为空）——跳过依赖拓扑类检查。
    const hasExplicitMembers = operation.foldedNodeIds !== undefined

    if (!hasNode(graph, operation.targetNodeId)) {
        issues.push({
            severity: 'error',
            code: 'NODE_NOT_FOUND',
            message: '不能折叠不存在的目标节点。',
            targetType: 'node',
            targetId: operation.targetNodeId,
        })
    }

    if (!hasExplicitMembers) {
        const dependencyNodeIds = collectDependencyNodeIds(
            graph,
            operation.targetNodeId,
        )

        if (dependencyNodeIds.length === 0) {
            issues.push({
                severity: 'error',
                code: 'NO_DEPENDENCY_TO_COLLAPSE',
                message: '目标节点没有可折叠的有向实边前置依赖。',
                targetType: 'node',
                targetId: operation.targetNodeId,
            })
        }

        if (
            hasUndirectedEdgeInsideNodeSet(graph, [
                ...dependencyNodeIds,
                operation.targetNodeId,
            ])
        ) {
            issues.push({
                severity: 'error',
                code: 'DEPENDENCY_REGION_HAS_UNDIRECTED_EDGE',
                message: '依赖折叠区域内存在无向边，暂不允许折叠。',
                targetType: 'node',
                targetId: operation.targetNodeId,
            })
        }
    }

    return createResult(issues)
}

function validateExpandDependency(
    graph: GraphData,
    operation: { type: 'expand_dependency'; targetNodeId: NodeId },
): ValidationResult {
    const issues: ValidationIssue[] = []

    if (!hasNode(graph, operation.targetNodeId)) {
        issues.push({
            severity: 'error',
            code: 'NODE_NOT_FOUND',
            message: '不能展开不存在的目标节点。',
            targetType: 'node',
            targetId: operation.targetNodeId,
        })
    }

    return createResult(issues)
}

function validateEdgeEndpointExists(
    graph: GraphData,
    edge: EdgeData,
): ValidationIssue[] {
    const issues: ValidationIssue[] = []

    if (!hasNode(graph, edge.source)) {
        issues.push({
            severity: 'error',
            code: 'EDGE_SOURCE_NOT_FOUND',
            message: '边的起点节点不存在。',
            targetType: 'edge',
            targetId: edge.id,
        })
    }

    if (!hasNode(graph, edge.target)) {
        issues.push({
            severity: 'error',
            code: 'EDGE_TARGET_NOT_FOUND',
            message: '边的终点节点不存在。',
            targetType: 'edge',
            targetId: edge.id,
        })
    }

    return issues
}

function hasUndirectedEdgeInsideNodeSet(
    graph: GraphData,
    nodeIds: NodeId[],
): boolean {
    const nodeIdSet = new Set(nodeIds)

    return graph.edges.some(
        (edge) =>
            edge.direction === 'undirected' &&
            nodeIdSet.has(edge.source) &&
            nodeIdSet.has(edge.target),
    )
}
