/**
 * 多图批校验：校验单个图级操作（add_graph / delete_graph）的局部规则。
 *
 * @remarks
 * 与 apply_batches（多图管理层）对称，为图级操作提供前提校验。只校验空图规则：
 * - add_graph：op.graph 必须为空图（nodes / edges 空），内容统一走图内操作填充；
 * - delete_graph：注册表中目标图必须为空图（与 add_graph 只建空图对称，真正互逆）。
 * 图内操作不进本函数——由 applyBatch（validate_operation_in_graph.ts）在单图上下文校验。
 * 纯函数：不修改入参注册表，仅读取校验；applyBatches 图级批 for 循环内逐 op 调用（边校验边执行）。
 */

import type { AtomicGraphOperation } from '../types/atomic_operations'
import type { GraphRegistry } from '../types/graph_data'
import type { ValidationIssue, ValidationResult } from '../types/validation'

/**
 * 校验单个图级操作的局部规则。
 *
 * @remarks
 * add_graph：op.graph 必须为空图（nodes / edges 为空）——图内容统一走图内操作构建。
 * delete_graph：注册表中目标图（op.graph.id）必须为空图——只能删除空图，与 add_graph
 * 只建空图对称（图级操作只碰图的存亡，内容由图内操作负责）。
 * 校验失败返回含 error issue 的结果；调用方（applyBatches）据此整批丢弃。
 *
 * @param registry - 操作前的多图注册表（只读）
 * @param op - 待校验的图级操作
 * @returns 校验结果（valid + issues）。
 */
export function validateGraphOperation(
    registry: GraphRegistry,
    op: AtomicGraphOperation,
): ValidationResult {
    const issues: ValidationIssue[] = []

    if (op.type === 'add_graph') {
        // add_graph 只构造空图：nodes / edges 必须为空，内容统一走图内操作填充
        if (op.graph.nodes.length > 0 || op.graph.edges.length > 0) {
            issues.push({
                severity: 'error',
                code: 'ADD_GRAPH_NOT_EMPTY',
                message: 'add_graph 只能构造空图，nodes 与 edges 必须为空。',
                targetType: 'graph',
                targetId: op.graph.id,
            })
        }
    } else {
        // delete_graph 只能删除空图：注册表目标图必须为空（与 add_graph 只建空图对称）
        const target = registry.get(op.graph.id)
        if (target && (target.nodes.length > 0 || target.edges.length > 0)) {
            issues.push({
                severity: 'error',
                code: 'DELETE_GRAPH_NOT_EMPTY',
                message: 'delete_graph 只能删除空图，目标图仍有内容。',
                targetType: 'graph',
                targetId: op.graph.id,
            })
        }
    }

    return {
        valid: issues.every((issue) => issue.severity !== 'error'),
        issues,
    }
}
