/**
 * validate.ts
 *
 * 功能：
 *     校验单步 GraphOperation 是否合法。
 *
 * 总体结构：
 *     1. validateOperation — 统一入口，按 type 分派
 *     2. 编排逻辑 — 按操作类型组合 core/checkers/ 中的原子规则
 *     3. 各 validateXxx — 按操作类型编排校验流程
 *
 * 规则：
 *     1. 只校验当前操作，不修改 GraphData。
 *     2. 原子规则统一在 core/checkers/ 中定义，本模块仅做编排。
 *     3. 不替代 graph_validator 的全图体检。
 *
 * 外部如何使用：
 *     import { validateOperation } from '@my-project/graph-engine'
 */

import type { GraphData, NodeData, EdgeData, NodeId } from '../types/graph_data'
import type { GraphOperation } from '../types/operations'
import type { ValidationIssue, ValidationResult } from '../types/validation'
import { collectDependencyNodeIds } from './execute'
import { DEFAULT_GRAPH_RULES } from './checkers/rules'
import * as RuleCheckers from './checkers/rule_checkers'

// ═══════════ 编排逻辑 ═══════════

function hasNode(graph: GraphData, nodeId: NodeId): boolean {
    return graph.nodes.some(node => node.id === nodeId)
}

function createGraphWithEdge(graph: GraphData, edge: EdgeData): GraphData {
    return {
        ...graph,
        edges: [...graph.edges, edge],
    }
}

function createGraphWithoutEdge(graph: GraphData, edgeId: string): GraphData {
    return {
        ...graph,
        edges: graph.edges.filter(edge => edge.id !== edgeId),
    }
}

function createResult(issues: ValidationIssue[]): ValidationResult {
    return {
        valid: issues.every(issue => issue.level !== 'error'),
        issues,
    }
}

// ═══════════ 操作校验 ═══════════

function validateAddNode(graph: GraphData, operation: { type: 'add_node'; node: NodeData }): ValidationResult {
    const issues: ValidationIssue[] = []

    if (graph.nodes.some(node => node.id === operation.node.id)) {
        issues.push({
            level: 'error',
            code: 'NODE_ID_DUPLICATED',
            message: '不能添加 id 已存在的节点。',
            targetType: 'node',
            targetId: operation.node.id,
        })
    }

    if (graph.nodes.length + 1 > DEFAULT_GRAPH_RULES.nodeHardLimit) {
        issues.push({
            level: 'error',
            code: 'NODE_COUNT_HARD_LIMIT_EXCEEDED',
            message: `当前图节点数即将超过 ${DEFAULT_GRAPH_RULES.nodeHardLimit}，禁止继续添加新节点。`,
            targetType: 'graph',
            targetId: graph.id,
        })
    }

    issues.push(...RuleCheckers.validateNodeLabel(operation.node))
    issues.push(...RuleCheckers.validateNodeSummary(operation.node))

    return createResult(issues)
}

function validateAddEdge(graph: GraphData, operation: { type: 'add_edge'; edge: EdgeData }): ValidationResult {
    const issues: ValidationIssue[] = []
    const graphAfterAddEdge = createGraphWithEdge(graph, operation.edge)

    issues.push(...validateEdgeEndpointExists(graph, operation.edge))
    issues.push(...RuleCheckers.validateEdgeLabel(operation.edge))
    issues.push(...RuleCheckers.validateSelfLoop(operation.edge))
    issues.push(...RuleCheckers.validateDuplicateEdge(graph, operation.edge))
    issues.push(...RuleCheckers.validateVirtualNodeEdgeRule(graphAfterAddEdge, operation.edge))
    issues.push(...RuleCheckers.validateRealDirectedCycle(graphAfterAddEdge))

    return createResult(issues)
}

function validateDeleteNode(graph: GraphData, operation: { type: 'delete_node'; nodeId: NodeId }): ValidationResult {
    const issues: ValidationIssue[] = []

    if (!hasNode(graph, operation.nodeId)) {
        issues.push({
            level: 'error',
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
            level: 'error',
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
            level: 'error',
            code: 'NODE_NOT_FOUND',
            message: '不能更新不存在的节点。',
            targetType: 'node',
            targetId: operation.node.id,
        })
    }

    issues.push(...RuleCheckers.validateNodeLabel(operation.node))
    issues.push(...RuleCheckers.validateNodeSummary(operation.node))

    return createResult(issues)
}

function validateUpdateEdge(graph: GraphData, operation: { type: 'update_edge'; edge: EdgeData }): ValidationResult {
    const issues: ValidationIssue[] = []
    const graphWithoutOldEdge = createGraphWithoutEdge(graph, operation.edge.id)
    const graphAfterUpdateEdge = createGraphWithEdge(graphWithoutOldEdge, operation.edge)

    if (!graph.edges.some(edge => edge.id === operation.edge.id)) {
        issues.push({
            level: 'error',
            code: 'EDGE_NOT_FOUND',
            message: '不能更新不存在的边。',
            targetType: 'edge',
            targetId: operation.edge.id,
        })
    }

    issues.push(...validateEdgeEndpointExists(graph, operation.edge))
    issues.push(...RuleCheckers.validateEdgeLabel(operation.edge))
    issues.push(...RuleCheckers.validateSelfLoop(operation.edge))
    issues.push(...RuleCheckers.validateDuplicateEdge(graphWithoutOldEdge, operation.edge))
    issues.push(...RuleCheckers.validateVirtualNodeEdgeRule(graphAfterUpdateEdge, operation.edge))
    issues.push(...RuleCheckers.validateRealDirectedCycle(graphAfterUpdateEdge))

    return createResult(issues)
}

function validateMoveNode(graph: GraphData, operation: { type: 'move_node'; nodeId: NodeId; position: { x: number; y: number } }): ValidationResult {
    const issues: ValidationIssue[] = []

    if (!hasNode(graph, operation.nodeId)) {
        issues.push({
            level: 'error',
            code: 'NODE_NOT_FOUND',
            message: '不能移动不存在的节点。',
            targetType: 'node',
            targetId: operation.nodeId,
        })
    }

    if (!Number.isFinite(operation.position.x) || !Number.isFinite(operation.position.y)) {
        issues.push({
            level: 'error',
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
            level: 'error',
            code: 'NODE_NOT_FOUND',
            message: '不能折叠不存在的目标节点。',
            targetType: 'node',
            targetId: operation.targetNodeId,
        })
    }

    if (dependencyNodeIds.length === 0) {
        issues.push({
            level: 'error',
            code: 'NO_DEPENDENCY_TO_COLLAPSE',
            message: '目标节点没有可折叠的有向实边前置依赖。',
            targetType: 'node',
            targetId: operation.targetNodeId,
        })
    }

    if (hasUndirectedEdgeInsideNodeSet(graph, [...dependencyNodeIds, operation.targetNodeId])) {
        issues.push({
            level: 'error',
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
            level: 'error',
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
            level: 'error',
            code: 'EDGE_SOURCE_NOT_FOUND',
            message: '边的起点节点不存在。',
            targetType: 'edge',
            targetId: edge.id,
        })
    }

    if (!hasNode(graph, edge.target)) {
        issues.push({
            level: 'error',
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
 *     校验单步 GraphOperation 是否合法。
 *
 * 规则：
 *     1. 只校验当前操作，不修改 GraphData。
 *     2. 认知演化操作（explore / discover / deconstruct / induce / internalize）
 *        暂不在 MVP 阶段做数据校验，默认合法。
 *
 * 使用：
 *     applyOperation 内部调用。
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

        default:
            return createResult([])
    }
}
