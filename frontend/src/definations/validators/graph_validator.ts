/**
 * graph_validator.ts
 *
 * 功能：
 * 使用 rule_checkers.ts 中的原子规则对整个 GraphData 做全图体检
 *
 * 外部使用：
 * import { GraphValidator } from '@/types/graph_validator'
 * const result = GraphValidator.validateGraph(graphData)
 */

import type { GraphData, NodeData, EdgeData } from '@/definations/types/graph_types'
import type { ValidationIssue, ValidationResult } from '@/definations/types/validation_types'
import * as RuleCheckers from '@/definations/validators/rule_checkers'
import { DEFAULT_GRAPH_RULES } from '@/definations/rules/graph_rules'

export class GraphValidator {
    static validateGraph(graph: GraphData): ValidationResult {
        const issues: ValidationIssue[] = []

        // 节点数量限制
        const nodeCount = graph.nodes.length
        if (nodeCount > DEFAULT_GRAPH_RULES.nodeSoftLimit && nodeCount <= DEFAULT_GRAPH_RULES.nodeWarningLimit) {
            issues.push({
                level: 'info',
                code: 'NODE_COUNT_SOFT_LIMIT_EXCEEDED',
                message: `节点数超过 ${DEFAULT_GRAPH_RULES.nodeSoftLimit}，建议抽象。`,
                targetType: 'graph',
                targetId: graph.id,
            })
        }
        if (nodeCount > DEFAULT_GRAPH_RULES.nodeWarningLimit && nodeCount <= DEFAULT_GRAPH_RULES.nodeHardLimit) {
            issues.push({
                level: 'warning',
                code: 'NODE_COUNT_WARNING_LIMIT_EXCEEDED',
                message: `节点数超过 ${DEFAULT_GRAPH_RULES.nodeWarningLimit}，强烈建议抽象。`,
                targetType: 'graph',
                targetId: graph.id,
            })
        }
        if (nodeCount > DEFAULT_GRAPH_RULES.nodeHardLimit) {
            issues.push({
                level: 'error',
                code: 'NODE_COUNT_HARD_LIMIT_EXCEEDED',
                message: `节点数超过 ${DEFAULT_GRAPH_RULES.nodeHardLimit}，禁止继续添加。`,
                targetType: 'graph',
                targetId: graph.id,
            })
        }

        // 节点字段校验
        graph.nodes.forEach((node: NodeData) => {
            issues.push(...RuleCheckers.validateNodeLabel(node))
            issues.push(...RuleCheckers.validateNodeSummary(node))
        })

        // 边字段校验
        graph.edges.forEach((edge: EdgeData) => {
            issues.push(...RuleCheckers.validateEdgeLabel(edge))
            issues.push(...RuleCheckers.validateSelfLoop(edge))
        })

        // 重边校验
        graph.edges.forEach(edge => {
            issues.push(...RuleCheckers.validateDuplicateEdge(graph, edge))
        })

        // 虚节点连接规则
        graph.edges.forEach(edge => {
            issues.push(...RuleCheckers.validateVirtualNodeEdgeRule(graph, edge))
        })

        // 全图有向实边成环检测
        issues.push(...RuleCheckers.validateRealDirectedCycle(graph))

        return {
            valid: issues.every(issue => issue.level !== 'error'),
            issues,
        }
    }
}
