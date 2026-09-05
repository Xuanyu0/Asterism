/**
 * tools/toolbar/delete.ts
 *
 * 功能：
 *
 *     删除工具处理器。支持节点和边的两步确认删除流程。
 *
 * 总体结构：
 *
 *     useDeleteTool() → ToolHandler
 *
 * 规则：
 *
 *     1. 首次点击标记待定目标，第二次点击同一目标确认删除。
 *     2. 点击不同目标时切换待定目标。
 *     3. notification 暴露删除确认信息供视图渲染。
 *     4. 内部管理 pendingDeleteNodeId / pendingDeleteEdgeId 状态。
 *     5. 按 deriveNodeForm 分发：抽象节点 → deleteAbstractNode 递归删除整棵
 *        子图树；非抽象节点（含引用节点）→ 普通 delete_node。
 */

import { ref, computed } from 'vue'

import { useGraphStore } from '@/graph/graph_store'
import { useGraphOperation } from '@/graph/use-case/useGraphOperation'

import { deleteAbstractNode, deriveNodeForm } from '@my-project/graph-engine'

import type { NodeId, EdgeId } from '@my-project/graph-engine'

import type { ToolId, ToolHandler, ToolNotification } from '../types'

export function useDeleteTool(): ToolHandler {
    const graphStore = useGraphStore()
    const operations = useGraphOperation()
    const id: ToolId = 'delete'

    const isActive = ref(false)
    const pendingDeleteNodeId = ref<NodeId | null>(null)
    const pendingDeleteEdgeId = ref<EdgeId | null>(null)

    const cursorClass = computed<string | null>(() => {
        return isActive.value ? 'cursor-pointer' : null
    })

    const notification = computed<ToolNotification | null>(() => {
        if (!isActive.value) return null
        if (
            pendingDeleteNodeId.value === null &&
            pendingDeleteEdgeId.value === null
        ) {
            return null
        }

        const nodeId = pendingDeleteNodeId.value
        let targetLabel = '此边'
        let deletesSubtree = false
        if (nodeId !== null) {
            const node = graphStore.graphView?.nodes.find(
                (n) => n.id === nodeId,
            )
            targetLabel = node?.label ?? '此节点'
            // 抽象节点（childGraphId 非空）：确认删除将连带子图树
            deletesSubtree =
                node?.role === 'knowledge' &&
                deriveNodeForm(node) === 'abstract'
        }

        return {
            visible: true,
            message: deletesSubtree
                ? `再次点击将删除："${targetLabel}"（及其子图）`
                : `再次点击将删除："${targetLabel}"`,
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

        const node = graphStore.graphView.nodes.find((n) => n.id === nodeId)
        if (!node) return // 防御：节点不存在（两击确认保证在图中，正常不可达）

        // 抽象节点 → 递归删除整棵子图树（07.3 compose）；非抽象 → 普通 delete_node
        if (node.role === 'knowledge' && deriveNodeForm(node) === 'abstract') {
            const result = deleteAbstractNode({
                nodeId,
                registry: graphStore.graphRegistry,
            })
            if (result.issues.some((issue) => issue.severity === 'error')) {
                // 防御：正常不可达（TARGET_NOT_FOUND / NOT_ABSTRACT）
                console.warn(`[delete] 抽象节点删除被拒绝：${nodeId}`)
                return
            }
            operations.commitBatches(result.batches, { source: id })
        } else {
            operations.commitToCurrentGraph(
                [
                    {
                        type: 'delete_node',
                        nodeId,
                    },
                ],
                { source: id },
            )      
        }
        
    }

    function executeDeleteEdge(edgeId: EdgeId): void {
        if (!graphStore.graphView) return

        operations.commitToCurrentGraph(
            [
                {
                    type: 'delete_edge',
                    edgeId,
                },
            ],
            { source: id },
        )
    }

    return {
        id,
        get isActive() {
            return isActive.value
        },
        activate,
        deactivate,
        onNodeClick,
        onEdgeClick,
        get cursorClass() {
            return cursorClass.value
        },
        get notification() {
            return notification.value
        },
        get highlightNode() {
            return pendingDeleteNodeId.value
        },
        get highlightEdge() {
            return pendingDeleteEdgeId.value
        },
    }
}
