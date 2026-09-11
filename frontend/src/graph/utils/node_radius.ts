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
 *     半径公式由引擎 computeNodeRadius 单一维护，本模块只负责遍历节点生成覆盖表。
 */

import type { GraphData, NodeRadiusMap } from '@my-project/graph-engine'

import { computeNodeRadius, DEFAULT_LAYOUT_PARAMETERS } from '@my-project/graph-engine'

/**
 * 功能：
 *     计算当前图全部节点的外接圆半径覆盖表。
 *
 * 规则：
 *     半径值委托引擎 computeNodeRadius 计算，公式单源维护。
 *
 * 参数：
 *     graphView — 当前图的 GraphData 实例。
 */
export function computeNodeRadiusOverrides(graphView: GraphData): NodeRadiusMap {
    const overrides: NodeRadiusMap = new Map()

    for (const node of graphView.nodes) {
        overrides.set(node.id, computeNodeRadius(node.degree, DEFAULT_LAYOUT_PARAMETERS.unitDistance))
    }

    return overrides
}
