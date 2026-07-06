/**
 * global_rules_table.ts
 *
 * 功能：
 *
 *     定义 GraphData 全局不变量规则表。所有全局规则在 applyBatch Phase 3
 *     中对 dry-run 执行后的结果图统一运行，不依赖具体操作类型。
 *
 * 总体结构：
 *
 *     1. GlobalRulesTable         — 规则开关表
 *     2. DEFAULT_GLOBAL_RULES_TABLE — 默认全部开启
 *     3. 全局规则函数             — (graph) => ValidationIssue[]
 *     4. GLOBAL_RULES             — 规则函数注册表
 *
 * 规则：
 *
 *     1. 全局规则只校验 GraphData 不变量，不接收 operation 参数。
 *     2. 默认所有规则开启；通过 BatchOptions.globalRulesTable 选择性关闭。
 *     3. 150 节点以下直接全遍历，优先可理解性而非性能。
 *
 * 外部如何使用：
 *
 *     import { GLOBAL_RULES, DEFAULT_GLOBAL_RULES_TABLE } from './checkers/global_rules_table'
 *     const issues = GLOBAL_RULES.flatMap(rule => rule.check(graph))
 */

import type { GraphData, NodeData, EdgeData } from '../../types/graph_data'
import type { ValidationIssue } from '../../types/validation'
import { DEFAULT_GRAPH_RULES } from './rules'

// ═══════════ 规则开关表 ═══════════

/**
 * 功能：
 *
 *     全局规则开关配置。
 *
 * 规则：
 *
 *     - key 为规则 code，与 GLOBAL_RULES 中注册的一致。
 *     - value 为 true 时执行该校验，false 时跳过。
 */
export interface GlobalRulesTable {
    [ruleCode: string]: boolean
}

/**
 * 功能：
 *
 *     默认全局规则配置。所有规则默认开启。
 */
export const DEFAULT_GLOBAL_RULES_TABLE: GlobalRulesTable = {
    NODE_LABEL_TOO_LONG: true,
    NODE_SUMMARY_TOO_LONG: true,
    EDGE_LABEL_TOO_LONG: true,
    SELF_LOOP_FORBIDDEN: true,
    DUPLICATE_EDGE_FORBIDDEN: true,
    VIRTUAL_NODE_EDGE_TYPE_INVALID: true,
    VIRTUAL_NODE_TOO_MANY_VIRTUAL_NEIGHBORS: true,
    HEURISTIC_NODE_EDGE_TYPE_INVALID: true,
    REAL_DIRECTED_CYCLE_FORBIDDEN: true,
    DANGLING_REFERENCE: true,
    NODE_COUNT_SOFT_LIMIT_EXCEEDED: true,
    NODE_COUNT_WARNING_LIMIT_EXCEEDED: true,
    NODE_COUNT_HARD_LIMIT_EXCEEDED: true,
}

// ═══════════ 节点字段规则 ═══════════

export function validateNodeLabels(graph: GraphData): ValidationIssue[] {
    const issues: ValidationIssue[] = []

    for (const node of graph.nodes) {
        if ((node.label ?? '').length > DEFAULT_GRAPH_RULES.nodeLabelMaxLength) {
            issues.push({
                severity: 'error',
                code: 'NODE_LABEL_TOO_LONG',
                message: `节点标签不能超过 ${DEFAULT_GRAPH_RULES.nodeLabelMaxLength} 个中文字符。`,
                targetType: 'node',
                targetId: node.id,
            })
        }
    }

    return issues
}

export function validateNodeSummaries(graph: GraphData): ValidationIssue[] {
    const issues: ValidationIssue[] = []

    for (const node of graph.nodes) {
        if (node.role === 'knowledge') {
            if ((node.summary ?? '').length > DEFAULT_GRAPH_RULES.summaryMaxLength) {
                issues.push({
                    severity: 'error',
                    code: 'NODE_SUMMARY_TOO_LONG',
                    message: `节点摘要不能超过 ${DEFAULT_GRAPH_RULES.summaryMaxLength} 字。`,
                    targetType: 'node',
                    targetId: node.id,
                })
            }
        }

        if (node.role === 'reference' && node.referenceKind === 'heuristic') {
            if ((node.contextSummary ?? '').length > DEFAULT_GRAPH_RULES.summaryMaxLength) {
                issues.push({
                    severity: 'error',
                    code: 'NODE_SUMMARY_TOO_LONG',
                    message: `上下文摘要不能超过 ${DEFAULT_GRAPH_RULES.summaryMaxLength} 字。`,
                    targetType: 'node',
                    targetId: node.id,
                })
            }
        }
    }

    return issues
}

// ═══════════ 节点数量规则 ═══════════

export function validateNodeCountSoftLimit(graph: GraphData): ValidationIssue[] {
    const nodeCount = graph.nodes.length

    if (nodeCount > DEFAULT_GRAPH_RULES.nodeSoftLimit && nodeCount <= DEFAULT_GRAPH_RULES.nodeWarningLimit) {
        return [{
            severity: 'info',
            code: 'NODE_COUNT_SOFT_LIMIT_EXCEEDED',
            message: `节点数超过 ${DEFAULT_GRAPH_RULES.nodeSoftLimit}，建议抽象。`,
            targetType: 'graph',
            targetId: graph.id,
        }]
    }

    return []
}

export function validateNodeCountWarningLimit(graph: GraphData): ValidationIssue[] {
    const nodeCount = graph.nodes.length

    if (nodeCount > DEFAULT_GRAPH_RULES.nodeWarningLimit && nodeCount <= DEFAULT_GRAPH_RULES.nodeHardLimit) {
        return [{
            severity: 'warning',
            code: 'NODE_COUNT_WARNING_LIMIT_EXCEEDED',
            message: `节点数超过 ${DEFAULT_GRAPH_RULES.nodeWarningLimit}，强烈建议抽象。`,
            targetType: 'graph',
            targetId: graph.id,
        }]
    }

    return []
}

export function validateNodeCountHardLimit(graph: GraphData): ValidationIssue[] {
    const nodeCount = graph.nodes.length

    if (nodeCount > DEFAULT_GRAPH_RULES.nodeHardLimit) {
        return [{
            severity: 'error',
            code: 'NODE_COUNT_HARD_LIMIT_EXCEEDED',
            message: `节点数超过 ${DEFAULT_GRAPH_RULES.nodeHardLimit}，禁止继续添加。`,
            targetType: 'graph',
            targetId: graph.id,
        }]
    }

    return []
}

// ═══════════ 边字段规则 ═══════════

export function validateEdgeLabels(graph: GraphData): ValidationIssue[] {
    const issues: ValidationIssue[] = []

    for (const edge of graph.edges) {
        if ((edge.label ?? '').length > DEFAULT_GRAPH_RULES.edgeLabelMaxLength) {
            issues.push({
                severity: 'error',
                code: 'EDGE_LABEL_TOO_LONG',
                message: `边标签不能超过 ${DEFAULT_GRAPH_RULES.edgeLabelMaxLength} 个中文字符。`,
                targetType: 'edge',
                targetId: edge.id,
            })
        }
    }

    return issues
}

export function validateSelfLoops(graph: GraphData): ValidationIssue[] {
    const issues: ValidationIssue[] = []

    for (const edge of graph.edges) {
        if (edge.source === edge.target) {
            issues.push({
                severity: 'error',
                code: 'SELF_LOOP_FORBIDDEN',
                message: '禁止任何边形成自环。',
                targetType: 'edge',
                targetId: edge.id,
            })
        }
    }

    return issues
}

export function validateDuplicateEdges(graph: GraphData): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    const seen = new Set<string>()

    for (const edge of graph.edges) {
        const key = edge.source < edge.target
            ? `${edge.source}|${edge.target}`
            : `${edge.target}|${edge.source}`

        if (seen.has(key)) {
            issues.push({
                severity: 'error',
                code: 'DUPLICATE_EDGE_FORBIDDEN',
                message: '禁止任意两种边在同一对节点之间构成重边。',
                targetType: 'edge',
                targetId: edge.id,
            })
        } else {
            seen.add(key)
        }
    }

    return issues
}

// ═══════════ 虚节点连接规则 ═══════════

export function validateVirtualNodeEdgeType(graph: GraphData): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    const nodeMap = new Map(graph.nodes.map(node => [node.id, node]))

    for (const edge of graph.edges) {
        const sourceNode = nodeMap.get(edge.source)
        const targetNode = nodeMap.get(edge.target)

        if (!sourceNode || !targetNode) continue
        if (sourceNode.role !== 'knowledge' || targetNode.role !== 'knowledge') continue
        if (sourceNode.kind !== 'virtual' && targetNode.kind !== 'virtual') continue

        if (edge.kind !== 'virtual' || edge.direction !== 'undirected') {
            issues.push({
                severity: 'error',
                code: 'VIRTUAL_NODE_EDGE_TYPE_INVALID',
                message: '虚节点只能通过无向虚边与其他节点连接。',
                targetType: 'edge',
                targetId: edge.id,
            })
        }
    }

    return issues
}

export function validateVirtualNodeNeighborCount(graph: GraphData): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    const nodeMap = new Map(graph.nodes.map(node => [node.id, node]))

    const countVirtualNeighbors = (nodeId: string): number => {
        let count = 0

        for (const edge of graph.edges) {
            const otherId = edge.source === nodeId ? edge.target : edge.source
            if (otherId === nodeId) continue

            const otherNode = nodeMap.get(otherId)
            if (otherNode?.role === 'knowledge' && otherNode.kind === 'virtual') {
                count++
            }
        }

        return count
    }

    for (const node of graph.nodes) {
        if (node.role === 'knowledge' && node.kind === 'virtual') {
            if (countVirtualNeighbors(node.id) > 1) {
                issues.push({
                    severity: 'error',
                    code: 'VIRTUAL_NODE_TOO_MANY_VIRTUAL_NEIGHBORS',
                    message: '虚节点最多只能通过无向虚边连接一个虚节点。',
                    targetType: 'node',
                    targetId: node.id,
                })
            }
        }
    }

    return issues
}

// ═══════════ 启发节点边类型规则 ═══════════

export function validateHeuristicReferences(graph: GraphData): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    const nodeMap = new Map(graph.nodes.map(node => [node.id, node]))

    for (const edge of graph.edges) {
        const sourceNode = nodeMap.get(edge.source)
        const targetNode = nodeMap.get(edge.target)

        const sourceIsHeuristic = sourceNode?.role === 'reference' && sourceNode.referenceKind === 'heuristic'
        const targetIsHeuristic = targetNode?.role === 'reference' && targetNode.referenceKind === 'heuristic'

        if (!sourceIsHeuristic && !targetIsHeuristic) continue

        if (edge.kind !== 'virtual' || edge.direction !== 'directed') {
            issues.push({
                severity: 'error',
                code: 'HEURISTIC_NODE_EDGE_TYPE_INVALID',
                message: '启发节点只能通过有向虚边连接。',
                targetType: 'edge',
                targetId: edge.id,
            })
        }
    }

    return issues
}

// ═══════════ 有向实边成环 ═══════════

export function validateRealDirectedCycle(graph: GraphData): ValidationIssue[] {
    const adjacency = new Map<string, string[]>()

    for (const node of graph.nodes) {
        adjacency.set(node.id, [])
    }

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
            return [{
                severity: 'error',
                code: 'REAL_DIRECTED_CYCLE_FORBIDDEN',
                message: '禁止只通过有向实边形成环。',
                targetType: 'graph',
                targetId: graph.id,
            }]
        }
    }

    return []
}

// ═══════════ 引用节点一致性 ═══════════

export function validateReferenceNodeConsistency(graph: GraphData): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    const nodeIdSet = new Set(graph.nodes.map(node => node.id))

    for (const node of graph.nodes) {
        if (node.role !== 'reference') continue

        if (node.sourceGraphId === graph.id && !nodeIdSet.has(node.sourceNodeId)) {
            issues.push({
                severity: 'error',
                code: 'DANGLING_REFERENCE',
                message: `引用节点指向的源节点 ${node.sourceNodeId} 不存在。`,
                targetType: 'node',
                targetId: node.id,
            })
        }
    }

    return issues
}

// ═══════════ 规则注册表 ═══════════

/**
 * 功能：
 *
 *     全局规则函数注册表。code 与 DEFAULT_GLOBAL_RULES_TABLE 中的 key 对应。
 */
export const GLOBAL_RULES: Array<{
    code: string
    check: (graph: GraphData) => ValidationIssue[]
}> = [
    { code: 'NODE_LABEL_TOO_LONG', check: validateNodeLabels },
    { code: 'NODE_SUMMARY_TOO_LONG', check: validateNodeSummaries },
    { code: 'EDGE_LABEL_TOO_LONG', check: validateEdgeLabels },
    { code: 'SELF_LOOP_FORBIDDEN', check: validateSelfLoops },
    { code: 'DUPLICATE_EDGE_FORBIDDEN', check: validateDuplicateEdges },
    { code: 'VIRTUAL_NODE_EDGE_TYPE_INVALID', check: validateVirtualNodeEdgeType },
    { code: 'VIRTUAL_NODE_TOO_MANY_VIRTUAL_NEIGHBORS', check: validateVirtualNodeNeighborCount },
    { code: 'HEURISTIC_NODE_EDGE_TYPE_INVALID', check: validateHeuristicReferences },
    { code: 'REAL_DIRECTED_CYCLE_FORBIDDEN', check: validateRealDirectedCycle },
    { code: 'DANGLING_REFERENCE', check: validateReferenceNodeConsistency },
    { code: 'NODE_COUNT_SOFT_LIMIT_EXCEEDED', check: validateNodeCountSoftLimit },
    { code: 'NODE_COUNT_WARNING_LIMIT_EXCEEDED', check: validateNodeCountWarningLimit },
    { code: 'NODE_COUNT_HARD_LIMIT_EXCEEDED', check: validateNodeCountHardLimit },
]

/**
 * 功能：
 *
 *     按开关表执行全局规则校验。
 *
 * 参数：
 *
 *     graph            — 待校验的 GraphData
 *     globalRulesTable — 规则开关表，未显式设置的规则默认开启
 *
 * 使用：
 *
 *     const issues = runGlobalRules(graph, DEFAULT_GLOBAL_RULES_TABLE)
 */
export function runGlobalRules(
    graph: GraphData,
    globalRulesTable: GlobalRulesTable = DEFAULT_GLOBAL_RULES_TABLE,
): ValidationIssue[] {
    const issues: ValidationIssue[] = []

    for (const rule of GLOBAL_RULES) {
        const enabled = globalRulesTable[rule.code] ?? true
        if (!enabled) continue

        issues.push(...rule.check(graph))
    }

    return issues
}
