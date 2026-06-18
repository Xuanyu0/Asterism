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
 *     2. 内部调 computeTierSpacing（层级间距）+ snapOrbit（逐节点吸附）+ hasCollisionInDrafts（碰撞检测）。
 *     3. 纯函数——不持有状态，不写入 GraphData。
 *
 * 外部如何使用：
 *
 *     import { orbit } from '@my-project/graph-engine'
 *
 *     const result = orbit({
 *         center: { id, position, radius },
 *         satellites: [{ id, radius }, ...],
 *         tierCount: 3,
 *         allNodes, allEdges, nodeRadiusOverrides,
 *     })
 */

import type { EdgeData, NodeData, NodeId, NodePosition, NodeRadiusMap } from '../../types/graph_data'
import type { ComposeIssue, ComposeResult, DraftPosition } from '../types'
import { computeTierSpacing, snapOrbit } from '../../infrastructure/placement'
import { hasCollisionInDrafts } from '../../infrastructure/collision'

// ═══════════ 参数类型 ═══════════

/**
 * 功能：
 *
 *     环绕布局输入参数。
 *
 * 规则：
 *
 *     satellites 仅需 id 和 radius——当前位置从 allNodes 读取，吸附后位置由引擎计算。
 *     tierCount 控制可选层级数量，引擎根据距离自动分配层级。
 */
export interface OrbitParams {
    /** 中心节点。 */
    center: { id: NodeId; position: NodePosition; radius: number }

    /** 卫星节点列表。仅需 id 和 radius，当前位置从 allNodes 读取，吸附后位置由引擎计算。 */
    satellites: { id: NodeId; radius: number }[]

    /** 候选层级数量。每个卫星根据当前位置吸附到最近层级。 */
    tierCount: number

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
 *     2. 位置计算：调 computeTierSpacing 计算层级间距 D₀，
 *        再对每个卫星调 snapOrbit 吸附至最近层级轨道，保留当前角度。
 *     3. 碰撞检测：调 hasCollisionInDrafts，同时检查草稿互碰和草稿 vs 已有节点。
 *
 * 参数：
 *
 *     见 OrbitParams。
 */
export function orbit(params: OrbitParams): ComposeResult<DraftPosition> {
    const {
        center,
        satellites,
        tierCount,
        allNodes,
        allEdges,
        nodeRadiusOverrides,
    } = params

    const issues: ComposeIssue[] = []

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

    // ── D₀ 计算 ──
    const D0 = computeTierSpacing(center.radius, satellites.map(satellite => satellite.radius))

    // ── 位置计算：逐节点吸附至最近层级轨道，保留当前角度 ──
    const nodePosMap = new Map(allNodes.map(node => [node.id, node.position]))
    const drafts: DraftPosition[] = []

    for (const satellite of satellites) {
        const currentPos = nodePosMap.get(satellite.id)
        if (!currentPos) {
            issues.push({
                message: `节点 ${satellite.id} 在当前图谱中不存在。`,
                severity: 'error',
            })
            continue
        }
        const snapped = snapOrbit(center.position, currentPos, D0, tierCount)
        drafts.push({ nodeId: satellite.id, position: snapped.position })
    }

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
