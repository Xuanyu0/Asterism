/**
 * placement.ts
 *
 * 功能：
 *
 *     布局草稿位置计算。全部纯几何计算，不持有状态，不判定碰撞。
 *
 * 总体结构：
 *
 *     1. positionOnCircle    — 给定半径和角度，返回圆上坐标
 *     2. snapOrbit           — 给定中心和光标，吸附至最近层级轨道
 *     3. distributeOnTiers   — 自动挡均分环绕，内部保证不碰撞
 *     4. distributeOnLine    — 沿射线等距排列
 *     5. scatterInCircle     — 圆内随机位置
 *     6. computeTierSpacing  — 层级间距
 *
 * 与 collision.ts 的关系：
 *
 *     - placement.ts 负责"草稿位置应该在哪"（位置生成）
 *     - collision.ts 负责"这个位置能不能放"（碰撞判定）
 *     - 调用方先调 placement 生成候选位置，再调 collision 判定
 *
 * 概念（层级）：
 *
 *     - 层级是离散的轨道半径档位。层级 n 的轨道半径 = (n+1) · D₀。
 *     - D₀ = centerRadius + maxSatelliteRadius + unitDistance。
 *     - 约束 A（中心 ↔ 层级 0）：由 D₀ 定义保证。
 *     - 约束 B（层级间）：因 centerRadius ≥ maxSatelliteRadius，D₀ 定义自动满足。
 *     - 约束 C（层内）：distributeOnTiers 内部自动扩展 D₀ 至层内弦距 ≥ 2r。
 *     - 层级概念类比 2D 玻尔模型：轨道半径 r ∝ n（等间距），而非 3D 的 r ∝ n²。
 *
 * 外部如何使用：
 *
 *     import {
 *         positionOnCircle, snapOrbit, distributeOnTiers,
 *         distributeOnLine, scatterInCircle, computeTierSpacing,
 *     } from '@my-project/graph-engine'
 */

import { DEFAULT_LAYOUT_RULES } from '../core/layout_rules'
import type { NodeId, NodePosition } from '../types/graph_data'
import { length } from './geometry'

// ═══════════ 常量 ═══════════

/** 基准单位距离。层级间距以此为缩放因子，保证层间可容纳一个孤立节点。 */
const unitDistance = DEFAULT_LAYOUT_RULES.unitDistance

// ═══════════ 公开 API ═══════════

/**
 * 功能：
 *
 *     层级分配描述。tier 从 0 开始——tier 0 轨道半径 = D₀，tier 1 = 2·D₀，依此类推。
 *     nodeIds 为该层级上的节点 ID 集合，每层至少一个节点。
 */
export interface TierAssignment {
    tier: number
    nodeIds: NodeId[]
}


/**
 * 功能：
 *
 *     给定圆心、半径和角度，返回圆上坐标。
 *
 * 规则：
 *
 *     纯几何计算。不判定碰撞。
 *
 * 参数：
 *
 *     center — 圆心坐标
 *     radius — 轨道半径（到圆心的距离）
 *     angle  — 弧度角，x 轴正方向为 0，逆时针为正
 */
export function positionOnCircle(
    center: NodePosition,
    radius: number,
    angle: number,
): NodePosition {
    return {
        x: center.x + radius * Math.cos(angle),
        y: center.y + radius * Math.sin(angle),
    }
}

/**
 * 功能：
 *
 *     计算层级间距 D₀。
 *
 * 规则：
 *
 *     D₀ = centerRadius + maxSatelliteRadius + unitDistance。
 *     satelliteRadii 为空时默认取 unitDistance。
 *
 * 参数：
 *
 *     centerRadius   — 中心节点的外接圆半径
 *     satelliteRadii — 所有卫星节点的外接圆半径列表。为空时 maxSatelliteRadius 默认为 unitDistance
 *
 * 使用：
 *
 *     Path 布局和手动 Orbit 调用方用此值作为相邻节点 / 层级间距离。
 */
export function computeTierSpacing(
    centerRadius: number,
    satelliteRadii: number[],
): number {
    const maxSatR = satelliteRadii.length > 0
        ? Math.max(...satelliteRadii)
        : DEFAULT_LAYOUT_RULES.unitDistance

    return centerRadius + maxSatR + unitDistance
}

/**
 * 功能：
 *
 *     在圆内随机生成一个位置。
 *
 * 规则：
 *
 *     1. 均匀分布（半径用 √random 避免中心聚集）。
 *     2. 不判定碰撞——调用方循环调用此函数并用 hasCollisionAt 判定。
 *     3. 非确定性：每次调用使用 Math.random()，同一输入返回不同位置。
 *        这是设计意图——自动找空位失败时靠重试随机偏移。测试可 mock Math.random。
 *
 * 参数：
 *
 *     center    — 圆心的坐标
 *     maxRadius — 圆的半径。生成位置保证在圆内（含边界）
 *
 * 使用：
 *
 *     内化操作用（单节点找空位），Cloud 布局循环调用。
 */
export function scatterInCircle(center: NodePosition, maxRadius: number): NodePosition {
    const r = maxRadius * Math.sqrt(Math.random())
    const angle = Math.random() * 2 * Math.PI

    return positionOnCircle(center, r, angle)
}


/**
 * 功能：
 *
 *     Adjust Orbit 草稿吸附。给定中心和光标位置，同时确定角度和层级，
 *     返回吸附后的轨道位置。
 *
 * 规则：
 *
 *     1. 角度从光标位置直接推导。
 *     2. 层级取最近轨道：tier = argmin_n |distance − (n+1)·D₀|。
 *     3. 不判定碰撞。
 *
 * 参数：
 *
 *     center    — 中心节点坐标
 *     cursor    — 当前光标/鼠标位置
 *     D0        — 层级间距（由 computeTierSpacing 计算）
 *     tierCount — 候选层级数量（调用方根据场景提供：拖拽时按光标可及范围算；手动挡按用户分配的最大层级 + 1）
 *
 * 使用：
 *
 *     UI 每帧调此函数，将鼠标实时吸附到离散层级轨道上。
 */
export function snapOrbit(
    center: NodePosition,
    cursor: NodePosition,
    D0: number,
    tierCount: number,
): { position: NodePosition; tier: number; angle: number } {
    const dx = cursor.x - center.x
    const dy = cursor.y - center.y
    const dist = length({ x: dx, y: dy })
    const angle = Math.atan2(dy, dx)

    let bestTier = 0
    let bestGap = Infinity

    for (let n = 0; n < tierCount; n++) {
        const orbitRadius = (n + 1) * D0
        const gapN = Math.abs(dist - orbitRadius)

        if (gapN < bestGap) {
            bestGap = gapN
            bestTier = n
        }
    }

    return {
        position: positionOnCircle(center, (bestTier + 1) * D0, angle),
        tier: bestTier,
        angle,
    }
}


/**
 * 功能：
 *
 *     自动挡层级环绕布局。给定中心、卫星和层级分配，内部计算轨道半径
 *     并均分圆周，保证不碰撞。
 *
 *     每次调用从零计算——此函数不记录历史。事后添加更大节点并重新调用会导致
 *     D₀ 变大、所有层级外移、全部卫星位置改变。这是设计意图而非 bug：
 *     Orbit 是一次性布局操作，不是持续绑定的约束系统。
 *
 * 规则：
 *
 *     1. D₀ = centerRadius + maxSatelliteRadius + unitDistance（约束 A + B）。
 *     2. 各层弦距自动满足 ≥ 2·tierMaxRadius + unitDistance（约束 C）——若不足则扩展 D₀。
 *     3. 层内 N 个节点均分圆周（N = 1 时取 startAngle）。
 *     4. 不判定碰撞（层级间距已保证）。
 *
 * 参数：
 *
 *     center      — 中心节点。id / position / radius。虚中心时 radius = 0
 *     satellites  — 卫星节点列表。仅需 id 和 radius，位置由函数计算
 *     tiers       — 层级分配。每个 tier 包含该层上的节点 ID 列表
 *     startAngle  — 起始角度（弧度），默认 0。用于手动指定第一个卫星的朝向
 *
 * 使用：
 *
 *     归纳操作用：centerRadius = 0（虚中心），沟通节点作为卫星均匀环绕。
 */
export function distributeOnTiers(
    center: { id: NodeId; position: NodePosition; radius: number },
    satellites: { id: NodeId; radius: number }[],
    tiers: TierAssignment[],
    startAngle = 0,
): { nodeId: NodeId; position: NodePosition }[] {
    const satMap = new Map(satellites.map(satellite => [satellite.id, satellite]))

    const allSatRadii = tiers.flatMap(
        tier => tier.nodeIds.map(id => satMap.get(id)?.radius ?? DEFAULT_LAYOUT_RULES.unitDistance),
    )
    const maxSatR = allSatRadii.length > 0 ? Math.max(...allSatRadii) : DEFAULT_LAYOUT_RULES.unitDistance

    // D₀ 基础值（约束 A + B）。层间留 unitDistance 间隙，保证可容纳一个孤立节点。
    let D0 = center.radius + maxSatR + unitDistance

    // 约束 C：各层弦距 >= 同一层最大半径的两倍 + unitDistance
    for (const tier of tiers) {
        const N = tier.nodeIds.length
        if (N <= 1) continue

        const tierRadii = tier.nodeIds.map(id => satMap.get(id)?.radius ?? DEFAULT_LAYOUT_RULES.unitDistance)
        const tierMaxR = Math.max(...tierRadii)
        const orbitRadius = (tier.tier + 1) * D0

        if (2 * orbitRadius * Math.sin(Math.PI / N) < 2 * tierMaxR + unitDistance) {
            const minOrbitRadius = (2 * tierMaxR + unitDistance) / (2 * Math.sin(Math.PI / N))
            D0 = Math.max(D0, minOrbitRadius / (tier.tier + 1))
        }
    }

    const result: { nodeId: NodeId; position: NodePosition }[] = []

    for (const tier of tiers) {
        const N = tier.nodeIds.length
        const orbitRadius = (tier.tier + 1) * D0

        for (let i = 0; i < N; i++) {
            const nodeId = tier.nodeIds[i]!
            const angle = N === 1 ? startAngle : startAngle + (2 * Math.PI * i) / N

            result.push({
                nodeId,
                position: positionOnCircle(center.position, orbitRadius, angle),
            })
        }
    }

    return result
}

/**
 * 功能：
 *
 *     沿射线等距排列。给定原点、方向和间距，返回 count 个等距位置。
 *
 * 规则：
 *
 *     1. 第 i 个位置距离原点 = (i+1) · spacing。
 *     2. 纯几何，不判定碰撞。
 *
 * 参数：
 *
 *     origin    — 射线起点坐标（轴心节点位置）
 *     direction — 射线方向角（弧度），x 轴正方向为 0，逆时针为正
 *     count     — 路径上的节点数
 *     spacing   — 相邻节点间距（通常用 computeTierSpacing 计算结果）
 *
 * 使用：
 *
 *     Path 布局：direction 为用户拖拽角度，spacing 为层级间距，count 为路径节点数。
 */
export function distributeOnLine(
    origin: NodePosition,
    direction: number,
    count: number,
    spacing: number,
): NodePosition[] {
    const result: NodePosition[] = []

    for (let i = 0; i < count; i++) {
        result.push(positionOnCircle(origin, (i + 1) * spacing, direction))
    }

    return result
}



