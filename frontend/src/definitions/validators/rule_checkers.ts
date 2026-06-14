/**
 * rule_checkers.ts
 *
 * 功能：
 * 提供图规则的原子校验函数。
 * 可被 graph_validator.ts 和 operation_validator.ts 复用。
 *
 * 总体结构：
 * 1. 节点/边文本校验
 * 2. 自环校验
 * 3. 重边校验
 * 4. 虚节点连接规则校验
 * 5. 有向实边成环检测
 *
 * 外部使用方式：
 * import * as RuleCheckers from '@/types/rule_checkers'
 *
 * const issues = RuleCheckers.validateSelfLoop(edge)
 */

import type { NodeData, EdgeData, GraphData } from '@my-project/graph-engine'
import { DEFAULT_GRAPH_RULES } from '@/definitions/rules/graph_rules'
import type { ValidationIssue } from '@my-project/graph-engine'

export function validateNodeLabel(node: NodeData): ValidationIssue[] {
    if ((node.label ?? '').length <= DEFAULT_GRAPH_RULES.nodeLabelMaxLength) return []
    return [{
        level: 'error',
        code: 'NODE_LABEL_TOO_LONG',
        message: `节点标签不能超过 ${DEFAULT_GRAPH_RULES.nodeLabelMaxLength} 个中文字符。`,
        targetType: 'node',
        targetId: node.id,
    }]
}

export function validateNodeSummary(node: NodeData): ValidationIssue[] {
    if (node.role !== 'knowledge') return [] // 引用节点无 summary 属性
    if ((node.summary ?? '').length <= DEFAULT_GRAPH_RULES.summaryMaxLength) return []
    return [{
        level: 'error',
        code: 'NODE_SUMMARY_TOO_LONG',
        message: `节点摘要不能超过 ${DEFAULT_GRAPH_RULES.summaryMaxLength} 字。`,
        targetType: 'node',
        targetId: node.id,
    }]
}

export function validateEdgeLabel(edge: EdgeData): ValidationIssue[] {
    if ((edge.label ?? '').length <= DEFAULT_GRAPH_RULES.edgeLabelMaxLength) return []
    return [{
        level: 'error',
        code: 'EDGE_LABEL_TOO_LONG',
        message: `边标签不能超过 ${DEFAULT_GRAPH_RULES.edgeLabelMaxLength} 个中文字符。`,
        targetType: 'edge',
        targetId: edge.id,
    }]
}

export function validateSelfLoop(edge: EdgeData): ValidationIssue[] {
    if (edge.source !== edge.target) return []
    return [{
        level: 'error',
        code: 'SELF_LOOP_FORBIDDEN',
        message: '禁止任何边形成自环。',
        targetType: 'edge',
        targetId: edge.id,
    }]
}

export function validateDuplicateEdge(graph: GraphData, edge: EdgeData): ValidationIssue[] {
    const hasDuplicate = graph.edges.some(existingEdge => {
        if (existingEdge.id === edge.id) return false // 排除自身
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

export function validateVirtualNodeEdgeRule(graph: GraphData, edge: EdgeData): ValidationIssue[] {
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
        const related = graph.edges.filter(edge => edge.source === nodeId || edge.target === nodeId)
        return related.reduce((sum, edge) => {
            const otherId = edge.source === nodeId ? edge.target : edge.source
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

export function validateRealDirectedCycle(graph: GraphData): ValidationIssue[] {
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
