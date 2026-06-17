/**
 * orbit.ts
 *
 * 功能：
 *
 *     环绕布局编排。将所选卫星节点围绕中心节点按层级分布。
 *     引擎封装 placement + collision + 边类型校验，前端不直接调原语。
 *
 * 总体结构：
 *
 *     1. orbit — 环绕布局的唯一入口
 *
 * 规则：
 *
 *     1. 参与节点必须通过实边（有向或无向）与中心节点连接，禁止虚边。
 *        校验失败 → issues 含 error。
 *     2. 内部调 distributeOnTiers（位置计算）+ hasCollisionInDrafts（批量碰撞）。
 *     3. 纯函数——不持有状态，不写入 GraphData。
 *
 * 外部如何使用：
 *
 *     import { orbit } from '@my-project/graph-engine'
 *
 *     const result = orbit({
 *         center: { id, position, radius },
 *         satellites: [{ id, radius }, ...],
 *         tiers: [{ tier: 0, nodeIds: ['b', 'c'] }],
 *         allNodes, allEdges, nodeRadiusOverrides,
 *     })
 */

import type { EdgeData, NodeData, NodeId, NodePosition, NodeRadiusMap } from '../../types/graph_data'
import type { ComposeResult, DraftPosition } from '../types'
import type { TierAssignment } from '../../infrastructure/placement'
import { distributeOnTiers } from '../../infrastructure/placement'
import { hasCollisionInDrafts } from '../../infrastructure/collision'

// ═══════════ 参数类型 ═══════════

/**
 * 功能：
 *
 *     环绕布局输入参数。
 *
 * 规则：
 *
 *     satellites 仅需 id 和 radius——位置由引擎计算。
 *     tiers 由调用方管理（前端 UI 或自动分配逻辑），引擎不负责层级分配策略。
 */
export interface OrbitParams {
    /** 中心节点。 */
    center: { id: NodeId; position: NodePosition; radius: number }

    /** 卫星节点列表。仅需 id 和 radius，位置由引擎计算。 */
    satellites: { id: NodeId; radius: number }[]

    /** 层级分配。哪个节点在哪层。调用方负责分配策略（如初始均分到 tier 0）。 */
    tiers: TierAssignment[]

    /** 起始角度（弧度），默认 0。 */
    startAngle?: number

    /** 当前 GraphData 节点快照。 */
    allNodes: NodeData[]

    /** 当前 GraphData 边快照。用于校验卫星与中心之间是否存在实边。 */
    allEdges: EdgeData[]

    /** 节点半径覆盖表。 */
    nodeRadiusOverrides: NodeRadiusMap
}

// ═══════════ orbit ═══════════

/**
 * 功能：
 *
 *     环绕布局。将卫星节点按层级分配分布到中心节点周围。
 *
 * 规则：
 *
 *     1. 边校验：每个卫星必须通过实边（有向或无向）与中心节点连接。
 *        虚边或无边 → issue error。
 *     2. 位置计算：调 distributeOnTiers 均分圆周。层级间距 D₀ 由 distributeOnTiers
 *        内部根据 centerRadius + maxSatelliteRadius + r₀ 计算。
 *     3. 碰撞检测：调 hasCollisionInDrafts，同时检查草稿互碰和草稿 vs 已有节点。
 *     4. 不在 tiers 中的卫星 → issue error（"未被分配层级"）。
 *
 * 参数：
 *
 *     见 OrbitParams。
 */
export function orbit(params: OrbitParams): ComposeResult<DraftPosition> {
    const {
        center,
        satellites,
        tiers,
        startAngle = 0,
        allNodes,
        allEdges,
        nodeRadiusOverrides,
    } = params

    const issues: { message: string; severity: 'error' | 'warning' }[] = []

    // ── 校验：每个卫星必须通过实边连接中心 ──
    for (const satellite of satellites) {
        const hasRealEdge = allEdges.some(
            edge =>
                edge.kind === 'real' &&
                ((edge.source === center.id && edge.target === satellite.id) ||
                 (edge.source === satellite.id && edge.target === center.id)),
        )

        if (!hasRealEdge) {
            issues.push({
                message: `节点 ${satellite.id} 与中心节点 ${center.id} 之间不存在实边，不能参与环绕布局。`,
                severity: 'error',
            })
        }
    }

    // ── 校验：tiers 覆盖了所有卫星 ──
    const assignedIds = new Set(tiers.flatMap(t => t.nodeIds))
    for (const satellite of satellites) {
        if (!assignedIds.has(satellite.id)) {
            issues.push({
                message: `节点 ${satellite.id} 未被分配到任何层级。`,
                severity: 'error',
            })
        }
    }

    // ── 位置计算 ──
    const drafts: DraftPosition[] = distributeOnTiers(center, satellites, tiers, startAngle)

    // ── 碰撞检测 ──
    const blocked = hasCollisionInDrafts(drafts, allNodes, nodeRadiusOverrides)

    if (blocked) {
        issues.push({
            message: '部分卫星草稿位置与已有节点碰撞，无法放置。',
            severity: 'error',
        })
    }

    // ── 组装 operations ──
    const operations = drafts.map(draft => ({
        type: 'move_node' as const,
        nodeId: draft.nodeId,
        position: draft.position,
    }))

    return { drafts, issues, operations }
}
