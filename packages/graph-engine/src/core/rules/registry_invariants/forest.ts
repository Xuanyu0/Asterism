/**
 * 森林级注册表不变量规则声明。
 *
 * @remarks
 * 森林级 = 命题判定需要**树外数据**（目标在其他树 / 目标不在 registry）；与树级
 * （只依赖单棵树内部数据即可判定）相对。本文件当前只声明森林级规则：
 * 引用目标必须与源图同树。树级规则尚无实现，不建空占位。
 * 本文件只声明规则（check 函数 + FOREST_RULES 列表），不实现执行循环——
 * 遍历执行统一由 check_registry_invariants.ts 单一入口负责。
 *
 * 无开关：森林级不变量**恒跑**，不提供任何规则开关 / 校验档位 / 布尔旁路参数，
 * 不受 applyBatch 的 skipValidate 影响（与硬性 STRUCTURAL_RULES 的「缺席配置面」一致）。
 */

import type { GraphData, GraphId, GraphRegistry, NodeData } from '../../../types/graph_data'
import type { ValidationIssue } from '../../../types/validation'

// ═══════════ 规则注册列表 ═══════════

/**
 * 森林级不变量规则注册列表。check_registry_invariants.ts 遍历本列表时**无条件执行**
 * （不查询任何开关表，缺席配置面）——森林级不变量恒跑，不受 applyBatch 的 skipValidate 影响。
 */
export const FOREST_RULES: Array<{
    code: string
    check: (registry: GraphRegistry, graph: GraphData) => ValidationIssue[]
}> = [{ code: 'CROSS_GRAPH_TREE_REFERENCE_FORBIDDEN', check: validateCrossTreeReferences }]

// ═══════════ 规则函数 ═══════════

/**
 * 森林级不变量：引用目标必须与源图同树。
 *
 * @remarks
 * 判定口径（唯一）：由节点 `sourceGraphId` / `childGraphId` 解析出的目标图 T，与源图 G
 * 各自的根图谱（沿 `parentGraphId` 回溯至 `parentGraphId === undefined` 的最顶祖先）都能
 * 解析出、且相等，才算通过；只要有一边解析不出（祖先缺失 / 目标图不在 registry / 链成环），
 * 即**不判定、不报错**——无法得出可靠结论时不得误报（误报会阻断合法写入）。代价是
 * 「真正指向森林之外的悬空引用」本规则不覆盖，属已知限制（结构完整性成为不变量后该情形才可判定）。
 *
 * 同树内跨子图谱引用是「发散」的核心设计功能，必须继续被允许：只要两边根相同即通过。
 *
 * @param registry - 后置注册表，提供树外数据（根解析）
 * @param graph - 本批作用域内的源图
 * @returns CROSS_TREE_REFERENCE_FORBIDDEN error issues
 */
export function validateCrossTreeReferences(registry: GraphRegistry, graph: GraphData): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    const sourceRootId = resolveRootId(registry, graph.id)

    for (const node of graph.nodes) {
        const targetGraphId = resolveTargetGraphId(node)
        if (targetGraphId === undefined) continue

        const targetRootId = resolveRootId(registry, targetGraphId)

        if (sourceRootId === null || targetRootId === null) continue

        if (sourceRootId !== targetRootId) {
            issues.push({
                severity: 'error',
                code: 'CROSS_TREE_REFERENCE_FORBIDDEN',
                message: `节点 ${node.id} 的引用目标图 ${targetGraphId} 与源图 ${graph.id} 不属于同一棵根图谱树。`,
                // targetType / targetId 固定填源图：肇事对象是源图里那个越树的节点，
                // 但 ValidationTargetType 没有「节点所属图」的表达，故以源图为定位锚点。
                targetType: 'graph',
                targetId: graph.id,
            })
        }
    }

    return issues
}

// ═══════════ 私有辅助 ═══════════

/** 取节点引用到的目标图 id：引用节点取 sourceGraphId，抽象知识节点取 childGraphId。 */
function resolveTargetGraphId(node: NodeData): GraphId | undefined {
    if (node.role === 'reference') {
        return node.sourceGraphId
    }

    return node.childGraphId
}

/**
 * 解析图所属根图谱 id：沿 parentGraphId 回溯至最顶祖先。
 *
 * @returns 最顶祖先的 id；祖先不在 registry（链不可解析）或链成环时返回 null（调用方不判定）。
 */
function resolveRootId(registry: GraphRegistry, startGraphId: GraphId): GraphId | null {
    const visited = new Set<GraphId>()
    let currentId = startGraphId

    while (true) {
        // 成环 = 数据损坏：不判定，交由别的机制暴露
        if (visited.has(currentId)) return null
        visited.add(currentId)

        const graph = registry.get(currentId)
        if (!graph) return null

        if (graph.parentGraphId === undefined) return graph.id

        currentId = graph.parentGraphId
    }
}
