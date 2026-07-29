/**
 * feature-tools/default.ts
 *
 * 功能：
 *     默认工具 ToolHandler。作为 mediator 的 baseline——无其他工具激活时自动生效，
 *     处理画布点击事件——打开节点/边浮空窗，以及浮空窗确认写入 GraphData。
 *
 * 总体结构：
 *     1. useDefaultTool() → ToolHandler
 *
 * 规则：
 *     1. activate / deactivate 由 mediator 调用以反映当前激活状态。
 *     2. cursorClass 为 null（默认指针）。
 *     3. onNodeClick / onEdgeClick 打开浮空窗。
 *     4. onConfirm 将浮空窗编辑结果写入 GraphData。
 *
 * 外部如何使用：
 *     Graph.vue 在 onMounted 中注册：mediator.register('default', useDefaultTool())
 */

import { ref } from 'vue'

import { useGraphStore } from '@/graph/graph_store'
import { useUIStore } from '@/ui/ui_store'

import type { NodeData, EdgeData, KnowledgeNodeData } from '@my-project/graph-engine'
import type { ToolHandler, ToolId } from './types'


/**
 * 功能：
 *     创建默认工具 handler。
 *
 * 规则：
 *     1. 通过 mediator 的 `activate()` 激活（启动时 + `deactivate` 恢复机制）。
 *     2. onNodeClick 在 graphView 中查找节点 → uiStore.openFloatingWindow。
 *     3. onEdgeClick 在 graphView 中查找边 → uiStore.openFloatingWindow。
 *     4. onConfirm 读取 uiStore.floatingWindowData 获取原实体，用 label/summary 覆盖后构造 operation 并 applyBatch。
 *
 * 使用：
 *     const handler = useDefaultTool()
 *     mediator.register('default', handler)
 */
export function useDefaultTool(): ToolHandler {
    const graphStore = useGraphStore()
    const uiStore = useUIStore()
    const id: ToolId = 'default'

    const isActive = ref(false)

    // ── 生命周期 ──

    function activate(): void {
        isActive.value = true
    }

    function deactivate(): void {
        isActive.value = false
    }

    // ── 画布事件 ──

    /**
     * 功能：
     *     处理节点点击——在 graphView 中查找节点并打开浮空窗。
     */
    function onNodeClick(nodeId: string): void {
        const node = graphStore.graphView?.nodes.find(n => n.id === nodeId)
        if (node) {
            uiStore.openFloatingWindow(node)
        }
    }

    /**
     * 功能：
     *     处理边点击——在 graphView 中查找边并打开浮空窗。
     */
    function onEdgeClick(edgeId: string): void {
        const edge = graphStore.graphView?.edges.find(e => e.id === edgeId)
        if (edge) {
            uiStore.openFloatingWindow(edge)
        }
    }

    /**
     * 功能：
     *     处理节点双击——按优先级导航到关联图谱。
     *
     * 规则：
     *     1. 引用节点（role === 'reference'）→ 跳转到源节点所在图。
     *     2. 抽象节点（有 childGraphId）→ 跳转子图。
     *     3. 其余节点 → 无操作。
     *     5. 打开目标图后若有 focusNodeId，请求画布聚焦该节点。
     *     6. 本函数不检查 activeToolId——由 Graph.vue 的调用者完成。
     *     7. 本函数不调 mediator.deactivate()——由 Graph.vue 的调用者在调用前自行处理。
     */
    function onNodeDoubleClick(nodeId: string): void {
        if (!graphStore.graphView) return

        const node = graphStore.graphView.nodes.find(n => n.id === nodeId)
        if (!node) return

        // 按优先级决定导航目标
        let targetGraphId: string | undefined
        let focusNodeId: string | undefined

        // 优先级 1：引用节点 → 跳转到源节点所在图
        if (node.role === 'reference' && node.sourceGraphId) {
            targetGraphId = node.sourceGraphId
            focusNodeId = node.sourceNodeId
        }
        // 优先级 2：抽象节点 → 跳转子图
        else if (node.childGraphId) {
            targetGraphId = node.childGraphId
        }
        // 优先级 3：其余节点 → 无操作
        else {
            return
        }

        uiStore.closeFloatingWindow()

        if (!graphStore.loadGraphToView(targetGraphId)) return

        if (focusNodeId) {
            uiStore.requestCanvasFocus(focusNodeId)
        }
    }

    // ── 浮空窗确认 ──

    /**
     * 功能：
     *     将浮空窗编辑结果写入 GraphData。读取 uiStore.floatingWindowData 获取原实体，
     *     用 label/summary 覆盖后构造 update_node / update_edge operation 并 applyBatch。
     *
     * 规则：
     *     1. 校验通过后关闭浮空窗。
     *     2. 校验失败时浮空窗保留。
     */
    function onConfirm(label: string, summary: string): void {
        const original = uiStore.floatingWindowData
        if (!original || !graphStore.graphView) {
            return
        }

        if (isEdgeData(original)) {
            // 边编辑
            const edge: EdgeData = { ...original, label }

            const result = graphStore.applyBatchToGraph(
                graphStore.graphView,
                [{ type: 'update_edge', edge }],
            )

            if (result.validation.valid) {
                uiStore.closeFloatingWindow()
            }
        } else {
            // 节点编辑
            const node: NodeData = { ...original, label }

            if (original.role === 'knowledge') {
                (node as KnowledgeNodeData).summary = summary
            }

            const result = graphStore.applyBatchToGraph(
                graphStore.graphView,
                [{ type: 'update_node', node }],
            )

            if (result.validation.valid) {
                uiStore.closeFloatingWindow()
            }
        }
    }

    // ── 私有辅助 ──
    function isEdgeData(data: NodeData | EdgeData): data is EdgeData {
        return 'source' in data && 'target' in data
    }

    // ── 公开 API ──

    return {
        id,
        get isActive() { return isActive.value },
        activate,
        deactivate,
        onNodeClick,
        onEdgeClick,
        onNodeDoubleClick,
        onConfirm,
        get cursorClass() { return null },
        get notification() { return null },
    }
}
