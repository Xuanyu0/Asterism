/**
 * placement.ts
 *
 * 功能：
 *     布局草稿位置计算。全部纯几何计算，不持有状态，不判定碰撞。
 *
 * 总体结构：
 *     1. positionOnCircle    — 给定半径和角度，返回圆上坐标
 *     2. snapOrbit           — 给定中心和光标，吸附至最近层级轨道
 *     3. distributeOnTiers   — 自动挡均分环绕，内部保证不碰撞
 *     4. distributeOnLine     — 沿射线等距排列
 *     5. scatterInCircle     — 圆内随机位置
 *     6. computeTierSpacing  — 层级间距
 *
 * 与 collision.ts 的关系：
 *     - placement.ts 负责"草稿位置应该在哪"（位置生成）
 *     - collision.ts 负责"这个位置能不能放"（碰撞判定）
 *     - 调用方先调 placement 生成候选位置，再调 collision 判定
 *
 * 概念（层级）：
 *     - 层级是离散的轨道半径档位。层级 n 的轨道半径 = (n+1) · D₀。
 *     - D₀ = centerRadius + maxSatelliteRadius + r₀。
 *     - 约束 A（中心 ↔ 层级 0）：由 D₀ 定义保证。
 *     - 约束 B（层级间）：因 centerRadius ≥ maxSatelliteRadius，D₀ 定义自动满足。
 *     - 约束 C（层内）：distributeOnTiers 内部自动扩展 D₀ 至层内弦距 ≥ 2r。
 *     - 层级概念类比 2D 玻尔模型：轨道半径 r ∝ n（等间距），而非 3D 的 r ∝ n²。
 *
 * 外部如何使用：
 *     import {
 *         positionOnCircle, snapOrbit, distributeOnTiers,
 *         distributeOnLine, scatterInCircle, computeTierSpacing,
 *     } from '@my-project/graph-engine'
 */

import { DEFAULT_LAYOUT_RULES } from '../core/rules'
import type { NodeId, NodePosition } from '../types/graph_data'
import { length } from './geometry'

// ═══════════ 常量 ═══════════

/** 基准外接圆半径。层级间距以此为缩放因子，保证层间可容纳一个孤立节点。 */
const R0 = DEFAULT_LAYOUT_RULES.r0

// ═══════════ 公开 API ═══════════

/**
 * 功能：
 *     给定圆心、半径和角度，返回圆上坐标。
 *
 * 规则：
 *     纯几何计算。不判定碰撞。
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
 *     Adjust Orbit 草稿吸附。给定中心和光标位置，同时确定角度和层级，
 *     返回吸附后的轨道位置。
 *
 * 规则：
 *     1. 角度从光标位置直接推导。
 *     2. 层级取最近轨道：tier = argmin_n |distance − (n+1)·D₀|。
 *     3. 不判定碰撞。
 *
 * 使用：
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
 *     层级分配描述。
 *
 * 规则：
 *     1. tier 从 0 开始。tier 0 轨道半径 = D₀，tier 1 = 2·D₀，依此类推。
 *     2. nodeIds 为该层级上的节点集合，每层至少一个节点。
 */
export interface TierAssignment {
    tier: number
    nodeIds: NodeId[]
}

/**
 * 功能：
 *     自动挡层级环绕布局。给定中心、卫星和层级分配，内部计算轨道半径
 *     并均分圆周，保证不碰撞。
 *
 * 规则：
 *     1. D₀ = centerRadius + maxSatelliteRadius + r₀（约束 A + B）。
 *     2. 各层弦距自动满足 ≥ 2r（约束 C）——若不足则扩展 D₀。
 *     3. 层内 N 个节点均分圆周（N = 1 时取 startAngle）。
 *     4. 不判定碰撞（层级间距已保证）。
 *
 * 使用：
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
        tier => tier.nodeIds.map(id => satMap.get(id)?.radius ?? DEFAULT_LAYOUT_RULES.r0),
    )
    const maxSatR = allSatRadii.length > 0 ? Math.max(...allSatRadii) : DEFAULT_LAYOUT_RULES.r0

    // D₀ 基础值（约束 A + B）。层间留 R0 间隙，保证可容纳一个孤立节点。
    let D0 = center.radius + maxSatR + R0

    // 约束 C：各层弦距 >= 同一层最大半径的两倍 + R0
    for (const tier of tiers) {
        const N = tier.nodeIds.length
        if (N <= 1) continue

        const tierRadii = tier.nodeIds.map(id => satMap.get(id)?.radius ?? DEFAULT_LAYOUT_RULES.r0)
        const tierMaxR = Math.max(...tierRadii)
        const orbitRadius = (tier.tier + 1) * D0

        if (2 * orbitRadius * Math.sin(Math.PI / N) < 2 * tierMaxR + R0) {
            const minOrbitRadius = (2 * tierMaxR + R0) / (2 * Math.sin(Math.PI / N))
            D0 = Math.max(D0, minOrbitRadius / (tier.tier + 1))
        }
    }

    const result: { nodeId: NodeId; position: NodePosition }[] = []

    for (const tier of tiers) {
        const N = tier.nodeIds.length
        const orbitRadius = (tier.tier + 1) * D0

        for (let i = 0; i < N; i++) {
            const nodeId = tier.nodeIds[i]
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
 *     沿射线等距排列。给定原点、方向和间距，返回 count 个等距位置。
 *
 * 规则：
 *     1. 第 i 个位置距离原点 = (i+1) · spacing。
 *     2. 纯几何，不判定碰撞。
 *
 * 使用：
 *     Path 布局：axis 为轴心节点左上角，direction 为用户拖拽角度，
 *     spacing 为层级间距，count 为路径节点数。
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

/**
 * 功能：
 *     在圆内随机生成一个位置。
 *
 * 规则：
 *     1. 均匀分布（半径用 √random 避免中心聚集）。
 *     2. 不判定碰撞——调用方循环调用此函数并用 hasCollisionAt 判定。
 *
 * 使用：
 *     内化操作用（单节点找空位），Cloud 布局循环调用。
 */
export function scatterInCircle(center: NodePosition, maxRadius: number): NodePosition {
    const r = maxRadius * Math.sqrt(Math.random())
    const angle = Math.random() * 2 * Math.PI

    return positionOnCircle(center, r, angle)
}

/**
 * 功能：
 *     计算层级间距 D₀。
 *
 * 规则：
 *     D₀ = centerRadius + maxSatelliteRadius + r₀。
 *     satelliteRadii 为空时默认取 r₀。
 *
 * 使用：
 *     Path 布局和手动 Orbit 调用方用此值作为相邻节点 / 层级间距离。
 */
export function computeTierSpacing(
    centerRadius: number,
    satelliteRadii: number[],
): number {
    const maxSatR = satelliteRadii.length > 0
        ? Math.max(...satelliteRadii)
        : DEFAULT_LAYOUT_RULES.r0

    return centerRadius + maxSatR + R0
}
