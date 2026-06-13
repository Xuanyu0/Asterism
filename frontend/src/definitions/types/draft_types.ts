/**
 * 功能：
 *     定义 Draft Runtime 的数据结构。
 *
 * 总体结构：
 *     1. DraftNode
 *     2. DraftEdge
 *     3. DraftState
 *
 * 外部如何使用：
 *     ui_store.ts 使用本文件保存用户尚未提交的图操作草稿。
 *     GraphData 不允许直接引用 Draft 类型。
 */
import type {
    EdgeDirection,
    EdgeKind,
    KnowledgeNodeKind,
    NodeId,
} from '@my-project/graph-engine'

/**
 * 功能：
 *     表示尚未提交到 GraphData 的节点草稿。
 *
 * 规则：
 *     1. DraftNode 不属于 GraphData。
 *     2. 用户确认前允许为空字段。
 *     3. 关闭浮空窗后自动销毁。
 */
export interface DraftNode {
    kind: KnowledgeNodeKind

    x: number

    y: number

    label: string

    summary: string
}

/**
 * 功能：
 *     表示尚未提交到 GraphData 的边草稿。
 *
 * 规则：
 *     1. DraftEdge 不属于 GraphData。
 *     2. 必须记录用户已经选择的起始节点。
 *     3. 用户确认前允许为空字段。
 */
export interface DraftEdge {
    kind: EdgeKind

    direction: EdgeDirection

    sourceNodeId: NodeId

    targetNodeId: NodeId | null

    label: string
}

/**
 * 功能：
 *     Draft Runtime 当前状态。
 *
 * 规则：
 *     1. 同时最多存在一个 DraftNode。
 *     2. 同时最多存在一个 DraftEdge。
 *     3. DraftNode 与 DraftEdge 互斥。
 */
export interface DraftState {
    draftNode: DraftNode | null

    draftEdge: DraftEdge | null
}
