/**
 * collision.ts
 *
 * 功能：
 *     节点碰撞检测。全部纯几何计算，不持有状态，不引用 DOM。
 *
 * 总体结构：
 *     1. hasCollisionAt — 单点碰撞准入判断（布尔查询）
 *     2. hasCollisionInDrafts — 批量草稿碰撞检测
 *     3. 内部：半径计算、距离计算、几何辅助
 *
 * 规则：
 *     1. 所有节点视为外接圆。正多边形与圆形统一用外接圆半径。
 *     2. 半径以 unitDistance 为基准缩放，公式见设计文档。
 *     3. NodeRadiusMap 为特例覆盖，缺失时按公式计算。
 *
 * 外部如何使用：
 *     import { hasCollisionAt, hasCollisionInDrafts } from '@my-project/graph-engine'
 */

import type { NodeData, NodeId, NodePosition } from '../types/graph_data'
import type { NodeRadiusMap } from '../types/infrastructure_types'
import { DEFAULT_LAYOUT_RULES } from '../core/layout_rules'
import { squaredDistance } from './geometry'

// ═══════════ 常量 ═══════════

/** 基准单位距离。 */
const unitDistance = DEFAULT_LAYOUT_RULES.unitDistance

// ═══════════ 内部：节点辅助 ═══════════

function hasPosition(node: NodeData): node is NodeData & { position: NodePosition } {
    return node.position !== undefined
}

interface CollisionTarget {
    node: NodeData
    radius: number
}

/**
 * 功能：
 *
 *     从 allNodes 中按 nodeId 查找目标节点，组装为 CollisionTarget。
 *     同时计算其外接圆半径（优先取 nodeRadiusOverrides 中的覆盖值，缺失则按公式计算）。
 *
 * 参数：
 *
 *     nodeId               — 目标节点 ID
 *     allNodes             — 待搜索的节点集（含目标节点自身）
 *     nodeRadiusOverrides  — 节点半径覆盖表。缺失项按默认公式计算。
 */
function getTarget(
    nodeId: NodeId,
    allNodes: NodeData[],
    nodeRadiusOverrides: NodeRadiusMap,
): CollisionTarget | undefined {
    const node = allNodes.find(node => node.id === nodeId)
    if (!node) return undefined

    return {
        node,
        radius: getRadius(node, nodeRadiusOverrides),
    }
}

/**
 * 功能：
 *
 *     返回节点的外接圆半径。nodeRadiusOverrides 中有自定义值时优先使用，
 *     否则按默认公式计算。
 *     degree = 0 时半径为 unitDistance，保证孤立节点仍占可视空间。
 */
function getRadius(node: NodeData, nodeRadiusOverrides: NodeRadiusMap): number {
    const custom = nodeRadiusOverrides.get(node.id)

    if (custom !== undefined) return custom

    return unitDistance * Math.sqrt(1 + node.degree)
}

// ═══════════ 公开 API ═══════════


/**
 * 功能：
 *
 *     判断节点放置在目标位置是否会与已有节点发生碰撞。
 *
     *     目标节点可能不在 allNodes 中（新建节点）：此时半径回退为覆盖值或 unitDistance，
 *     但仍正常检测该位置与已有节点的碰撞。
 *
 * 规则：
 *
 *     1. 目标节点自身（nodeId）排除在检测之外。
 *     2. extraExcludedIds 中的节点被额外排除——批量场景下同伴的旧位置不应触发碰撞。
 *     3. 缺失坐标的节点被跳过。
 *     4. 碰撞判定只涉及已有节点（allNodes）。不同草稿之间的互碰由 hasCollisionInDrafts 覆盖。
 *
 * 参数：
 *
 *     nodeId               — 待检测的节点 ID
 *     position             — 待检测的目标位置
 *     allNodes             — 当前图中所有节点（含待检测节点自身，内部自动排除）
 *     nodeRadiusOverrides  — 节点半径覆盖表。键 = 节点 ID，值 = 自定义外接圆半径。
 *                             缺失的节点按默认公式计算
 *     extraExcludedIds     — [可选] 额外排除的节点 ID 集合。用于批量草稿场景
 *                            （hasCollisionInDrafts 传入同伴 ID，排除其旧位置）
 */
export function hasCollisionAt(
    nodeId: NodeId,
    position: NodePosition,
    allNodes: NodeData[],
    nodeRadiusOverrides: NodeRadiusMap,
    extraExcludedIds?: Set<NodeId>,
): boolean {
    const target = getTarget(nodeId, allNodes, nodeRadiusOverrides)

    // 目标节点不在 allNodes 中（新建节点）：无法通过 node 计算半径，
    // 回退为覆盖值或 unitDistance，但仍需检测该位置与已有节点的碰撞。
    const targetRadius = target
        ? target.radius
        : (nodeRadiusOverrides.get(nodeId) ?? unitDistance)

    for (const node of allNodes) {
        if (node.id === nodeId) continue
        if (extraExcludedIds?.has(node.id)) continue
        if (!hasPosition(node)) continue

        const otherRadius = getRadius(node, nodeRadiusOverrides)
        const minDist = targetRadius + otherRadius

        if (squaredDistance(position, node.position) < minDist * minDist) {
            return true
        }
    }

    return false
}

/**
 * 功能：
 *
 *     批量草稿碰撞检测。同时检测两件事：
 *     1. 草稿节点之间的互相碰撞
 *     2. 草稿节点与已有节点之间的碰撞
 *     任一有重叠即返回 true。前端布局确认前调一次即可覆盖全部碰撞风险。
 *
 * 设计意图：
 *
 *     hasCollisionAt 只查单草稿 vs GraphData，不查草稿 vs 草稿。
 *     两个不重叠于已有节点的草稿，可能互碰——hasCollisionAt 对此盲视。
 *     本函数填补此缺口。
 *
 * 规则：
 *
 *     1. 草稿互可见——两两之间以各自外接圆半径判定碰撞。
 *     2. 所有草稿节点 ID 在"草稿 vs 已有节点"检测中集体排除。
 *     3. 不在 allNodes 中的草稿（新建节点），半径回退为 unitDistance。
 *
 * 参数：
 *
 *     drafts               — 草稿列表。每项 { nodeId: 节点 ID, position: 候选位置 }
 *     allNodes             — 当前 GraphData 中的节点快照。草稿节点可能已存在其中
 *                            （持有旧位置，当前被移位），也可能不在其中（当前新建的节点）。
 *     nodeRadiusOverrides  — 节点半径覆盖表。缺失项按默认公式计算。
 */
export function hasCollisionInDrafts(
    drafts: { nodeId: NodeId; position: NodePosition }[],
    allNodes: NodeData[],
    nodeRadiusOverrides: NodeRadiusMap,
): boolean {
    if (drafts.length <= 1 && allNodes.length === 0) return false

    // 组装草稿的半径信息。草稿自身可能不在 allNodes 中（新建节点）：
    // 先查 nodeRadiusOverrides，无覆盖再回退为 unitDistance。
    const draftItems = drafts.map(draft => {
        const existing = allNodes.find(node => node.id === draft.nodeId)
        if (existing) {
            return { draft, radius: getRadius(existing, nodeRadiusOverrides) }
        }
        return { draft, radius: nodeRadiusOverrides.get(draft.nodeId) ?? unitDistance }
    })

    // 草稿 vs 草稿：两两检查
    for (let i = 0; i < draftItems.length; i++) {
        const a = draftItems[i]!
        for (let j = i + 1; j < draftItems.length; j++) {
            const b = draftItems[j]!
            const minDist = a.radius + b.radius
            if (squaredDistance(a.draft.position, b.draft.position) < minDist * minDist) {
                return true
            }
        }
    }

    // 草稿 vs 已有节点：每个草稿单独调 hasCollisionAt。
    // 传入其他草稿的 ID 作为额外排除项——同伴正在被移动，其旧位置不应触发碰撞。
    // 调 hasCollisionAt 而非重新实现循环体，保持碰撞判定公式单一来源。
    const draftIdSet = new Set(drafts.map(d => d.nodeId))

    for (const draft of drafts) {
        const peerIds = new Set(draftIdSet)
        peerIds.delete(draft.nodeId) // 排除当前草稿同伴，但保留自身（hasCollisionAt 自带排除）
        if (hasCollisionAt(draft.nodeId, draft.position, allNodes, nodeRadiusOverrides, peerIds)) {
            return true
        }
    }

    return false
}
