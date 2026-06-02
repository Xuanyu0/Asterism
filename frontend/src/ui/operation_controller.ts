
/**
 * 功能：
 *     统一接收图交互语义事件，并将用户意图转换为 Draft 或 GraphOperation。
 *
 * 总体结构：
 *     1. handleCanvasClicked()
 *     2. handleNodeClicked()
 *     3. handleEdgeClicked()
 *     4. handleNodeDragEnded()
 *     5. updateDraftNode()
 *     6. confirmDraftNode()
 *     7. cancelDraftNode()
 *
 * 外部如何使用：
 *     KnowledgeGraph.vue 与 NodeWindow.vue 调用本文件完成 UI Runtime 编排。
 */

import type {
    NodeData,
    NodeId,
    EdgeId,
    GraphPosition,
    NodePosition
} from '@/definitions/types/graph_types'
import type { DraftNode } from '@/definitions/types/draft_types'
import { useGraphStore } from '@/graph/graph_store'
import { useUIStore } from '@/ui/ui_store'
import { useDraftStore } from '@/ui/draft_store'

/**
 * 功能：
 *     画布点击语义事件。
 *
 * 规则：
 *     1. 坐标来自 Cytoscape 交互适配层。
 *     2. 是否创建 DraftNode 由当前 UI Runtime 状态决定。
 */
export interface CanvasClickedPayload extends GraphPosition {

}

/**
 * 功能：
 *     节点点击语义事件。
 *
 * 规则：
 *     1. 只表达用户点击了哪个节点。
 *     2. 不携带 Cytoscape 原始事件。
 */
export interface NodeClickedPayload {
    nodeId: NodeId
}

/**
 * 功能：
 *     边点击语义事件。
 *
 * 规则：
 *     1. 只表达用户点击了哪条边。
 *     2. 不携带 Cytoscape 原始事件。
 */
export interface EdgeClickedPayload {
    edgeId: EdgeId
}

/**
 * 功能：
 *     节点拖动结束语义事件。
 *
 * 规则：
 *     1. 只有拖动结束后才写回 GraphData。
 *     2. 拖动过程中的 Cytoscape 临时位置不作为事实源。
 */
export interface NodeDragEndedPayload {
    nodeId: NodeId
    position: NodePosition
}

/**
 * 功能：
 *     创建节点 id。
 *
 * 规则：
 *     1. MVP 阶段使用前端临时 id。
 *     2. 后续可替换为统一 id runtime。
 */
function createNodeId(): NodeId {
    return `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` as NodeId
}

/**
 * 功能：
 *     提供 UI 操作控制器。
 *
 * 规则：
 *     1. 可以读取 ui_store 与 draft_store。
 *     2. 可以调用 graph_store.applyOperation()。
 *     3. 禁止直接修改 GraphData。
 *     4. 禁止操作 Cytoscape 实例。
 */
export function useOperationController() {
    const graphStore = useGraphStore()
    const uiStore = useUIStore()
    const draftStore = useDraftStore()

    /**
     * 功能：
     *     处理画布点击。
     *
     * 规则：
     *     1. 仅在 Operation / Add / Node / kind 已确定时创建 DraftNode。
     *     2. 不直接创建正式 NodeData。
     */
    function handleCanvasClicked(
        payload: CanvasClickedPayload,
    ): void {
        if (uiStore.interactionMode !== 'operation') {
            return
        }

        if (uiStore.selectedOperationTool !== 'add') {
            return
        }

        if (uiStore.pendingAddTarget !== 'node') {
            return
        }

        if (!uiStore.pendingAddNode.kind) {
            return
        }

        draftStore.createDraftNode(
            uiStore.pendingAddNode.kind,
            payload.x,
            payload.y,
        )
    }

    /**
     * 功能：
     *     处理节点点击。
     *
     * 规则：
     *     1. 当前 MVP 先同步 GraphStore 选中状态。
     *     2. 后续 NodeWindow 可基于选中节点打开。
     */
    function handleNodeClicked(
        payload: NodeClickedPayload,
    ): void {
        graphStore.selectNode(payload.nodeId)
    }

    /**
     * 功能：
     *     处理边点击。
     *
     * 规则：
     *     1. 当前 MVP 先同步 GraphStore 选中状态。
     *     2. 后续 EdgeWindow 可基于选中边打开。
     */
    function handleEdgeClicked(
        payload: EdgeClickedPayload,
    ): void {
        graphStore.selectEdge(payload.edgeId)
    }

    /**
     * 功能：
     *     处理节点拖动结束。
     *
     * 规则：
     *     1. 拖动结束后通过 move_node Operation 写回 GraphData。
     *     2. GraphData.position 是唯一位置事实源。
     */
    function handleNodeDragEnded(
        payload: NodeDragEndedPayload,
    ): void {
        graphStore.applyOperation({
            type: 'move_node',
            nodeId: payload.nodeId,
            position: payload.position,
        })
    }

    /**
     * 功能：
     *     更新当前 DraftNode。
     *
     * 规则：
     *     1. 只修改 Draft Runtime。
     *     2. 不进入 GraphData。
     */
    function updateDraftNode(
        patch: Partial<DraftNode>,
    ): void {
        draftStore.updateDraftNode(patch)
    }

    /**
     * 功能：
     *     取消当前 DraftNode。
     *
     * 规则：
     *     1. 只清理 Draft Runtime。
     *     2. 不影响 GraphData。
     */
    function cancelDraftNode(): void {
        draftStore.clearDraftNode()
    }

    /**
     * 功能：
     *     确认当前 DraftNode，并转换为 add_node Operation。
     *
     * 规则：
     *     1. label 为空时拒绝提交。
     *     2. DraftNode 不直接进入 GraphData。
     *     3. 只有 graphStore.applyOperation() 可以修改 GraphData。
     */
    function confirmDraftNode(): void {
        if (!draftStore.draftNode) {
            return
        }

        if (!graphStore.currentGraph) {
            return
        }

        const draftNode = draftStore.draftNode
        const label = draftNode.label.trim()

        if (!label) {
            return
        }

        const node: NodeData = {
            id: createNodeId(),
            graphId: graphStore.currentGraph.id,
            kind: draftNode.kind,
            form: draftNode.kind === 'real' ? 'normal' : undefined,
            viewRole: 'normal',
            label,
            summary: draftNode.summary.trim(),
            abstractionLevel: 0,
            degree: 0,
            position: {
                x: draftNode.x,
                y: draftNode.y,
            },
        }

        const result = graphStore.applyOperation({
            type: 'add_node',
            node,
        })

        uiStore.lastOperationValidation = result

        if (result.valid) {
            draftStore.clearDraftNode()
        }
    }

    return {
        handleCanvasClicked,
        handleNodeClicked,
        handleEdgeClicked,
        handleNodeDragEnded,
        updateDraftNode,
        cancelDraftNode,
        confirmDraftNode,
    }
}
