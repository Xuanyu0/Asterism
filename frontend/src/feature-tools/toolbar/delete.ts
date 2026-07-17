/**
 * tools/toolbar/delete.ts
 *
 * 功能：
 *     删除工具处理器。支持节点和边的两步确认删除流程。
 *
 * 总体结构：
 *     useDeleteTool() → ToolHandler
 *
 * 规则：
 *     1. 首次点击标记待定目标，第二次点击同一目标确认删除。
 *     2. 点击不同目标时切换待定目标。
 *     3. notification 暴露删除确认信息供视图渲染。
 *     4. 内部管理 pendingDeleteNodeId / pendingDeleteEdgeId 状态。
 *
 * 外部如何使用：
 *     toolbar/registry.ts 调用 useDeleteTool()。
 */

import { ref, computed } from 'vue'

import { useGraphStore } from '@/graph/graph_store'
import { useUIStore } from '@/ui/ui_store'

import type { NodeId, EdgeId } from '@my-project/graph-engine'

import type { ToolId, ToolHandler, ToolNotification } from '../types'


export function useDeleteTool(): ToolHandler {
    const graphStore = useGraphStore()
    const uiStore = useUIStore()
    const id: ToolId = 'delete'

    const isActive = ref(false)
    const pendingDeleteNodeId = ref<NodeId | null>(null)
    const pendingDeleteEdgeId = ref<EdgeId | null>(null)

    const cursorClass = computed<string | null>(() => {
        return isActive.value ? 'cursor-pointer' : null
    })

    const notification = computed<ToolNotification | null>(() => {
        if (!isActive.value) return null
        if (pendingDeleteNodeId.value === null && pendingDeleteEdgeId.value === null) {
            return null
        }

        const nodeId = pendingDeleteNodeId.value
        let message = '此边'
        if (nodeId !== null) {
            const node = graphStore.graphView?.nodes.find(n => n.id === nodeId)
            message = node?.label ?? '此节点'
        }

        return {
            visible: true,
            message,
            onCancel: clearPending,
        }
    })

    // ── 生命周期 ──

    function activate(): void {
        isActive.value = true
    }

    function deactivate(): void {
        clearPending()
        isActive.value = false
    }

    // ── 不同事件的处理 ──

    function onNodeClick(nodeId: string): void {
        const current = pendingDeleteNodeId.value

        if (current === nodeId) {
            // 再次点击同一节点 = 确认删除
            executeDeleteNode(nodeId as NodeId)
            clearPending()
            return
        }

        pendingDeleteNodeId.value = nodeId as NodeId
        pendingDeleteEdgeId.value = null
    }

    function onEdgeClick(edgeId: string): void {
        const current = pendingDeleteEdgeId.value

        if (current === edgeId) {
            // 再次点击同一边 = 确认删除
            executeDeleteEdge(edgeId as EdgeId)
            clearPending()
            return
        }

        pendingDeleteEdgeId.value = edgeId as EdgeId
        pendingDeleteNodeId.value = null
    }

    // ── 内部辅助 ──

    function clearPending(): void {
        pendingDeleteNodeId.value = null
        pendingDeleteEdgeId.value = null
    }

    function executeDeleteNode(nodeId: NodeId): void {
        if (!graphStore.graphView) return

        const floatingData = uiStore.floatingWindowData
        if (floatingData && 'id' in floatingData && floatingData.id === nodeId) {
            uiStore.closeFloatingWindow()
        }

        const result = graphStore.applyBatchToGraph(graphStore.graphView, [{
            type: 'delete_node',
            nodeId,
        }])

        graphStore.lastValidationResult = result.validation
    }

    function executeDeleteEdge(edgeId: EdgeId): void {
        if (!graphStore.graphView) return

        const floatingData = uiStore.floatingWindowData
        if (floatingData && 'id' in floatingData && floatingData.id === edgeId) {
            uiStore.closeFloatingWindow()
        }

        const result = graphStore.applyBatchToGraph(graphStore.graphView, [{
            type: 'delete_edge',
            edgeId,
        }])

        graphStore.lastValidationResult = result.validation
    }

    return {
        id,
        get isActive() { return isActive.value },
        activate,
        deactivate,
        onNodeClick,
        onEdgeClick,
        get cursorClass() { return cursorClass.value },
        get notification() { return notification.value },
        get highlightNode() { return pendingDeleteNodeId.value },
        get highlightEdge() { return pendingDeleteEdgeId.value },
    }
}
