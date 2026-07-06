/**
 * move.ts
 *
 * 功能：
 *
 *     单节点移动编排。封装位置草稿生成 + 碰撞判定 + 操作序列组装。
 *     前端不直接调 placement 或 collision 原语。
 *
 * 总体结构：
 *
 *     1. moveNode — 单节点移动的唯一入口
 *
 * 规则：
 *
 *     1. 始终返回完整的 ComposeResult——drafts / issues / operations 同时产出。
 *        微调时前端用 drafts + issues 做预览（灰/红草稿），
 *        确认时拿 operations 调 applyBatch。
 *     2. 碰撞通过 issues 的 error 级别体现，不阻止 operations 生成。
 *        前端根据 issues 中有无 error 决定灰/亮确认按钮。
 *     3. 纯函数——不持有状态，不写入 GraphData。
 *
 * 外部如何使用：
 *
 *     import { moveNode } from '@my-project/graph-engine'
 *
 *     // 微调预览（每帧）
 *     const result = moveNode({ nodeId, desiredPosition, allNodes, nodeRadiusOverrides })
 *     渲染草稿 result.drafts[0].position，根据 result.issues 控制确认按钮
 *
 *     // 确认
 *     if (no errors) applyBatch(graph, result.operations)
 */

import type { NodeId, NodePosition, NodeData } from '../../types/graph_data'
import type { NodeRadiusMap } from '../../types/infrastructure_types'
import type { ComposeResult, DraftPosition } from '../../types/compose_types'
import { hasCollisionAt } from '../../infrastructure/collision'

/**
 * 功能：
 *
 *     单节点移动。生成目标位置的草稿 + 判定碰撞 + 组装 move_node 操作。
 *
 * 规则：
 *
 *     1. 碰撞检测使用 hasCollisionAt——只查草稿位置是否与已有节点重叠。
 *        不存在草稿互碰（单节点）。
 *     2. 目标节点不在 allNodes 中时，hasCollisionAt 内部用 R0 回退。
 *
 * 参数：
 *
 *     nodeId               — 待移动的节点 ID
 *     desiredPosition       — 目标位置
 *     allNodes              — 当前 GraphData 中的节点快照（含被移动节点的旧位置）
 *     nodeRadiusOverrides   — 节点半径覆盖表。缺失项按公式计算
 */
export function moveNode(params: {
    nodeId: NodeId
    desiredPosition: NodePosition
    allNodes: NodeData[]
    nodeRadiusOverrides: NodeRadiusMap
}): ComposeResult<DraftPosition> {
    const { nodeId, desiredPosition, allNodes, nodeRadiusOverrides } = params

    const blocked = hasCollisionAt(nodeId, desiredPosition, allNodes, nodeRadiusOverrides)

    const draft: DraftPosition = {
        nodeId,
        position: desiredPosition,
    }

    const issues = blocked
        ? [{
            severity: 'error' as const,
            code: 'MOVE_NODE_COLLISION',
            message: `节点 ${nodeId} 在目标位置与已有节点碰撞，无法放置。`,
        }]
        : []

    const operations = [{
        type: 'move_node' as const,
        nodeId,
        position: desiredPosition,
    }]

    return { drafts: [draft], issues, operations }
}
