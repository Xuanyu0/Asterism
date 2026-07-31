/**
 * 功能：
 *
 *     GraphData 逻辑属性 → 视觉渲染属性的纯计算函数。
 *
 *     输入 degree / distance / unitDistance，输出节点直径、字号、边宽。
 *     公式见 docs/设计/ 相关文档。
 */

import { DEFAULT_LAYOUT_RULES } from '@my-project/graph-engine'
import type { NodeId, NodePosition } from '@my-project/graph-engine'


/**
 * 功能：
 *
 *     计算节点渲染直径。
 */
export function computeNodeDiameter(degree: number): number {
    const scale = Math.sqrt(1 + degree)
    return Math.round(2 * DEFAULT_LAYOUT_RULES.unitDistance * scale)
}

/**
 * 功能：
 *
 *     计算节点推荐字号。
 */
export function computeFontSize(degree: number): number {
    const scale = Math.sqrt(1 + degree)
    return Math.round((DEFAULT_LAYOUT_RULES.unitDistance / 4) * scale)
}

/**
 * 功能：
 *
 *     计算边渲染宽度。
 */
export function computeEdgeWidth(
    srcMass: number,
    tgtMass: number,
    dist: number,
): number {
    const k = 4 * DEFAULT_LAYOUT_RULES.unitDistance
    if (dist <= 0) return 2
    const edgeWidth = Math.round(k * srcMass * tgtMass / dist)
    return Math.max(1, Math.min(8, edgeWidth))
}

/**
 * 功能：
 *
 *     构建节点质量查找表，供 computeEdgeWidth 调用。
 *     mass = 1 + degree。
 */
export function buildNodeMassLookup(
    nodes: { id: NodeId; degree: number; position?: NodePosition }[],
): Map<NodeId, { mass: number; position?: NodePosition }> {
    const lookup = new Map<NodeId, { mass: number; position?: NodePosition }>()
    for (const node of nodes) {
        lookup.set(node.id, {
            mass: 1 + node.degree,
            position: node.position,
        })
    }
    return lookup
}

/**
 * 功能：
 *
 *     计算两端节点之间的欧几里得距离。任一节点无 position 时返回 0。
 */
export function calcEdgeDistance(
    src: { position?: NodePosition } | undefined,
    tgt: { position?: NodePosition } | undefined,
): number {
    if (!src?.position || !tgt?.position) return 0
    const dx = tgt.position.x - src.position.x
    const dy = tgt.position.y - src.position.y
    return Math.sqrt(dx * dx + dy * dy)
}
