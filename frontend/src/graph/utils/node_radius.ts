/**
 * graph/utils/node_radius.ts
 *
 * 功能：
 *
 *     计算当前图全部节点的外接圆半径覆盖表。
 *     抽离为共享模块，消除 move_node.ts / operation_controller.ts 间的重复实现。
 *
 * 总体结构：
 *
 *     1. computeNodeRadiusOverrides()
 *
 * 规则：
 *
 *     半径公式以 unitDistance 为基准缩放，公式见设计文档。
 */

import type { GraphData, NodeRadiusMap } from '@my-project/graph-engine'
import { DEFAULT_LAYOUT_RULES } from '@my-project/graph-engine'


/**
 * 功能：
 *     计算当前图全部节点的外接圆半径覆盖表。
 *
 * 规则：
 *     半径公式以 unitDistance 为基准缩放，公式见设计文档。
 *
 * 参数：
 *     graphView — 当前图的 GraphData 实例。
 */
export function computeNodeRadiusOverrides(graphView: GraphData): NodeRadiusMap {
    const overrides: NodeRadiusMap = new Map()

    for (const node of graphView.nodes) {
        overrides.set(
            node.id,
            DEFAULT_LAYOUT_RULES.unitDistance * Math.sqrt(1 + node.degree),
        )
    }

    return overrides
}
