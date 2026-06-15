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
 *     2. 半径公式：r = r₀ · √(1 + degree)，上限 r_max。
 *     3. 虚节点不参与碰撞检测（r₀ 固定，不被阻挡也不阻挡他人）。
 *     4. NodeRadiusMap 为特例覆盖，缺失时按公式计算。
 *     5. 本模块不绕、不解绕。constrainPosition 仅做单点法向推开，不迭代。
 *
 * 概念：
 *     - 实体化（Move 操作拖拽时）：有碰撞体积。前端每帧调 constrainPosition，
 *       引擎返回沿障碍物表面推开后的合法位置，前端渲染到该位置，视觉上
 *       "贴着表面滑动"。其他节点不动——仅被拖拽节点被推。
 *     - 虚化（Arrangement 布局时）：无碰撞体积。布局前先展示草稿预览，前端
 *       对草稿中每个目标位置调 hasCollisionAt。任何碰撞则确认按钮不可用，
 *       用户需手动腾出空间后重试。
 *     - 所有非拖拽节点都是刚体，位置固定。
 *
 * 外部如何使用：
 *     import { constrainPosition, hasCollisionAt } from '@my-project/graph-engine'
 */

import type { NodeData, NodeId, NodePosition, NodeRadiusMap } from '../types/graph_data'
import { DEFAULT_GRAPH_RULES } from '../core/checkers/rules'

// ═══════════ 常量 ═══════════

/** 基准外接圆半径 r₀。 */
const R0 = DEFAULT_GRAPH_RULES.r0

/** 半径上限 r_max。 */
const R_MAX = DEFAULT_GRAPH_RULES.rMax

/** 最小间隙，防止节点恰好接触。 */
const EPSILON = 2

// ═══════════ 内部：几何 ═══════════

function sub(a: NodePosition, b: NodePosition): NodePosition {
    return { x: a.x - b.x, y: a.y - b.y }
}

function add(a: NodePosition, b: NodePosition): NodePosition {
    return { x: a.x + b.x, y: a.y + b.y }
}

function scale(v: NodePosition, s: number): NodePosition {
    return { x: v.x * s, y: v.y * s }
}

function length(v: NodePosition): number {
    return Math.sqrt(v.x * v.x + v.y * v.y)
}

function normalize(v: NodePosition): NodePosition {
    const len = length(v)

    if (len < 1e-8) return { x: 1, y: 0 }

    return { x: v.x / len, y: v.y / len }
}

function distance(a: NodePosition, b: NodePosition): number {
    return length(sub(a, b))
}

// ═══════════ 内部：节点辅助 ═══════════

function isVirtual(node: NodeData): boolean {
    return node.role === 'knowledge' && node.kind === 'virtual'
}

function hasPosition(node: NodeData): node is NodeData & { position: NodePosition } {
    return node.position !== undefined
}

function getRadius(node: NodeData, radiusMap: NodeRadiusMap): number {
    const custom = radiusMap.get(node.id)

    if (custom !== undefined) return custom

    if (isVirtual(node)) return R0

    return Math.min(R_MAX, R0 * Math.sqrt(1 + node.degree))
}

// ═══════════ 公开 API ═══════════

/**
 * 功能：
 *     拖拽时的单点碰撞校正。desired 无重叠则原样返回。
 *     有重叠则沿碰撞法向推至障碍物表面 + ε。
 *
 * 规则：
 *     1. 仅推开被拖拽节点自身。其他节点不动。
 *     2. 多重阻塞时沿叠加法向合成推开。
 *     3. 虚节点不参与检测，不被阻挡也不阻挡他人。
 */
export function constrainPosition(
    nodeId: NodeId,
    desired: NodePosition,
    allNodes: NodeData[],
    radiusMap: NodeRadiusMap,
): { position: NodePosition; adjusted: boolean } {
    const targetNode = allNodes.find(node => node.id === nodeId)

    if (!targetNode) return { position: desired, adjusted: false }

    const targetRadius = getRadius(targetNode, radiusMap)
    let adjustedPosition = { x: desired.x, y: desired.y }
    let adjusted = false

    for (const other of allNodes) {
        if (other.id === nodeId) continue
        if (isVirtual(other)) continue
        if (!hasPosition(other)) continue

        const otherRadius = getRadius(other, radiusMap)
        const minDist = targetRadius + otherRadius

        const d = distance(adjustedPosition, other.position)

        if (d >= minDist) continue

        // 碰撞：沿法向推到表面 + ε
        const overlap = minDist - d
        const normal = d > 0
            ? normalize(sub(adjustedPosition, other.position))
            : { x: 1, y: 0 }

        adjustedPosition = add(adjustedPosition, scale(normal, overlap + EPSILON))
        adjusted = true
    }

    return { position: adjustedPosition, adjusted }
}

/**
 * 功能：
 *     判断节点放置在目标位置是否会与其他节点发生碰撞。
 *
 * 规则：
 *     1. 虚节点不参与检测。
 *     2. 自身节点排除在检测之外。
 *     3. 缺失坐标的节点被跳过。
 */
export function hasCollisionAt(
    nodeId: NodeId,
    position: NodePosition,
    allNodes: NodeData[],
    radiusMap: NodeRadiusMap,
): boolean {
    const targetNode = allNodes.find(node => node.id === nodeId)
    if (!targetNode) return false

    const targetRadius = getRadius(targetNode, radiusMap)

    for (const other of allNodes) {
        if (other.id === nodeId) continue
        if (isVirtual(other)) continue
        if (!hasPosition(other)) continue

        const otherRadius = getRadius(other, radiusMap)
        const minDist = targetRadius + otherRadius

        if (distance(position, other.position) < minDist) {
            return true
        }
    }

    return false
}
