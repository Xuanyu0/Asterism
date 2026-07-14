/**
 * validate.ts
 *
 * 功能：
 *
 *     校验单步 GraphOperation 的前提条件是否满足。
 *
 * 总体结构：
 *
 *     1. validateOperation — 统一入口，按 type 分派
 *     2. 各 validateXxx    — 按操作类型编排局部校验
 *
 * 规则：
 *
 *     1. 只校验操作前提（ID 重复、节点存在、位置有效、折叠条件等）。
 *     2. GraphData 不变量（标签长度、自环、重边、成环等）由 applyBatch Phase 3 全局规则统一校验。
 *     3. 认知演化操作（explore / unearth）不在 MVP 阶段做数据校验，默认合法。
 *
 * 外部如何使用：
 *
 *     import { validateOperation } from '@my-project/graph-engine'
 */

import type { GraphData, NodeData, EdgeData, NodeId } from '../types/graph_data'
import type { GraphOperation } from '../types/atomic_operations'
import type { ValidationIssue, ValidationResult } from '../types/validation'
import { collectDependencyNodeIds } from './traversal'
import { DEFAULT_GRAPH_RULES } from './checkers/rules'
import { hasCollisionAt } from '../infrastructure/collision'

// ═══════════ 工具函数 ═══════════

function hasNode(graph: GraphData, nodeId: NodeId): boolean {
    return graph.nodes.some(node => node.id === nodeId)
}

function createResult(issues: ValidationIssue[]): ValidationResult {
    return {
        valid: issues.every(issue => issue.severity !== 'error'),
        issues,
    }
}

// ═══════════ 操作校验 ═══════════

function validateAddNode(graph: GraphData, operation: { type: 'add_node'; node: NodeData }): ValidationResult {
    const issues: ValidationIssue[] = []

    if (graph.nodes.some(node => node.id === operation.node.id)) {
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
    if (operation.node.position && hasCollisionAt(
        operation.node.id,
        operation.node.position,
        graph.nodes,
        new Map(),
    )) {
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

function validateAddEdge(graph: GraphData, operation: { type: 'add_edge'; edge: EdgeData }): ValidationResult {
    const issues: ValidationIssue[] = []

    issues.push(...validateEdgeEndpointExists(graph, operation.edge))

    return createResult(issues)
}

function validateDeleteNode(graph: GraphData, operation: { type: 'delete_node'; nodeId: NodeId }): ValidationResult {
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

function validateDeleteEdge(graph: GraphData, operation: { type: 'delete_edge'; edgeId: string }): ValidationResult {
    const issues: ValidationIssue[] = []

    if (!graph.edges.some(edge => edge.id === operation.edgeId)) {
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

function validateUpdateNode(graph: GraphData, operation: { type: 'update_node'; node: NodeData }): ValidationResult {
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

function validateUpdateEdge(graph: GraphData, operation: { type: 'update_edge'; edge: EdgeData }): ValidationResult {
    const issues: ValidationIssue[] = []

    if (!graph.edges.some(edge => edge.id === operation.edge.id)) {
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

function validateMoveNode(graph: GraphData, operation: { type: 'move_node'; nodeId: NodeId; position: { x: number; y: number } }): ValidationResult {
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

    if (!Number.isFinite(operation.position.x) || !Number.isFinite(operation.position.y)) {
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

function validateCollapseDependency(graph: GraphData, operation: { type: 'collapse_dependency'; targetNodeId: NodeId }): ValidationResult {
    const issues: ValidationIssue[] = []
    const dependencyNodeIds = collectDependencyNodeIds(graph, operation.targetNodeId)

    if (!hasNode(graph, operation.targetNodeId)) {
        issues.push({
            severity: 'error',
            code: 'NODE_NOT_FOUND',
            message: '不能折叠不存在的目标节点。',
            targetType: 'node',
            targetId: operation.targetNodeId,
        })
    }

    if (dependencyNodeIds.length === 0) {
        issues.push({
            severity: 'error',
            code: 'NO_DEPENDENCY_TO_COLLAPSE',
            message: '目标节点没有可折叠的有向实边前置依赖。',
            targetType: 'node',
            targetId: operation.targetNodeId,
        })
    }

    if (hasUndirectedEdgeInsideNodeSet(graph, [...dependencyNodeIds, operation.targetNodeId])) {
        issues.push({
            severity: 'error',
            code: 'DEPENDENCY_REGION_HAS_UNDIRECTED_EDGE',
            message: '依赖折叠区域内存在无向边，暂不允许折叠。',
            targetType: 'node',
            targetId: operation.targetNodeId,
        })
    }

    return createResult(issues)
}

function validateExpandDependency(graph: GraphData, operation: { type: 'expand_dependency'; targetNodeId: NodeId }): ValidationResult {
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

function validateEdgeEndpointExists(graph: GraphData, edge: EdgeData): ValidationIssue[] {
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

function hasUndirectedEdgeInsideNodeSet(graph: GraphData, nodeIds: NodeId[]): boolean {
    const nodeIdSet = new Set(nodeIds)

    return graph.edges.some(edge =>
        edge.direction === 'undirected'
        && nodeIdSet.has(edge.source)
        && nodeIdSet.has(edge.target),
    )
}

// ═══════════ 公开 API ═══════════

/**
 * 功能：
 *
 *     校验单步 GraphOperation 的前提条件是否满足。
 *
 * 规则：
 *
 *     1. 只校验局部前提条件。
 *     2. GraphData 不变量由 applyBatch Phase 3 统一校验。
 *
 * 使用：
 *
 *     applyBatch 内部 Phase 1 调用。
 */
export function validateOperation(graph: GraphData, operation: GraphOperation): ValidationResult {
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

        case 'add_graph':
        case 'delete_graph':
            return createResult([])

        default:
            return createResult([])
    }
}
