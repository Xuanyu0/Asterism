/**
 * operation_validator.ts
 *
 * 功能：
 * 校验用户对知识图谱 GraphData 的单步操作是否合法。
 *
 * 总体结构：
 * 1. OperationValidator：单步操作校验器
 * 2. validateOperation：统一入口
 * 3. 各类 validateXxx：按操作类型调用 rule_checkers.ts 中的原子规则
 *
 * 架构定位：
 * Operation-level Validation
 *
 * 设计原则：
 * 1. 只校验当前操作，不修改 GraphData
 * 2. 高频交互优先做局部校验
 * 3. 不替代 graph_validator.ts 的全图体检
 * 4. 原子规则统一复用 rule_checkers.ts
 * 5. 折叠虽然是视觉表现，但因为表达用户认知焦点，所以需要参与操作校验
 *
 * 外部使用方式：
 * import { OperationValidator } from '@/definations/validators/operation_validator'
 * const result = OperationValidator.validateOperation(graphData, operation)
 */

import type { EdgeData, GraphData, NodeId } from '@my-project/graph-engine'
import type {
    AddEdgeOperation,
    AddNodeOperation,
    CollapseDependencyOperation,
    DeleteEdgeOperation,
    DeleteNodeOperation,
    ExpandDependencyOperation,
    GraphOperation,
    MoveNodeOperation,
    UpdateEdgeOperation,
    UpdateNodeOperation,
} from '@my-project/graph-engine'
import { DEFAULT_GRAPH_RULES } from '@/definitions/rules/graph_rules'
import * as RuleCheckers from '@/definitions/validators/rule_checkers'
import type { ValidationIssue, ValidationResult } from '@my-project/graph-engine'

export class OperationValidator {
    static validateOperation(graph: GraphData, operation: GraphOperation): ValidationResult {
        switch (operation.type) {
            case 'add_node':
                return this.validateAddNode(graph, operation) // 校验添加节点

            case 'add_edge':
                return this.validateAddEdge(graph, operation) // 校验添加边

            case 'delete_node':
                return this.validateDeleteNode(graph, operation) // 校验删除节点

            case 'delete_edge':
                return this.validateDeleteEdge(graph, operation) // 校验删除边

            case 'update_node':
                return this.validateUpdateNode(graph, operation) // 校验更新节点

            case 'update_edge':
                return this.validateUpdateEdge(graph, operation) // 校验更新边

            case 'move_node':
                return this.validateMoveNode(graph, operation) // 校验移动节点

            case 'collapse_dependency':
                return this.validateCollapseDependency(graph, operation) // 校验依赖折叠

            case 'expand_dependency':
                return this.validateExpandDependency(graph, operation) // 校验依赖展开

            default:
                return this.createResult([]) // 认知演化操作暂不在 MVP 阶段做数据校验
        }
    }

    private static validateAddNode(graph: GraphData, operation: AddNodeOperation): ValidationResult {
        const issues: ValidationIssue[] = [] // 收集添加节点问题

        if (graph.nodes.some((node) => node.id === operation.node.id)) {
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

        issues.push(...RuleCheckers.validateNodeLabel(operation.node)) // 校验节点标签
        issues.push(...RuleCheckers.validateNodeSummary(operation.node)) // 校验节点摘要

        return this.createResult(issues) // 返回校验结果
    }

    private static validateAddEdge(graph: GraphData, operation: AddEdgeOperation): ValidationResult {
        const issues: ValidationIssue[] = [] // 收集添加边问题
        const graphAfterAddEdge = this.createGraphWithEdge(graph, operation.edge) // 构造添加边后的临时图

        issues.push(...this.validateEdgeEndpointExists(graph, operation.edge)) // 校验边两端节点是否存在
        issues.push(...RuleCheckers.validateEdgeLabel(operation.edge)) // 校验边标签
        issues.push(...RuleCheckers.validateSelfLoop(operation.edge)) // 校验自环
        issues.push(...RuleCheckers.validateDuplicateEdge(graph, operation.edge)) // 校验重边
        issues.push(...RuleCheckers.validateVirtualNodeEdgeRule(graphAfterAddEdge, operation.edge)) // 校验添加后的虚节点连接规则
        issues.push(...RuleCheckers.validateRealDirectedCycle(graphAfterAddEdge)) // 校验添加后的有向实边成环

        return this.createResult(issues) // 返回校验结果
    }

    private static validateDeleteNode(graph: GraphData, operation: DeleteNodeOperation): ValidationResult {
        const issues: ValidationIssue[] = [] // 收集删除节点问题

        if (!this.hasNode(graph, operation.nodeId)) {
            issues.push({
                level: 'error',
                code: 'NODE_NOT_FOUND',
                message: '不能删除不存在的节点。',
                targetType: 'node',
                targetId: operation.nodeId,
            })
        }

        return this.createResult(issues) // MVP 阶段允许删除任意已存在节点
    }

    private static validateDeleteEdge(graph: GraphData, operation: DeleteEdgeOperation): ValidationResult {
        const issues: ValidationIssue[] = [] // 收集删除边问题

        if (!graph.edges.some((edge) => edge.id === operation.edgeId)) {
            issues.push({
                level: 'error',
                code: 'EDGE_NOT_FOUND',
                message: '不能删除不存在的边。',
                targetType: 'edge',
                targetId: operation.edgeId,
            })
        }

        return this.createResult(issues) // MVP 阶段允许删除任意已存在边
    }

    private static validateUpdateNode(graph: GraphData, operation: UpdateNodeOperation): ValidationResult {
        const issues: ValidationIssue[] = [] // 收集更新节点问题

        if (!this.hasNode(graph, operation.node.id)) {
            issues.push({
                level: 'error',
                code: 'NODE_NOT_FOUND',
                message: '不能更新不存在的节点。',
                targetType: 'node',
                targetId: operation.node.id,
            })
        }

        issues.push(...RuleCheckers.validateNodeLabel(operation.node)) // 校验更新后的节点标签
        issues.push(...RuleCheckers.validateNodeSummary(operation.node)) // 校验更新后的节点摘要

        return this.createResult(issues) // 返回校验结果
    }

    private static validateUpdateEdge(graph: GraphData, operation: UpdateEdgeOperation): ValidationResult {
        const issues: ValidationIssue[] = [] // 收集更新边问题
        const graphWithoutOldEdge = this.createGraphWithoutEdge(graph, operation.edge.id) // 构造移除旧边后的临时图
        const graphAfterUpdateEdge = this.createGraphWithEdge(graphWithoutOldEdge, operation.edge) // 构造更新边后的临时图

        if (!graph.edges.some((edge) => edge.id === operation.edge.id)) {
            issues.push({
                level: 'error',
                code: 'EDGE_NOT_FOUND',
                message: '不能更新不存在的边。',
                targetType: 'edge',
                targetId: operation.edge.id,
            })
        }

        issues.push(...this.validateEdgeEndpointExists(graph, operation.edge)) // 校验边两端节点是否存在
        issues.push(...RuleCheckers.validateEdgeLabel(operation.edge)) // 校验更新后的边标签
        issues.push(...RuleCheckers.validateSelfLoop(operation.edge)) // 校验自环
        issues.push(...RuleCheckers.validateDuplicateEdge(graphWithoutOldEdge, operation.edge)) // 校验更新后是否重边
        issues.push(...RuleCheckers.validateVirtualNodeEdgeRule(graphAfterUpdateEdge, operation.edge)) // 校验更新后的虚节点连接规则
        issues.push(...RuleCheckers.validateRealDirectedCycle(graphAfterUpdateEdge)) // 校验更新后的有向实边成环

        return this.createResult(issues) // 返回校验结果
    }

    private static validateMoveNode(graph: GraphData, operation: MoveNodeOperation): ValidationResult {
        const issues: ValidationIssue[] = [] // 收集移动节点问题

        if (!this.hasNode(graph, operation.nodeId)) {
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

        return this.createResult(issues) // 返回校验结果
    }

    private static validateCollapseDependency(graph: GraphData, operation: CollapseDependencyOperation): ValidationResult {
        const issues: ValidationIssue[] = [] // 收集依赖折叠问题
        const dependencyNodeIds = this.findRealDirectedAncestors(graph, operation.targetNodeId) // 查找所有有向实边前置节点

        if (!this.hasNode(graph, operation.targetNodeId)) {
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

        if (this.hasUndirectedEdgeInsideNodeSet(graph, [...dependencyNodeIds, operation.targetNodeId])) {
            issues.push({
                level: 'error',
                code: 'DEPENDENCY_REGION_HAS_UNDIRECTED_EDGE',
                message: '依赖折叠区域内存在无向边，暂不允许折叠。',
                targetType: 'node',
                targetId: operation.targetNodeId,
            })
        }

        return this.createResult(issues) // 返回校验结果
    }

    private static validateExpandDependency(graph: GraphData, operation: ExpandDependencyOperation): ValidationResult {
        const issues: ValidationIssue[] = [] // 收集依赖展开问题

        if (!this.hasNode(graph, operation.targetNodeId)) {
            issues.push({
                level: 'error',
                code: 'NODE_NOT_FOUND',
                message: '不能展开不存在的目标节点。',
                targetType: 'node',
                targetId: operation.targetNodeId,
            })
        }

        return this.createResult(issues) // 返回校验结果
    }

    private static validateEdgeEndpointExists(graph: GraphData, edge: EdgeData): ValidationIssue[] {
        const issues: ValidationIssue[] = [] // 收集边端点问题

        if (!this.hasNode(graph, edge.source)) {
            issues.push({
                level: 'error',
                code: 'EDGE_SOURCE_NOT_FOUND',
                message: '边的起点节点不存在。',
                targetType: 'edge',
                targetId: edge.id,
            })
        }

        if (!this.hasNode(graph, edge.target)) {
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

    private static hasNode(graph: GraphData, nodeId: NodeId): boolean {
        return graph.nodes.some((node) => node.id === nodeId) // 判断节点是否存在
    }

    private static findRealDirectedAncestors(graph: GraphData, targetNodeId: NodeId): NodeId[] {
        const visitedNodeIds = new Set<NodeId>() // 已经找到的前置节点
        const pendingNodeIds: NodeId[] = [targetNodeId] // 待继续向前搜索的节点

        while (pendingNodeIds.length > 0) {
            const currentNodeId = pendingNodeIds.pop() // 取出当前搜索节点

            if (!currentNodeId) {
                continue
            }

            const incomingEdges = graph.edges.filter((edge) => (
                edge.target === currentNodeId
                && edge.kind === 'real'
                && edge.direction === 'directed'
            )) // 只沿有向实边向前搜索

            for (const edge of incomingEdges) {
                if (!visitedNodeIds.has(edge.source) && edge.source !== targetNodeId) {
                    visitedNodeIds.add(edge.source) // 记录前置节点
                    pendingNodeIds.push(edge.source) // 继续向更前置节点搜索
                }
            }
        }

        return Array.from(visitedNodeIds) // 返回所有前置依赖节点
    }

    private static hasUndirectedEdgeInsideNodeSet(graph: GraphData, nodeIds: NodeId[]): boolean {
        const nodeIdSet = new Set(nodeIds) // 构造节点集合，方便判断边是否在折叠区域内部

        return graph.edges.some((edge) => (
            edge.direction === 'undirected'
            && nodeIdSet.has(edge.source)
            && nodeIdSet.has(edge.target)
        )) // 判断区域内部是否存在无向边
    }

    private static createGraphWithEdge(graph: GraphData, edge: EdgeData): GraphData {
        return {
            ...graph,
            edges: [...graph.edges, edge],
        } // 构造添加边后的临时图
    }

    private static createGraphWithoutEdge(graph: GraphData, edgeId: string): GraphData {
        return {
            ...graph,
            edges: graph.edges.filter((edge) => edge.id !== edgeId),
        } // 构造移除指定边后的临时图
    }

    private static createResult(issues: ValidationIssue[]): ValidationResult {
        return {
            valid: issues.every((issue) => issue.level !== 'error'), // 没有 error 才允许操作
            issues, // 返回校验问题
        }
    }
}
