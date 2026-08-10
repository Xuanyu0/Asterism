/**
 * 功能：
 *
 *     默认工具 ToolHandler。作为 mediator 的 baseline——无其他工具激活时自动生效。
 *     处理画布点击事件——打开浮空窗，确认后写入 GraphData。
 *
 * 总体结构：
 *
 *     1. useDefaultTool() → ToolHandler（生命周期 / 画布事件 / 浮空窗确认）
 */

import { ref } from 'vue'

import { useGraphStore } from '@/graph/graph_store'
import { useGraphOperationAdapter } from '@/graph/adapters/useGraphOperationAdapter'
import { useCanvasFocus } from '@/composables/useCanvasFocus'
import { useFloatingWindow } from '@/composables/useFloatingWindow'

import type { NodeData, EdgeData, KnowledgeNodeData } from '@my-project/graph-engine'
import type { ToolHandler, ToolId } from './types'

/**
 * 功能：
 *
 *     创建默认工具 handler。
 *
 * 规则：
 *
 *     1. 通过 mediator 的 `activate()` 激活（启动时 + `deactivate` 恢复机制）。
 *     2. onNodeClick 在 graphView 中查找节点 → open 浮空窗。
 *     3. onEdgeClick 在 graphView 中查找边 → open 浮空窗。
 *     4. onConfirm 读取浮空窗单例的展示数据获取原实体，用 label/summary 覆盖后构造 operation 并经适配层 commitToCurrentGraph 提交。
 */
export function useDefaultTool(): ToolHandler {
    const graphStore = useGraphStore()
    const operations = useGraphOperationAdapter()
    const canvasFocus = useCanvasFocus()
    const floatingWindow = useFloatingWindow()
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
     *
     *     处理节点点击——在 graphView 中查找节点并打开浮空窗。
     */
    function onNodeClick(nodeId: string): void {
        const node = graphStore.graphView?.nodes.find(n => n.id === nodeId)
        if (node) {
            floatingWindow.open(node)
        }
    }

    /**
     * 功能：
     *
     *     处理边点击——在 graphView 中查找边并打开浮空窗。
     */
    function onEdgeClick(edgeId: string): void {
        const edge = graphStore.graphView?.edges.find(e => e.id === edgeId)
        if (edge) {
            floatingWindow.open(edge)
        }
    }

    /**
     * 功能：
     *
     *     处理节点双击——按优先级导航到关联图谱。
     *
     * 规则：
     *
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

        floatingWindow.close()

        if (!graphStore.loadGraphToView(targetGraphId)) return

        if (focusNodeId) {
            canvasFocus.requestCanvasFocus(focusNodeId)
        }
    }

    // ── 浮空窗确认 ──

    /**
     * 功能：
     *
     *     将浮空窗编辑结果写入 GraphData。读取浮空窗单例的展示数据获取原实体，
     *     用 label/summary 覆盖后构造 update_node / update_edge operation 并经适配层 commitToCurrentGraph 提交。
     *
     * 规则：
     *
     *     1. 校验通过后关闭浮空窗。
     *     2. 校验失败时浮空窗保留。
     */
    function onConfirm(label: string, summary: string): void {
        const original = floatingWindow.floatingData.value
        if (!original || !graphStore.graphView) {
            return
        }

        if (isEdgeData(original)) {
            // 边编辑
            const edge: EdgeData = { ...original, label }

            const validation = operations.commitToCurrentGraph([{ type: 'update_edge', edge }], { source: id })

            if (validation.valid) {
                floatingWindow.close()
            }
        } else {
            // 节点编辑
            const node: NodeData = { ...original, label }

            if (original.role === 'knowledge') {
                (node as KnowledgeNodeData).summary = summary
            }

            const validation = operations.commitToCurrentGraph([{ type: 'update_node', node }], { source: id })

            if (validation.valid) {
                floatingWindow.close()
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
        get floatingWindowData() { return floatingWindow.floatingData.value },
        get cursorClass() { return null },
        get notification() { return null },
    }
}
