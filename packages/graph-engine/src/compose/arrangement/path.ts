/**
 * path.ts
 *
 * 功能：
 *
 *     路径布局编排。将路径节点沿射线等距排列。
 *     引擎封装 placement + collision + 边类型校验，前端不直接调原语。
 *
 * 总体结构：
 *
 *     1. pathLayout — 路径布局的唯一入口
 *
 * 规则：
 *
 *     1. 参与节点必须通过有向实边与轴心节点连接。无向边或虚边 → issue error。
 *     2. 内部调 distributeOnLine（位置计算）+ hasCollisionInDrafts（批量碰撞）。
 *     3. 纯函数——不持有状态，不写入 GraphData。
 *
 * 外部如何使用：
 *
 *     import { pathLayout } from '@my-project/graph-engine'
 *
 *     const result = pathLayout({
 *         axis: { id, position },
 *         pathNodes: [{ id, radius }, ...],
 *         direction, spacing,
 *         allNodes, allEdges, nodeRadiusOverrides,
 *     })
 */

import type {
    EdgeData,
    NodeData,
    NodeId,
    NodePosition,
} from '../../types/graph_data'
import type { NodeRadiusMap } from '../../types/infrastructure_types'
import type {
    ComposeIssue,
    ComposeResult,
    DraftPosition,
} from '../../types/compose_types'
import { distributeOnLine } from '../../infrastructure/placement'
import { hasCollisionInDrafts } from '../../infrastructure/collision'

/**
 * 功能：
 *
 *     路径布局输入参数。
 */
export interface PathParams {
    /** 轴心节点。路径从此节点出发。 */
    axis: { id: NodeId; position: NodePosition }

    /** 路径节点列表（有序）。仅需 id 和 radius，位置由引擎计算。 */
    pathNodes: { id: NodeId; radius: number }[]

    /** 射线方向角（弧度）。x 轴正方向为 0，逆时针为正。 */
    direction: number

    /** 相邻节点间距（通常用 computeTierSpacing 计算）。 */
    spacing: number

    /** 当前 GraphData 节点快照。 */
    allNodes: NodeData[]

    /** 当前 GraphData 边快照。用于校验路径节点与轴心之间是否存在有向实边。 */
    allEdges: EdgeData[]

    /** 节点半径覆盖表。 */
    nodeRadiusOverrides: NodeRadiusMap
}

/**
 * 功能：
 *
 *     路径布局。将路径节点沿指定方向的射线等距排列。
 *
 * 规则：
 *
 *     1. 边校验：每个路径节点必须通过有向实边与轴心节点连接。无向边或虚边 → issue error。
 *     2. 位置计算：调 distributeOnLine 沿射线生成等距位置。
 *       第 i 个节点距原点 = (i+1) · spacing。
 *     3. 碰撞检测：调 hasCollisionInDrafts，同时检查草稿互碰和草稿 vs 已有节点。
 *
 * 参数：
 *
 *     见 PathParams。
 */
export function pathLayout(params: PathParams): ComposeResult<DraftPosition> {
    const {
        axis,
        pathNodes,
        direction,
        spacing,
        allNodes,
        allEdges,
        nodeRadiusOverrides,
    } = params

    const issues: ComposeIssue[] = []

    // ── 校验：每个路径节点必须通过有向实边连接轴心 ──
    for (const pn of pathNodes) {
        const hasDirectedRealEdge = allEdges.some(
            (edge) =>
                edge.kind === 'real' &&
                edge.direction === 'directed' &&
                ((edge.source === axis.id && edge.target === pn.id) ||
                    (edge.source === pn.id && edge.target === axis.id)),
        )

        if (!hasDirectedRealEdge) {
            issues.push({
                severity: 'error',
                code: 'PATH_MISSING_DIRECTED_REAL_EDGE',
                message: `节点 ${pn.id} 与轴心节点 ${axis.id} 之间不存在有向实边，不能参与路径布局。`,
            })
        }
    }

    // ── 位置计算 ──
    const positions = distributeOnLine(
        axis.position,
        direction,
        pathNodes.length,
        spacing,
    )

    const drafts: DraftPosition[] = pathNodes.map((pn, i) => ({
        nodeId: pn.id,
        position: positions[i]!,
    }))

    // ── 碰撞检测 ──
    const blocked = hasCollisionInDrafts(drafts, allNodes, nodeRadiusOverrides)

    if (blocked) {
        issues.push({
            severity: 'error',
            code: 'PATH_COLLISION',
            message: '部分路径节点草稿位置与已有节点碰撞，无法放置。',
        })
    }

    // ── 组装 operations ──
    const operations = drafts.map((draft) => ({
        type: 'move_node' as const,
        nodeId: draft.nodeId,
        position: draft.position,
    }))

    return { drafts, issues, operations }
}
