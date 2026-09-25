/**
 * 注册表不变量校验的单一执行入口。
 *
 * @remarks
 * 是注册表级（森林级）不变量的唯一执行循环，作用于后置状态的 GraphRegistry；与单图不变量的
 * check_invariants.ts（作用于单个 GraphData）同构：类别文件只声明规则（check 函数 + 规则列表），
 * 执行循环仅此一份。
 *
 * 执行语义：注册表级不变量**无条件执行、不查询任何开关表**（缺席配置面），恒跑且不受
 * applyBatch 的 skipValidate 影响——违反后图数据无法被正确解释为一片森林。
 *
 * 作用域：只检查 scopeGraphIds 指定的图（本批涉及的图）。这是本步的**性能取舍**——
 * 已知代价是「未被本批触碰的坏图不会被发现」，刻意接受。
 *
 * @param registry - 后置注册表
 * @param scopeGraphIds - 本批涉及的图 id 集合（按批类型推导，见 apply_batches.ts）
 * @returns 全部注册表级不变量的 issues
 */

import type { GraphId, GraphRegistry } from '../../../types/graph_data'
import type { ValidationIssue } from '../../../types/validation'

import { FOREST_RULES } from './forest'

/**
 * 执行全部注册表级不变量校验。
 *
 * @param registry - 后置注册表
 * @param scopeGraphIds - 本批涉及的图 id 集合；不在后置注册表中的 id 自动跳过
 * @returns 聚合后的全部 issues
 */
export function checkRegistryInvariants(
    registry: GraphRegistry,
    scopeGraphIds: ReadonlySet<GraphId>,
): ValidationIssue[] {
    const issues: ValidationIssue[] = []

    for (const rule of FOREST_RULES) {
        for (const graphId of scopeGraphIds) {
            const graph = registry.get(graphId)
            // 本批删除的图不在后置注册表：无后置状态可校验
            if (!graph) continue

            issues.push(...rule.check(registry, graph))
        }
    }

    return issues
}
