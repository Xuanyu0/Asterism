/**
 * rule_checkers.ts
 *
 * 功能：
 *     提供图规则的原子校验函数。被 validate.ts 和 graph_validator.ts 复用。
 *
 * 总体结构：
 *     1. 节点/边文本校验
 *     2. 自环校验
 *     3. 重边校验
 *     4. 虚节点连接规则校验
 *     5. 有向实边成环检测
 *     6. Phase 2 新增：启发节点边类型、引用节点操作约束、虚节点度数规则
 *
 * 规则：
 *     每个函数返回 ValidationIssue[]。空数组 = 通过。
 *
 * 外部如何使用：
 *     import * as RuleCheckers from './checkers/rule_checkers'
 *     const issues = RuleCheckers.validateSelfLoop(edge)
 */

import type { NodeData, EdgeData, GraphData } from '../../types/graph_data'
import type { ValidationIssue } from '../../types/validation'
import { DEFAULT_GRAPH_RULES } from './rules'

// ═══════════ 标签 / 摘要长度 ═══════════

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

// ═══════════ 自环 / 重边 ═══════════

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

// ═══════════ 虚节点连接规则 ═══════════

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

// ═══════════ 有向实边成环 =══════════

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

// ═══════════ Phase 2 新增 =══════════

/**
 * 功能：
 *     启发节点只能通过有向虚边连接。
 *
 * 规则：
 *     若边两端存在 `referenceKind === 'heuristic'` 的引用节点，
 *     则该边必须是 `kind: 'virtual'` + `direction: 'directed'`。
 */
export function validateHeuristicEdgeReference(graph: GraphData, edge: EdgeData): ValidationIssue[] {
    const nodeMap = new Map(graph.nodes.map(node => [node.id, node]))
    const sourceNode = nodeMap.get(edge.source)
    const targetNode = nodeMap.get(edge.target)

    const sourceIsHeuristic = sourceNode?.role === 'reference' && sourceNode.referenceKind === 'heuristic'
    const targetIsHeuristic = targetNode?.role === 'reference' && targetNode.referenceKind === 'heuristic'

    if (!sourceIsHeuristic && !targetIsHeuristic) return []

    if (edge.kind !== 'virtual' || edge.direction !== 'directed') {
        return [{
            level: 'error',
            code: 'HEURISTIC_NODE_EDGE_TYPE_INVALID',
            message: '启发节点只能通过有向虚边连接。',
            targetType: 'edge',
            targetId: edge.id,
        }]
    }

    return []
}

/**
 * 功能：
 *     引用节点禁止解构/内化操作。
 *
 * 规则：
 *     解构改变原节点抽象等级（修改语义本质），内化改变原节点存在状态。
 *     两者对引用节点均不允许。由认知操作编排层在构造操作序列前校验。
 */
export function validateReferenceNodeOperationConstraint(
    node: NodeData,
    operationType: 'deconstruct' | 'internalize',
): ValidationIssue[] {
    if (node.role !== 'reference') return []

    const descriptions: Record<string, string> = {
        deconstruct: '解构改变原节点抽象等级，修改语义本质。',
        internalize: '内化改变原节点存在状态。',
    }

    return [{
        level: 'error',
        code: 'REFERENCE_NODE_OPERATION_FORBIDDEN',
        message: `不能对引用节点执行${operationType}操作。${descriptions[operationType] ?? ''}`,
        targetType: 'node',
        targetId: node.id,
    }]
}

/**
 * 功能：
 *     虚节点度数规则校验。
 *
 * 规则：
 *     虚节点固定使用基准半径 $r_0$，不参与度数映射。
 *     虚节点的 degree 字段仅用于统计关联边数量，不影响视觉大小。
 *     当前阶段不需要新增额外 degree 约束。保留校验入口以供 Phase 3 扩展。
 */
export function validateVirtualNodeDegreeRule(_node: NodeData): ValidationIssue[] {
    // 虚节点 r₀ 固定由渲染层处理，引擎层暂不需要额外校验。
    // Phase 3：可在此处添加"虚节点 degree 增长过快"等诊断 rule。
    return []
}
