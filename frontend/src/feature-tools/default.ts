/**
 * feature-tools/default.ts
 *
 * 功能：
 *     默认工具 ToolHandler。作为 mediator 的 baseline——无其他工具激活时自动生效，
 *     处理画布点击事件——打开节点/边浮空窗。
 *
 * 总体结构：
 *     1. useDefaultTool() — 返回 ToolHandler 实例
 *
 * 规则：
 *     1. activate / deactivate 由 mediator 调用以反映当前激活状态。
 *     2. cursorClass 为 null（默认指针）。
 *     3. 仅 onNodeClick / onEdgeClick 有实际行为——打开浮空窗。
 *
 * 外部如何使用：
 *     Graph.vue 在 onMounted 中注册：mediator.register('default', useDefaultTool())
 */

import { ref } from 'vue'

import { useGraphStore } from '@/graph/graph_store'
import { useUIStore } from '@/ui/ui_store'

import type { ToolHandler, ToolId } from './types'


/**
 * 功能：
 *     创建默认工具 handler。
 *
 * 规则：
 *     1. 通过 mediator 的 `deactivate()` 恢复机制自动激活——`activate` / `deactivate` 由 mediator 调用。
 *     2. onNodeClick 在 graphView 中查找节点 → uiStore.openFloatingWindow。
 *     3. onEdgeClick 在 graphView 中查找边 → uiStore.openFloatingWindow。
 *
 * 使用：
 *     const handler = useDefaultTool()
 *     mediator.register('default', handler)
 */
export function useDefaultTool(): ToolHandler {
    const graphStore = useGraphStore()
    const uiStore = useUIStore()
    const isActive = ref(false)

    return {
        id: 'default' as ToolId,

        get isActive() {
            return isActive.value
        },

        activate(): void {
            isActive.value = true
        },

        deactivate(): void {
            isActive.value = false
        },

        onNodeClick(nodeId: string): void {
            const node = graphStore.graphView?.nodes.find(n => n.id === nodeId)
            if (node) {
                uiStore.openFloatingWindow(node)
            }
        },

        onEdgeClick(edgeId: string): void {
            const edge = graphStore.graphView?.edges.find(e => e.id === edgeId)
            if (edge) {
                uiStore.openFloatingWindow(edge)
            }
        },

        get cursorClass(): string | null {
            return null
        },

        get notification() {
            return null
        },
    }
}
