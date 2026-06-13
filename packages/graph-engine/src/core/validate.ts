/**
 * validate.ts
 *
 * 功能：
 *     校验单步 GraphOperation 是否合法。
 *
 * 总体结构：
 *     1. validateOperation — 统一入口，按 type 分派
 *     2. 原子规则校验函数（Step 4 提取到 core/checkers/）
 *     3. 各 validateXxx — 按操作类型组合原子规则
 *
 * 规则：
 *     1. 只校验当前操作，不修改 GraphData。
 *     2. 原子规则统一在本模块内定义（Step 4 提取到 checkers/）。
 *     3. 不替代 graph_validator 的全图体检。
 *
 * 外部如何使用：
 *     import { validateOperation } from '@my-project/graph-engine'
 */

import type { GraphData, NodeData, EdgeData, NodeId } from '../types/graph_data'
import type { GraphOperation } from '../types/operations'
import type { ValidationIssue, ValidationResult } from '../types/validation'
import { collectDependencyNodeIds } from './execute'

// ═══════════ 规则常量（Step 4 迁移至 core/checkers/rules.ts）═══════════

interface GraphRules {
    nodeLabelMaxLength: number
    edgeLabelMaxLength: number
    summaryMaxLength: number
    nodeSoftLimit: number
    nodeWarningLimit: number
    nodeHardLimit: number
}

const DEFAULT_GRAPH_RULES: GraphRules = {
    nodeLabelMaxLength: 20,
    edgeLabelMaxLength: 10,
    summaryMaxLength: 80,
    nodeSoftLimit: 50,
    nodeWarningLimit: 100,
    nodeHardLimit: 150,
}

// ═══════════ 原子规则校验（Step 4 提取到 core/checkers/）═══════════

function checkNodeLabel(node: NodeData): ValidationIssue[] {
    if ((node.label ?? '').length <= DEFAULT_GRAPH_RULES.nodeLabelMaxLength) return []
    return [{
        level: 'error',
        code: 'NODE_LABEL_TOO_LONG',
        message: `节点标签不能超过 ${DEFAULT_GRAPH_RULES.nodeLabelMaxLength} 个中文字符。`,
        targetType: 'node',
        targetId: node.id,
    }]
}

function checkNodeSummary(node: NodeData): ValidationIssue[] {
    if (node.role !== 'knowledge') return []
    if ((node.summary ?? '').length <= DEFAULT_GRAPH_RULES.summaryMaxLength) return []
    return [{
        level: 'error',
        code: 'NODE_SUMMARY_TOO_LONG',
        message: `节点摘要不能超过 ${DEFAULT_GRAPH_RULES.summaryMaxLength} 字。`,
        targetType: 'node',
        targetId: node.id,
    }]
}

function checkEdgeLabel(edge: EdgeData): ValidationIssue[] {
    if ((edge.label ?? '').length <= DEFAULT_GRAPH_RULES.edgeLabelMaxLength) return []
    return [{
        level: 'error',
        code: 'EDGE_LABEL_TOO_LONG',
        message: `边标签不能超过 ${DEFAULT_GRAPH_RULES.edgeLabelMaxLength} 个中文字符。`,
        targetType: 'edge',
        targetId: edge.id,
    }]
}

function checkSelfLoop(edge: EdgeData): ValidationIssue[] {
    if (edge.source !== edge.target) return []
    return [{
        level: 'error',
        code: 'SELF_LOOP_FORBIDDEN',
        message: '禁止任何边形成自环。',
        targetType: 'edge',
        targetId: edge.id,
    }]
}

function checkDuplicateEdge(graph: GraphData, edge: EdgeData): ValidationIssue[] {
    const hasDuplicate = graph.edges.some(existingEdge => {
        if (existingEdge.id === edge.id) return false
        const same = existingEdge.source === edge.source && existingEdge.target === edge.target
        const opposite = existingEdge.source === edge.target && existingEdge.target === edge.source
        return same || opposite
    })
    if (!hasDuplicate) return []
    return [{
        level: 'error',
        code: 'DUPLICATE_EDGE_FORBIDDEN',
        message: '禁止任意两种边在同一对节点之间构成重边。',
        targetType: 'edge',
        targetId: edge.id,
    }]
}

function checkVirtualNodeEdgeRule(graph: GraphData, edge: EdgeData): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    const nodeMap = new Map(graph.nodes.map(node => [node.id, node]))
    const sourceNode = nodeMap.get(edge.source)
    const targetNode = nodeMap.get(edge.target)
    if (!sourceNode || !targetNode) return issues
    if (sourceNode.role !== 'knowledge' || targetNode.role !== 'knowledge') return issues
    if (sourceNode.kind !== 'virtual' && targetNode.kind !== 'virtual') return issues

    if (edge.kind !== 'virtual' || edge.direction !== 'undirected') {
        issues.push({
            level: 'error',
            code: 'VIRTUAL_NODE_EDGE_TYPE_INVALID',
            message: '虚节点只能通过无向虚边与其他节点连接。',
            targetType: 'edge',
            targetId: edge.id,
        })
    }

    const countVirtualNeighbors = (nodeId: string) => {
        const related = graph.edges.filter(e => e.source === nodeId || e.target === nodeId)
        return related.reduce((sum, e) => {
            const otherId = e.source === nodeId ? e.target : e.source
            const otherNode = nodeMap.get(otherId)
            return sum + ((otherNode?.role === 'knowledge' && otherNode.kind === 'virtual') ? 1 : 0)
        }, 0)
    }

    if (sourceNode.kind === 'virtual' && countVirtualNeighbors(edge.source) > 1) {
        issues.push({
            level: 'error',
            code: 'VIRTUAL_NODE_TOO_MANY_VIRTUAL_NEIGHBORS',
            message: '虚节点最多只能通过无向虚边连接一个虚节点。',
            targetType: 'node',
            targetId: edge.source,
        })
    }
    if (targetNode.kind === 'virtual' && countVirtualNeighbors(edge.target) > 1) {
        issues.push({
            level: 'error',
            code: 'VIRTUAL_NODE_TOO_MANY_VIRTUAL_NEIGHBORS',
            message: '虚节点最多只能通过无向虚边连接一个虚节点。',
            targetType: 'node',
            targetId: edge.target,
        })
    }

    return issues
}

function checkRealDirectedCycle(graph: GraphData): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    const adjacency = new Map<string, string[]>()
    for (const node of graph.nodes) adjacency.set(node.id, [])
    for (const edge of graph.edges) {
        if (edge.kind === 'real' && edge.direction === 'directed') {
            adjacency.get(edge.source)?.push(edge.target)
        }
    }

    const visited = new Set<string>()
    const visiting = new Set<string>()

    const dfs = (nodeId: string): boolean => {
        if (visiting.has(nodeId)) return true
        if (visited.has(nodeId)) return false
        visiting.add(nodeId)
        for (const next of adjacency.get(nodeId) ?? []) {
            if (dfs(next)) return true
        }
        visiting.delete(nodeId)
        visited.add(nodeId)
        return false
    }

    for (const node of graph.nodes) {
        if (dfs(node.id)) {
            issues.push({
                level: 'error',
                code: 'REAL_DIRECTED_CYCLE_FORBIDDEN',
                message: '禁止只通过有向实边形成环。',
                targetType: 'graph',
                targetId: graph.id,
            })
            break
        }
    }

    return issues
}

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

    issues.push(...checkNodeLabel(operation.node))
    issues.push(...checkNodeSummary(operation.node))

    return createResult(issues)
}

function validateAddEdge(graph: GraphData, operation: { type: 'add_edge'; edge: EdgeData }): ValidationResult {
    const issues: ValidationIssue[] = []
    const graphAfterAddEdge = createGraphWithEdge(graph, operation.edge)

    issues.push(...validateEdgeEndpointExists(graph, operation.edge))
    issues.push(...checkEdgeLabel(operation.edge))
    issues.push(...checkSelfLoop(operation.edge))
    issues.push(...checkDuplicateEdge(graph, operation.edge))
    issues.push(...checkVirtualNodeEdgeRule(graphAfterAddEdge, operation.edge))
    issues.push(...checkRealDirectedCycle(graphAfterAddEdge))

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

    issues.push(...checkNodeLabel(operation.node))
    issues.push(...checkNodeSummary(operation.node))

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
    issues.push(...checkEdgeLabel(operation.edge))
    issues.push(...checkSelfLoop(operation.edge))
    issues.push(...checkDuplicateEdge(graphWithoutOldEdge, operation.edge))
    issues.push(...checkVirtualNodeEdgeRule(graphAfterUpdateEdge, operation.edge))
    issues.push(...checkRealDirectedCycle(graphAfterUpdateEdge))

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
