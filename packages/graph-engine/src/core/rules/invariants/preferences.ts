/**
 * 图不变量偏好规则声明（体验类，7 条）。
 *
 * @remarks
 * 偏好规则违反后数据仍合法，仅体验 / 性能差异（标签 / 摘要过长、图规模过大、
 * 虚节点邻居过多），属可配置项：默认全开，经偏好开关表选择性关闭。
 * 本文件顶部就近内联各规则使用的阈值常量，各规则直接读取，不经集中阈值模块间接引用。
 * 偏好开关表（PreferenceRulesTable / DEFAULT_PREFERENCE_RULES_TABLE）已提取至同目录
 * preference_rules_table.ts——无 UI 阶段手动启停偏好规则的入口；check_invariants.ts 以其为
 * 执行侧唯一开关数据源（硬性不变量恒跑，缺席配置面，见 structural.ts）。
 * 本文件只声明规则（check 函数 + PREFERENCE_RULES 列表），不实现执行循环——
 * 遍历执行统一由 check_invariants.ts 单一入口负责。
 */

import type { GraphData } from '../../../types/graph_data'
import type { ValidationIssue } from '../../../types/validation'

import { indexNodesById } from '../../utils/graph_index'

// ═══════════ 阈值内联 ═══════════

// 偏好规则使用阈值集中内联于本文件（模块私有，无跨文件消费方）：
// 标签/摘要长度、节点规模限制各归其规则直接读取。

/** 节点标签最大长度（NODE_LABEL_TOO_LONG 使用）。 */
const NODE_LABEL_MAX_LENGTH = 20

/** 边标签最大长度（EDGE_LABEL_TOO_LONG 使用）。 */
const EDGE_LABEL_MAX_LENGTH = 20

/** 节点摘要 / 上下文摘要最大长度（NODE_SUMMARY_TOO_LONG 使用）。 */
const SUMMARY_MAX_LENGTH = 80

/** 节点数软限制（NODE_COUNT_SOFT_LIMIT_EXCEEDED 使用）。 */
const NODE_SOFT_LIMIT = 50

/** 节点数警告限制（NODE_COUNT_WARNING_LIMIT_EXCEEDED 使用）。 */
const NODE_WARNING_LIMIT = 100

/** 节点数硬限制（NODE_COUNT_HARD_LIMIT_EXCEEDED 使用；Phase 1 预判已移除，本值仅存于 Phase 3 不变量）。 */
const NODE_HARD_LIMIT = 150

// ═══════════ 节点字段规则 ═══════════

export function validateNodeLabels(graph: GraphData): ValidationIssue[] {
    const issues: ValidationIssue[] = []

    for (const node of graph.nodes) {
        if ((node.label ?? '').length > NODE_LABEL_MAX_LENGTH) {
            issues.push({
                severity: 'error',
                code: 'NODE_LABEL_TOO_LONG',
                message: `节点标签不能超过 ${NODE_LABEL_MAX_LENGTH} 个中文字符。`,
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
            if ((node.summary ?? '').length > SUMMARY_MAX_LENGTH) {
                issues.push({
                    severity: 'error',
                    code: 'NODE_SUMMARY_TOO_LONG',
                    message: `节点摘要不能超过 ${SUMMARY_MAX_LENGTH} 字。`,
                    targetType: 'node',
                    targetId: node.id,
                })
            }
        }

        if (node.role === 'reference' && node.referenceKind === 'heuristic') {
            if ((node.contextSummary ?? '').length > SUMMARY_MAX_LENGTH) {
                issues.push({
                    severity: 'error',
                    code: 'NODE_SUMMARY_TOO_LONG',
                    message: `上下文摘要不能超过 ${SUMMARY_MAX_LENGTH} 字。`,
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

    if (nodeCount > NODE_SOFT_LIMIT && nodeCount <= NODE_WARNING_LIMIT) {
        return [
            {
                severity: 'info',
                code: 'NODE_COUNT_SOFT_LIMIT_EXCEEDED',
                message: `节点数超过 ${NODE_SOFT_LIMIT}，建议抽象。`,
                targetType: 'graph',
                targetId: graph.id,
            },
        ]
    }

    return []
}

export function validateNodeCountWarningLimit(graph: GraphData): ValidationIssue[] {
    const nodeCount = graph.nodes.length

    if (nodeCount > NODE_WARNING_LIMIT && nodeCount <= NODE_HARD_LIMIT) {
        return [
            {
                severity: 'warning',
                code: 'NODE_COUNT_WARNING_LIMIT_EXCEEDED',
                message: `节点数超过 ${NODE_WARNING_LIMIT}，强烈建议抽象。`,
                targetType: 'graph',
                targetId: graph.id,
            },
        ]
    }

    return []
}

export function validateNodeCountHardLimit(graph: GraphData): ValidationIssue[] {
    const nodeCount = graph.nodes.length

    if (nodeCount > NODE_HARD_LIMIT) {
        return [
            {
                severity: 'error',
                code: 'NODE_COUNT_HARD_LIMIT_EXCEEDED',
                message: `节点数超过 ${NODE_HARD_LIMIT}，禁止继续添加。`,
                targetType: 'graph',
                targetId: graph.id,
            },
        ]
    }

    return []
}

// ═══════════ 边字段规则 ═══════════

export function validateEdgeLabels(graph: GraphData): ValidationIssue[] {
    const issues: ValidationIssue[] = []

    for (const edge of graph.edges) {
        if ((edge.label ?? '').length > EDGE_LABEL_MAX_LENGTH) {
            issues.push({
                severity: 'error',
                code: 'EDGE_LABEL_TOO_LONG',
                message: `边标签不能超过 ${EDGE_LABEL_MAX_LENGTH} 个中文字符。`,
                targetType: 'edge',
                targetId: edge.id,
            })
        }
    }

    return issues
}

// ═══════════ 虚节点连接规则 ═══════════

export function validateVirtualNodeNeighborCount(graph: GraphData): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    const nodeMap = indexNodesById(graph)

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

// ═══════════ 规则注册列表 ═══════════

/**
 * 偏好规则注册列表。code 与 DEFAULT_PREFERENCE_RULES_TABLE 的 key 对应；
 * check_invariants.ts 遍历本列表时按偏好开关表 `table[code] ?? true` 决定执行与否。
 */
export const PREFERENCE_RULES: Array<{
    code: string
    check: (graph: GraphData) => ValidationIssue[]
}> = [
    { code: 'NODE_LABEL_TOO_LONG', check: validateNodeLabels },
    { code: 'NODE_SUMMARY_TOO_LONG', check: validateNodeSummaries },
    { code: 'EDGE_LABEL_TOO_LONG', check: validateEdgeLabels },
    {
        code: 'VIRTUAL_NODE_TOO_MANY_VIRTUAL_NEIGHBORS',
        check: validateVirtualNodeNeighborCount,
    },
    {
        code: 'NODE_COUNT_SOFT_LIMIT_EXCEEDED',
        check: validateNodeCountSoftLimit,
    },
    {
        code: 'NODE_COUNT_WARNING_LIMIT_EXCEEDED',
        check: validateNodeCountWarningLimit,
    },
    {
        code: 'NODE_COUNT_HARD_LIMIT_EXCEEDED',
        check: validateNodeCountHardLimit,
    },
]
