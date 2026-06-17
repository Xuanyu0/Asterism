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
//
// 已知冗余：hasCollisionAt 内联了排除循环（自身 + extraExcludedIds + 无坐标跳过），
// 与 getObstacleNodes 的排除逻辑（自身 + 无坐标）有重叠但语义不同。
// 不提取共享——hasCollisionAt 需要 extraExcludedIds（Set 形排除），
// constrainPosition 是热路径，无需为此承担 Set 分配开销。

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
 *     nodeRadiusOverrides  — 节点半径覆盖表。缺失项按公式 r = r₀·√(1 + degree) 计算
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
 *     惰性迭代 allNodes，逐个产出有坐标且非自身的节点作为障碍物候选。
 *     不分配中间数组——调用方通过 for-of 逐个消费，提前 break 时后续节点不会被遍历。
 *
 * 语法（供 C++ 背景参考）：
 *
 *     function* — 声明 Generator 函数。调用时返回 Generator 对象，不立即执行函数体。
 *                 C++ 类比：C++20 std::generator。
 *     yield     — 暂停当前函数，把值返回给调用方。调用方下次调 .next() 时从 yield 后继续。
 *                 C++ 类比：co_yield。
 *
 * 参数：
 *
 *     nodeId    — 待排除的节点 ID（自身不参与碰撞检测）
 *     allNodes  — 所有节点（含位置缺失的节点，内部自动跳过）
 */
function* getObstacleNodes(  // Generator：惰性迭代器，C++20 std::generator 等价
    nodeId: NodeId,
    allNodes: NodeData[],
): Generator<NodeData & { position: NodePosition }> {
    for (const node of allNodes) {
        if (node.id === nodeId) continue
        if (!hasPosition(node)) continue
        yield node  // yield：暂停并返回值，C++ co_yield 等价
    }
}

/**
 * 功能：
 *
 *     返回节点的外接圆半径。nodeRadiusOverrides 中有自定义值时优先使用，
 *     否则按默认公式 r = r₀·√(1 + degree) 计算。
 *     degree = 0 时半径为 r₀（√1 = 1），保证孤立节点仍占可视空间。
 */
function getRadius(node: NodeData, nodeRadiusOverrides: NodeRadiusMap): number {
    const custom = nodeRadiusOverrides.get(node.id)

    if (custom !== undefined) return custom

    return R0 * Math.sqrt(1 + node.degree)  // √(1+d)：degree=0 时 r = r₀，不为 0
}

// ═══════════ 公开 API ═══════════


/**
 * 功能：
 *
 *     判断节点放置在目标位置是否会与已有节点发生碰撞。
 *
 *     目标节点可能不在 allNodes 中（新建节点）：此时半径回退为覆盖值或 R0，
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
 *                             缺失的节点按公式 r = r₀·√(1 + degree) 计算
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
    // 回退为覆盖值或 R0，但仍需检测该位置与已有节点的碰撞。
    const targetRadius = target
        ? target.radius
        : (nodeRadiusOverrides.get(nodeId) ?? R0)

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
 *     拖拽时的单点碰撞校正。若 desiredPosition 无重叠则原样返回。
 *     有重叠则沿碰撞法向推至障碍物表面 + 碰撞间隙。
 *
 * 规则：
 * 
 *     1. 仅推开被拖拽节点自身。其他节点不动。
 *     2. 多重阻塞时按节点遍历顺序逐个沿法向推开。
 *
 * 参数：
 * 
 *     nodeId               — 被拖拽的节点 ID
 *     desiredPosition      — 该节点被拖拽到的期望位置
 *     allNodes             — 当前图中所有节点（含被拖拽节点自身，内部自动排除）
 *     nodeRadiusOverrides  — 节点半径覆盖表。键 = 节点 ID，值 = 自定义外接圆半径。
 *                             缺失的节点按公式 r = r₀·√(1 + degree) 计算
 */
export function constrainPosition(
    nodeId: NodeId,
    desiredPosition: NodePosition,
    allNodes: NodeData[],
    nodeRadiusOverrides: NodeRadiusMap,
): { position: NodePosition; adjusted: boolean } {
    const target = getTarget(nodeId, allNodes, nodeRadiusOverrides)
    if (!target) return { position: desiredPosition, adjusted: false }

    let adjustedPosition = { x: desiredPosition.x, y: desiredPosition.y }
    let adjusted = false

    for (const other of getObstacleNodes(nodeId, allNodes)) {
        const otherRadius = getRadius(other, nodeRadiusOverrides)
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
 *     3. 不在 allNodes 中的草稿（新建节点），半径回退为 r₀。
 *
 * 参数：
 *
 *     drafts               — 草稿列表。每项 { nodeId: 节点 ID, position: 候选位置 }
 *     allNodes             — 当前 GraphData 中的节点快照。草稿节点可能已存在其中
 *                            （持有旧位置，当前被移位），也可能不在其中（当前新建的节点）。
 *     nodeRadiusOverrides  — 节点半径覆盖表。缺失项按公式 r = r₀·√(1 + degree) 计算
 */
export function hasCollisionInDrafts(
    drafts: { nodeId: NodeId; position: NodePosition }[],
    allNodes: NodeData[],
    nodeRadiusOverrides: NodeRadiusMap,
): boolean {
    if (drafts.length <= 1 && allNodes.length === 0) return false

    // 组装草稿的半径信息。草稿自身可能不在 allNodes 中（新建节点）：
    // 先查 nodeRadiusOverrides，无覆盖再回退为 R0。
    const draftItems = drafts.map(draft => {
        const existing = allNodes.find(node => node.id === draft.nodeId)
        if (existing) {
            return { draft, radius: getRadius(existing, nodeRadiusOverrides) }
        }
        return { draft, radius: nodeRadiusOverrides.get(draft.nodeId) ?? R0 }
    })

    // 草稿 vs 草稿：两两检查
    for (let i = 0; i < draftItems.length; i++) {
        const a = draftItems[i]
        for (let j = i + 1; j < draftItems.length; j++) {
            const b = draftItems[j]
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
