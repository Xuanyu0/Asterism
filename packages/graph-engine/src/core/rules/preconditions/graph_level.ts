/**
 * 图级前置条件校验：校验单个图级操作（add_graph / delete_graph / update_graph）的局部规则。
 *
 * @remarks
 * 与 apply_batches（多图管理层）对称，为图级操作提供前提校验：
 * - add_graph：op.graph 必须为空图（nodes / edges 空），内容统一走图内操作填充；
 * - delete_graph：注册表中目标图必须为空图（与 add_graph 只建空图对称，真正互逆）；
 * - update_graph：注册表中目标图必须存在（整图替换的前提，目标不存在则无可替换对象）。
 * - add_graph / update_graph：title 非空（trim 后）；root 图间 title 唯一（trim 后比较，
 *   排除自身 id；子图不做唯一性校验——面包屑路径可区分）。
 * 图内操作不进本函数——由 applyBatch 经同目录的 in_graph.ts 在单图上下文校验。
 * 纯函数：不修改入参注册表，仅读取校验；applyBatches 图级批 for 循环内逐 op 调用（边校验边执行）。
 */

import type { AtomicGraphOperation } from '../../../types/atomic_operations'
import type { GraphId, GraphRegistry } from '../../../types/graph_data'
import type { ValidationIssue, ValidationResult } from '../../../types/validation'

import { toValidationResult } from '../../utils/validation_result'

/**
 * 校验单个图级操作的局部规则。
 *
 * @remarks
 * add_graph：op.graph 必须为空图（nodes / edges 为空）——图内容统一走图内操作构建。
 * delete_graph：注册表中目标图（op.graph.id）必须为空图——只能删除空图，与 add_graph
 * 只建空图对称（图级操作只碰图的存亡，内容由图内操作负责）。
 * update_graph：注册表目标图必须存在——整图替换作用于已注册图。
 * add_graph / update_graph 共同：title trim 后非空（EMPTY_TITLE），且 root 图间 title
 * 唯一（TITLE_DUPLICATE，trim 后比较、排除自身 id；子图不校验唯一性）。
 * 校验失败返回含 error issue 的结果；调用方（applyBatches）据此整批丢弃。
 *
 * @param registry - 操作前的多图注册表（只读）
 * @param op - 待校验的图级操作
 * @returns 校验结果（valid + issues）。
 */
export function validateGraphOperation(registry: GraphRegistry, op: AtomicGraphOperation): ValidationResult {
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

        // title 校验：空名 + root 图间唯一（子图不校验唯一性，面包屑路径可区分）
        const title = op.graph.title.trim()
        if (title === '') {
            issues.push(buildEmptyTitleIssue(op.graph.id))
        }
        if (op.graph.kind === 'root' && hasDuplicateRootTitle(registry, op.graph.id, title)) {
            issues.push(buildTitleDuplicateIssue(op.graph.id, title))
        }
    } else if (op.type === 'update_graph') {
        // update_graph 目标图必须在注册表存在：整图替换的前提
        if (!registry.has(op.graph.id)) {
            issues.push({
                severity: 'error',
                code: 'UPDATE_GRAPH_NOT_FOUND',
                message: '不能更新不存在的图。',
                targetType: 'graph',
                targetId: op.graph.id,
            })
        }

        // title 校验：空名 + root 图间唯一（排除自身 id——改回当前 title 不报重名）
        const title = op.graph.title.trim()
        if (title === '') {
            issues.push(buildEmptyTitleIssue(op.graph.id))
        }
        if (op.graph.kind === 'root' && hasDuplicateRootTitle(registry, op.graph.id, title)) {
            issues.push(buildTitleDuplicateIssue(op.graph.id, title))
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

    return toValidationResult(issues)
}

// ═══════════ title 校验辅助 ═══════════

/**
 * EMPTY_TITLE issue 构造：title trim 后为空。
 *
 * @param graphId - 目标图 id
 * @returns EMPTY_TITLE 错误 issue
 */
function buildEmptyTitleIssue(graphId: GraphId): ValidationIssue {
    return {
        severity: 'error',
        code: 'EMPTY_TITLE',
        message: '图名不能为空。',
        targetType: 'graph',
        targetId: graphId,
    }
}

/**
 * TITLE_DUPLICATE issue 构造：root 图与其他 root 图 title 重复（trim 后比较）。
 *
 * @param graphId - 目标图 id
 * @param title - trim 后的图名
 * @returns TITLE_DUPLICATE 错误 issue
 */
function buildTitleDuplicateIssue(graphId: GraphId, title: string): ValidationIssue {
    return {
        severity: 'error',
        code: 'TITLE_DUPLICATE',
        message: `图名与其他根图谱重复：${title}`,
        targetType: 'graph',
        targetId: graphId,
    }
}

/**
 * root 图同名冲突检测：注册表其他 root 图中是否存在 trim 后同名的图。
 *
 * @param registry - 操作前的多图注册表（只读）
 * @param graphId - 自身图 id（排除，改回当前 title 不报重名）
 * @param title - trim 后的目标图名
 * @returns 存在同名 root 图返回 true。
 */
function hasDuplicateRootTitle(registry: GraphRegistry, graphId: GraphId, title: string): boolean {
    for (const [id, graph] of registry) {
        if (id !== graphId && graph.kind === 'root' && graph.title.trim() === title) {
            return true
        }
    }

    return false
}
