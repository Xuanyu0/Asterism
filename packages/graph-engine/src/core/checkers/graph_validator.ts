/**
 * graph_validator.ts
 *
 * 功能：
 *     对完整 GraphData 做全图体检。使用 rule_checkers.ts 中的原子规则。
 *
 * 总体结构：
 *     1. validateGraph — 全图体检统一入口
 *     2. 节点数量限制校验
 *     3. 逐节点/边调用原子规则
 *     4. Phase 2 新增：dangling 引用检测
 *
 * 规则：
 *     1. 全图体检是诊断/防御工具，非核心路径。
 *     2. 逐步操作场景下合法性由构造过程保证（逐步合法 ⇒ 整体合法）。
 *     3. 加载外部数据时调用本函数做初始验证。
 *
 * 外部如何使用：
 *     import { validateGraph } from '@my-project/graph-engine'
 */

import type { GraphData, NodeData, EdgeData } from '../../types/graph_data'
import type { ValidationIssue, ValidationResult } from '../../types/validation'
import * as RuleCheckers from './rule_checkers'
import { DEFAULT_GRAPH_RULES } from './rules'

export function validateGraph(graph: GraphData): ValidationResult {
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

    // 启发节点边类型校验（Phase 2 新增）
    graph.edges.forEach(edge => {
        issues.push(...RuleCheckers.validateHeuristicEdgeReference(graph, edge))
    })

    // 全图有向实边成环检测
    issues.push(...RuleCheckers.validateRealDirectedCycle(graph))

    // 引用节点一致性校验（Phase 2 新增）
    issues.push(...validateReferenceNodeConsistency(graph))

    return {
        valid: issues.every(issue => issue.level !== 'error'),
        issues,
    }
}

/**
 * 功能：
 *     引用节点一致性校验。检测 dangling 引用。
 *
 * 规则：
 *     每个引用节点必须指向存在的源图/源节点。
 *     当前单图上下文暂不执行多图检查，仅检测同图内的引用一致性。
 *     跨图引用一致性标记为 Phase 3 启用（需 GraphRegistry 参与）。
 */
function validateReferenceNodeConsistency(graph: GraphData): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    const nodeIdSet = new Set(graph.nodes.map(node => node.id))

    const referenceNodes = graph.nodes.filter(node => node.role === 'reference')

    for (const refNode of referenceNodes) {
        // 同图内引用一致性：检测是否指向自身的 graphId 但源节点不存在
        if (refNode.sourceGraphId === graph.id && !nodeIdSet.has(refNode.sourceNodeId)) {
            issues.push({
                level: 'error',
                code: 'DANGLING_REFERENCE',
                message: `引用节点指向的源节点 ${refNode.sourceNodeId} 不存在。`,
                targetType: 'node',
                targetId: refNode.id,
            })
        }
        // 跨图引用一致性暂不检测，Phase 3 启用（需要 GraphRegistry）
    }

    return issues
}
