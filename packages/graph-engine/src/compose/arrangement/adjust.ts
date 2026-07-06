/**
 * adjust.ts
 *
 * 功能：
 *
 *     Adjust 操作编排。封装位置草稿生成 + 碰撞判定 + 操作序列组装。
 *     Adjust Distance（连续距离）和 Adjust Orbit（离散层级）两种模式。
 *     前端不直接调 placement 或 collision 原语。
 *
 * 总体结构：
 *
 *     1. adjustDistance — 连续距离调整的唯一入口
 *     2. DraftOrbitPosition — 带 tier/angle 的草稿类型
 *     3. adjustOrbit — 离散层级吸附的唯一入口
 *
 * 规则：
 *
 *     1. 碰撞通过 issues 的 error 级别体现。前端根据 issues 灰/亮确认按钮。
 *     2. 纯函数——不持有状态，不写入 GraphData。
 *     3. 单节点操作，使用 hasCollisionAt（不存在草稿互碰）。
 *
 * 外部如何使用：
 *
 *     import { adjustDistance, adjustOrbit } from '@my-project/graph-engine'
 *
 *     const result = adjustDistance({ nodeId, center, distance, angle, allNodes, nodeRadiusOverrides })
 *     const result = adjustOrbit({ nodeId, center, cursor, D0, tierCount, allNodes, nodeRadiusOverrides })
 */

import type { NodeId, NodePosition, NodeData } from '../../types/graph_data'
import type { NodeRadiusMap } from '../../types/infrastructure_types'
import type { ComposeIssue, ComposeResult, DraftPosition } from '../../types/compose_types'
import { positionOnCircle, snapOrbit } from '../../infrastructure/placement'
import { hasCollisionAt } from '../../infrastructure/collision'

// ═══════════ Adjust Distance ═══════════

/**
 * 功能：
 *
 *     连续距离调整。根据中心节点坐标、目标距离和角度计算草稿位置，
 *     判定碰撞并组装 move_node 操作。
 *
 * 规则：
 *
 *     不改变边方向——仅调整两节点间的距离（沿给定角度）。
 *
 * 参数：
 *
 *     nodeId               — 被移动的节点 ID（动节点）
 *     center               — 不动节点的坐标（参照点）
 *     distance              — 目标距离（圆心到草稿位置的半径）
 *     angle                 — 角度（弧度），从 center 指向草稿位置的方向
 *     allNodes              — 当前 GraphData 节点快照
 *     nodeRadiusOverrides   — 节点半径覆盖表
 */
export function adjustDistance(params: {
    nodeId: NodeId
    center: NodePosition
    distance: number
    angle: number
    allNodes: NodeData[]
    nodeRadiusOverrides: NodeRadiusMap
}): ComposeResult<DraftPosition> {
    const { nodeId, center, distance, angle, allNodes, nodeRadiusOverrides } = params

    const position = positionOnCircle(center, distance, angle)
    const blocked = hasCollisionAt(nodeId, position, allNodes, nodeRadiusOverrides)

    const draft: DraftPosition = { nodeId, position }

    const issues: ComposeIssue[] = blocked
        ? [{
            severity: 'error' as const,
            code: 'ADJUST_DISTANCE_COLLISION',
            message: `节点 ${nodeId} 在目标位置与已有节点碰撞，无法放置。`,
        }]
        : []

    const operations = [{
        type: 'move_node' as const,
        nodeId,
        position,
    }]

    return { drafts: [draft], issues, operations }
}

// ═══════════ Adjust Orbit ═══════════

/**
 * 功能：
 *
 *     带 tier 和 angle 的位置草稿。用于 Adjust Orbit 的前端预览渲染
 *     （展示当前吸附层级和角度）。
 */
export interface DraftOrbitPosition extends DraftPosition {
    tier: number
    angle: number
}

/**
 * 功能：
 *
 *     离散层级吸附调整。根据中心节点坐标和光标位置，调用 snapOrbit
 *     吸附至最近轨道，判定碰撞并组装 move_node 操作。
 *
 * 规则：
 *
 *     1. 角度从光标位置推导，层级吸附至 argmin_n |光标距 - (n+1)·D₀|。
 *     2. 单节点操作——仅调 hasCollisionAt，不涉及草稿互碰。
 *
 * 参数：
 *
 *     nodeId               — 被移动的节点 ID（动节点）
 *     center               — 不动节点的坐标（参照点）
 *     cursor               — 当前光标/鼠标位置
 *     D0                   — 层级间距（由前端或编排层通过 computeTierSpacing 计算）
 *     tierCount            — 候选层级数量（拖拽时按光标可及范围算；手动挡按最大层级+1）
 *     allNodes              — 当前 GraphData 节点快照
 *     nodeRadiusOverrides   — 节点半径覆盖表
 */
export function adjustOrbit(params: {
    nodeId: NodeId
    center: NodePosition
    cursor: NodePosition
    D0: number
    tierCount: number
    allNodes: NodeData[]
    nodeRadiusOverrides: NodeRadiusMap
}): ComposeResult<DraftOrbitPosition> {
    const { nodeId, center, cursor, D0, tierCount, allNodes, nodeRadiusOverrides } = params

    const snapped = snapOrbit(center, cursor, D0, tierCount)
    const blocked = hasCollisionAt(nodeId, snapped.position, allNodes, nodeRadiusOverrides)

    const draft: DraftOrbitPosition = {
        nodeId,
        position: snapped.position,
        tier: snapped.tier,
        angle: snapped.angle,
    }

    const issues: ComposeIssue[] = blocked
        ? [{
            severity: 'error' as const,
            code: 'ADJUST_ORBIT_COLLISION',
            message: `节点 ${nodeId} 在吸附位置（层级 ${snapped.tier}）与已有节点碰撞，无法放置。`,
        }]
        : []

    const operations = [{
        type: 'move_node' as const,
        nodeId,
        position: snapped.position,
    }]

    return { drafts: [draft], issues, operations }
}
