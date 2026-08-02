/**
 * 说明：
 *
 *     添加边工具处理器。支持实/虚边和有向/无向边四种变体。
 *
 * 总体结构：
 *
 *     useAddEdgeTool(kind, direction) → ToolHandler
 */

import { ref, computed } from 'vue'

import { useGraphStore } from '@/graph/graph_store'
import { useRenderer } from '@/cytoscape/useRenderer'
import { previewAddEdge } from '@/feature-tools/preview/preview_engine'
import { generateEdgeId } from '@my-project/graph-engine'

import type { GraphData, NodeId } from '@my-project/graph-engine'

import type { ToolId, ToolHandler, ToolNotification } from '../types'


export function useAddEdgeTool(
    kind: 'real' | 'virtual',
    direction: 'directed' | 'undirected',
): ToolHandler {
    const graphStore = useGraphStore()
    const {
        syncFromGraphData,
        addNodeClass,
        clearAllPreviews,
    } = useRenderer()
    const id: ToolId = `add-${kind}-${direction}`

    const isActive = ref(false)
    const sourceNodeId = ref<NodeId | null>(null)

    /** 当前预览的目标节点。非空 = 画布处于预览态；供 hover 离开 / 提交成功 / deactivate 复位，deactivate 据此判断是否切回真实图。 */
    const hoverTargetId = ref<NodeId | null>(null)

    const cursorClass = computed<string | null>(() => {
        if (!isActive.value) return null
        return sourceNodeId.value !== null ? 'cursor-cell' : 'cursor-crosshair'
    })

    const notification = computed<ToolNotification | null>(() => null)

    // ── 生命周期 ──

    function activate(): void {
        isActive.value = true
    }

    /**
     * 说明：
     *
     *     取消激活工具。清除本工具施加的全部 class，画布若停留在预览图则切回真实图。
     *
     * 调用契约：
     *
     *     1. deactivate 本身不修改 graphView，
     *        watch(graphView) 不会触发——仅预览态需要手动 sync 切回真实图。
     */
    function deactivate(): void {
        clearAllPreviews('add-edge')

        if (hoverTargetId.value !== null) {
            hoverTargetId.value = null
            if (graphStore.graphView) {
                syncFromGraphData(graphStore.graphView)
            }
        }

        sourceNodeId.value = null
        isActive.value = false
    }

    // ── 画布事件 ──

    /**
     * 说明：
     *
     *     处理节点悬停。source 已选中且悬停到非自身节点时，渲染加边预览图并施加碰撞高亮。
     *
     * 调用契约：
     *
     *     1. source 未选中或悬停自身 → 跳过（不把自己当目标）。
     */
    function onNodeHover(nodeId: string): void {
        if (sourceNodeId.value === null) return
        if (nodeId === sourceNodeId.value) return
        if (!graphStore.graphView) return

        const { previewGraph, valid, sourceCollides, targetCollides } = previewAddEdge(
            graphStore.graphView,
            {
                sourceId: sourceNodeId.value,
                targetId: nodeId as NodeId,
                kind,
                direction,
            },
        )

        if (valid === false) return

        applyHoverPreview(previewGraph, nodeId as NodeId, sourceCollides, targetCollides)
    }

    /**
     * 说明：
     *
     *     处理节点悬停离开。切回真实图并重施 source 高亮（source 仍选中）。
     */
    function onNodeHoverOut(_nodeId: string): void {
        // 没有选中起始节点时跳过渲染同步
        if (hoverTargetId.value === null) return

        clearAllPreviews('add-edge')

        if (graphStore.graphView) {
            syncFromGraphData(graphStore.graphView)
        }

        // source 仍选中——切回真实图后需重施 source 高亮
        if (sourceNodeId.value !== null) {
            addNodeClass(sourceNodeId.value, 'edge-source-target', 'add-edge')
        }

        hoverTargetId.value = null
    }

    /**
     * 说明：
     *
     *     处理节点点击。第一次点击记录 source，第二次点击碰撞校验通过后创建边。
     *
     * 调用契约：
     *
     *     1. 校验失败或任一端碰撞 → 忽略点击，sourceNodeId 保持可重试。
     *     2. Graph.vue 内的 watch(graphView) 会自动触发 syncFromGraphData 同步真实图，无需手动 sync。
     */
    function onNodeClick(nodeId: string): void {
        // 第一次点击：记录 source 并施加起点高亮
        if (sourceNodeId.value === null) {
            sourceNodeId.value = nodeId as NodeId
            addNodeClass(nodeId, 'edge-source-target', 'add-edge')
            return
        }

        if (!graphStore.graphView) {
            return
        }

        // 不能自己连自己
        if (nodeId === sourceNodeId.value) {
            return
        }

        // 用预览层进行碰撞校验
        const { valid, sourceCollides, targetCollides } = previewAddEdge(
            graphStore.graphView,
            {
                sourceId: sourceNodeId.value,
                targetId: nodeId as NodeId,
                kind,
                direction,
            },
        )
        if (valid === false || sourceCollides || targetCollides) {
            return
        }

        const edge = {
            id: generateEdgeId(),
            graphId: graphStore.graphView.id,
            source: sourceNodeId.value,
            target: nodeId as NodeId,
            kind,
            direction,
            label: '',
        }

        const result = graphStore.commitBatchToGraph(graphStore.graphView, [{
            type: 'add_edge',
            edge,
        }])

        graphStore.lastValidationResult = result.validation

        if (result.validation.valid) {
            clearAllPreviews('add-edge')
            hoverTargetId.value = null
            sourceNodeId.value = null
        }
        // 失败后保持源节点不变，可继续添加下一条边

    }

    function applyHoverPreview(
        previewGraph: GraphData,
        targetId: NodeId,
        sourceCollides: boolean,
        targetCollides: boolean,
    ): void {
        if (sourceNodeId.value === null) return

        // 整图切换到预览图——sync 清空 class，以下 class 必须在 sync 后重施
        syncFromGraphData(previewGraph)
        addNodeClass(sourceNodeId.value, 'edge-source-target', 'add-edge')
        if (sourceCollides) {
            addNodeClass(sourceNodeId.value, 'preview-collision', 'add-edge')
        }
        if (targetCollides) {
            addNodeClass(targetId, 'preview-collision', 'add-edge')
        }

        hoverTargetId.value = targetId
    }

    const handler: ToolHandler = {
        id,
        get isActive() { return isActive.value },
        activate,
        deactivate,
        onNodeClick,
        onNodeHover,
        onNodeHoverOut,
        get cursorClass() { return cursorClass.value },
        get notification() { return notification.value },
    }
    return handler
}
