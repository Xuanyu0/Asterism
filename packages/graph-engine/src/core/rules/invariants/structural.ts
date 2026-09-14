/**
 * 硬性图不变量规则声明（结构类 + 语义类，8 条）。
 *
 * @remarks
 * 硬性不变量违反后数据 / 引擎无法被正确解释或操作，属不可配置项——不读取偏好阈值、
 * 不参与偏好开关表条目（缺席配置面）。按性质分为两组：
 * - 结构类：SELF_LOOP_FORBIDDEN / DUPLICATE_EDGE_FORBIDDEN / DANGLING_REFERENCE /
 *   EDGE_SOURCE_NOT_FOUND / EDGE_TARGET_NOT_FOUND（悬空边，与 DANGLING_REFERENCE 同族）
 * - 语义类：REAL_DIRECTED_CYCLE_FORBIDDEN / VIRTUAL_NODE_EDGE_TYPE_INVALID / HEURISTIC_NODE_EDGE_TYPE_INVALID
 * 本文件只声明规则（check 函数 + STRUCTURAL_RULES 列表），不实现执行循环——
 * 遍历执行统一由 check_invariants.ts 单一入口负责，硬性规则在该入口**无条件执行、不查表**。
 */

import type { GraphData } from '../../../types/graph_data'
import type { ValidationIssue } from '../../../types/validation'

import { indexNodesById } from '../../utils/graph_index'

// ═══════════ 结构类规则 ═══════════

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
        const key = edge.source < edge.target ? `${edge.source}|${edge.target}` : `${edge.target}|${edge.source}`

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

export function validateReferenceNodeConsistency(graph: GraphData): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    const nodeIdSet = new Set(graph.nodes.map((node) => node.id))

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

/**
 * 单侧端点存在性检查辅助：source / target 各自独立成规则共用的实现。
 *
 * @remarks
 * EDGE_SOURCE_NOT_FOUND 与 EDGE_TARGET_NOT_FOUND 在 STRUCTURAL_RULES 中各占一条、
 * code ↔ check 1:1——若两者共用一个"双侧遍历"check，注册表遍历会把该 check 执行两次，
 * 同一悬空边错误被重复上报两份。故按侧别拆成两个 check，本辅助只负责单侧遍历。
 *
 * @param graph - 待校验的 GraphData
 * @param side - 检查的端点侧别（source → EDGE_SOURCE_NOT_FOUND；target → EDGE_TARGET_NOT_FOUND）
 * @returns 该侧端点缺失的 error issues
 */
function validateMissingEdgeEndpoint(graph: GraphData, side: 'source' | 'target'): ValidationIssue[] {
    const nodeIdSet = new Set(graph.nodes.map((node) => node.id))
    const code = side === 'source' ? 'EDGE_SOURCE_NOT_FOUND' : 'EDGE_TARGET_NOT_FOUND'
    const message = side === 'source' ? '边的起点节点不存在。' : '边的终点节点不存在。'
    const issues: ValidationIssue[] = []

    for (const edge of graph.edges) {
        if (!nodeIdSet.has(edge[side])) {
            issues.push({
                severity: 'error',
                code,
                message,
                targetType: 'edge',
                targetId: edge.id,
            })
        }
    }

    return issues
}

/**
 * 边起点存在性：遍历全部边，起点不在本图 nodes 中即报 EDGE_SOURCE_NOT_FOUND。
 *
 * @remarks
 * 悬空边与 DANGLING_REFERENCE 语义互补不重叠：本规则查普通边的 source 端点是否存在于
 * 节点集，DANGLING_REFERENCE 查 reference 节点指向的源节点（sourceNodeId）。
 *
 * @param graph - 待校验的 GraphData
 * @returns EDGE_SOURCE_NOT_FOUND error issues
 */
export function validateEdgeSourceExists(graph: GraphData): ValidationIssue[] {
    return validateMissingEdgeEndpoint(graph, 'source')
}

/**
 * 边终点存在性：遍历全部边，终点不在本图 nodes 中即报 EDGE_TARGET_NOT_FOUND。
 *
 * @remarks
 * 悬空边与 DANGLING_REFERENCE 语义互补不重叠：本规则查普通边的 target 端点是否存在于
 * 节点集，DANGLING_REFERENCE 查 reference 节点指向的源节点（sourceNodeId）。
 *
 * @param graph - 待校验的 GraphData
 * @returns EDGE_TARGET_NOT_FOUND error issues
 */
export function validateEdgeTargetExists(graph: GraphData): ValidationIssue[] {
    return validateMissingEdgeEndpoint(graph, 'target')
}

// ═══════════ 语义类规则 ═══════════

export function validateVirtualNodeEdgeType(graph: GraphData): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    const nodeMap = indexNodesById(graph)

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

export function validateHeuristicReferences(graph: GraphData): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    const nodeMap = indexNodesById(graph)

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
            return [
                {
                    severity: 'error',
                    code: 'REAL_DIRECTED_CYCLE_FORBIDDEN',
                    message: '禁止只通过有向实边形成环。',
                    targetType: 'graph',
                    targetId: graph.id,
                },
            ]
        }
    }

    return []
}

// ═══════════ 规则注册列表 ═══════════

/**
 * 硬性不变量规则注册列表。code 与偏好侧开关无交集（偏好开关表见 preferences.ts）；
 * check_invariants.ts 遍历本列表时**无条件执行**（不查询偏好开关表）。
 */
export const STRUCTURAL_RULES: Array<{
    code: string
    check: (graph: GraphData) => ValidationIssue[]
}> = [
    // 结构类
    { code: 'SELF_LOOP_FORBIDDEN', check: validateSelfLoops },
    { code: 'DUPLICATE_EDGE_FORBIDDEN', check: validateDuplicateEdges },
    {
        code: 'EDGE_SOURCE_NOT_FOUND',
        check: validateEdgeSourceExists,
    },
    {
        code: 'EDGE_TARGET_NOT_FOUND',
        check: validateEdgeTargetExists,
    },
    { code: 'DANGLING_REFERENCE', check: validateReferenceNodeConsistency },
    // 语义类
    { code: 'REAL_DIRECTED_CYCLE_FORBIDDEN', check: validateRealDirectedCycle },
    {
        code: 'VIRTUAL_NODE_EDGE_TYPE_INVALID',
        check: validateVirtualNodeEdgeType,
    },
    {
        code: 'HEURISTIC_NODE_EDGE_TYPE_INVALID',
        check: validateHeuristicReferences,
    },
]
