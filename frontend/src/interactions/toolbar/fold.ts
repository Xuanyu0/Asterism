/**
 * interactions/toolbar/fold.ts
 *
 * 功能：
 *     折叠/展开工具处理器。
 *
 * 总体结构：
 *     useFoldTool() → ToolHandler
 *
 * 规则：
 *     1. 检查目标节点是否已被折叠。
 *     2. 已折叠 → expand_dependency；未折叠 → collapse_dependency。
 *
 * 外部如何使用：
 *     toolbar/registry.ts 调用 useFoldTool()。
 */

import { ref, computed } from 'vue'

import { useGraphStore } from '@/graph/graph_store'

import type { NodeId } from '@my-project/graph-engine'

import type { ToolId, ToolHandler, ToolNotification } from '../types'


export function useFoldTool(): ToolHandler {
    const graphStore = useGraphStore()
    const id: ToolId = `fold`

    const isActive = ref(false)

    const cursorClass = computed<string | null>(() => {
        return isActive.value ? 'cursor-pointer' : null
    })

    const notification = computed<ToolNotification | null>(() => null)

    // ── 生命周期 ──

    function activate(): void {
        isActive.value = true
    }

    function deactivate(): void {
        isActive.value = false
    }

    // ── 事件的处理 ──

    function onNodeClick(nodeId: string): void {
        if (!graphStore.graphView) {
            return
        }

        const foldedDeps = graphStore.graphView.cognitiveState?.foldedDependencies ?? []
        const isFolded = foldedDeps.some(f => f.targetNodeId === nodeId)

        const operationType = isFolded
            ? ('expand_dependency' as const)
            : ('collapse_dependency' as const)

        const result = graphStore.applyBatchToGraph(graphStore.graphView, [{
            type: operationType,
            targetNodeId: nodeId as NodeId,
        }])

        graphStore.lastValidationResult = result.validation
    }

    return {
        id,
        get isActive() { return isActive.value },
        activate,
        deactivate,
        onNodeClick,
        get cursorClass() { return cursorClass.value },
        get notification() { return notification.value },
    }
}
