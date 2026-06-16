/**
 * collision.ts
 *
 * 功能：
 *     节点碰撞检测。全部纯几何计算，不持有状态，不引用 DOM。
 *
 * 总体结构：
 *     1. constrainPosition — 拖拽时单点碰撞校正（沿法向推开至表面）
 *     2. hasCollisionAt — 布局草稿准入判断（布尔查询）
 *     3. 内部：半径计算、距离计算、几何辅助
 *
 * 规则：
 *     1. 所有节点视为外接圆。正多边形与圆形统一用外接圆半径。
 *     2. 半径公式：r = r₀ · √(1 + degree)。
 *     3. NodeRadiusMap 为特例覆盖，缺失时按公式计算。
 *     4. 设计原则：本模块不负责具体的移动决策。constrainPosition 仅做单点法向推开，不迭代。
 *
 * 概念：
 *     - 所有非拖拽节点都是刚体，位置固定。
 *
 * 外部如何使用：
 *     import { constrainPosition, hasCollisionAt } from '@my-project/graph-engine'
 */

import type { NodeData, NodeId, NodePosition, NodeRadiusMap } from '../types/graph_data'
import { DEFAULT_LAYOUT_RULES } from '../core/rules'
import { sub, add, scale, normalize, distance, squaredDistance } from './geometry'

// ═══════════ 常量 ═══════════

/** 基准外接圆半径 r₀。 */
const R0 = DEFAULT_LAYOUT_RULES.r0

/** 碰撞间隙。 */
const GAP = DEFAULT_LAYOUT_RULES.collisionGap

// ═══════════ 内部：节点辅助 ═══════════

function hasPosition(node: NodeData): node is NodeData & { position: NodePosition } {
    return node.position !== undefined
}

interface CollisionTarget {
    node: NodeData
    radius: number
}

function getTarget(
    nodeId: NodeId,
    allNodes: NodeData[],
    radiusMap: NodeRadiusMap,
): CollisionTarget | undefined {
    const node = allNodes.find(node => node.id === nodeId)
    if (!node) return undefined

    return {
        node,
        radius: getRadius(node, radiusMap),
    }
}

function* getObstacleNodes(
    nodeId: NodeId,
    allNodes: NodeData[],
): Generator<NodeData & { position: NodePosition }> {
    for (const node of allNodes) {
        if (node.id === nodeId) continue
        if (!hasPosition(node)) continue
        yield node
    }
}

function getRadius(node: NodeData, radiusMap: NodeRadiusMap): number {
    const custom = radiusMap.get(node.id)

    if (custom !== undefined) return custom

    return R0 * Math.sqrt(1 + node.degree)
}

// ═══════════ 公开 API ═══════════


/**
 * 功能：
 *     判断节点放置在目标位置是否会与其他节点发生碰撞。
 *
 * 规则：
 *     1. 自身节点排除在检测之外。
 *     2. 缺失坐标的节点被跳过。
 */
export function hasCollisionAt(
    nodeId: NodeId,
    position: NodePosition,
    allNodes: NodeData[],
    radiusMap: NodeRadiusMap,
): boolean {
    const target = getTarget(nodeId, allNodes, radiusMap)
    if (!target) return false

    for (const other of getObstacleNodes(nodeId, allNodes)) {
        const otherRadius = getRadius(other, radiusMap)
        const minDist = target.radius + otherRadius

        if (squaredDistance(position, other.position) < minDist * minDist) {
            return true
        }
    }

    return false
}

/**
 * 功能：
 *     拖拽时的单点碰撞校正。desired 无重叠则原样返回。
 *     有重叠则沿碰撞法向推至障碍物表面 + GAP。
 *
 * 规则：
 *     1. 仅推开被拖拽节点自身。其他节点不动。
 *     2. 多重阻塞时按节点遍历顺序逐个沿法向推开。
 */
export function constrainPosition(
    nodeId: NodeId,
    desired: NodePosition,
    allNodes: NodeData[],
    radiusMap: NodeRadiusMap,
): { position: NodePosition; adjusted: boolean } {
    const target = getTarget(nodeId, allNodes, radiusMap)
    if (!target) return { position: desired, adjusted: false }

    let adjustedPosition = { x: desired.x, y: desired.y }
    let adjusted = false

    for (const other of getObstacleNodes(nodeId, allNodes)) {
        const otherRadius = getRadius(other, radiusMap)
        const minDist = target.radius + otherRadius

        const d = distance(adjustedPosition, other.position)

        if (d >= minDist) continue

        // 碰撞：沿法向推到表面 + GAP
        const overlap = minDist - d
        const normal = d > 0
            ? normalize(sub(adjustedPosition, other.position))
            : { x: 1, y: 0 }

        adjustedPosition = add(adjustedPosition, scale(normal, overlap + GAP))
        adjusted = true
    }

    return { position: adjustedPosition, adjusted }
}