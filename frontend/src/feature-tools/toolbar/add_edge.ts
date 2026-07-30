/**
 * tools/toolbar/add-edge.ts
 *
 * 功能：
 *     添加边工具处理器。支持实/虚边和有向/无向边四种变体。
 *
 * 总体结构：
 *     useAddEdgeTool(kind, direction) → ToolHandler
 *
 * 规则：
 *     1. onNodeClick 两次点击流程：第一次记录 sourceNodeId，第二次构建 EdgeData 并提交。
 *     2. 成功后清空 sourceNodeId 但保持工具激活，可继续添加下一条边。
 *     3. deactivate 时清空 sourceNodeId。
 *
 * 外部如何使用：
 *     toolbar/registry.ts 调用 useAddEdgeTool('real', 'directed') 等。
 */

import { ref, computed } from 'vue'

import { useGraphStore } from '@/graph/graph_store'
import { generateEdgeId } from '@my-project/graph-engine'

import type { NodeId } from '@my-project/graph-engine'

import type { ToolId, ToolHandler, ToolNotification } from '../types'


export function useAddEdgeTool(
    kind: 'real' | 'virtual',
    direction: 'directed' | 'undirected',
): ToolHandler {
    const graphStore = useGraphStore()
    const id: ToolId = `add-${kind}-${direction}`

    const isActive = ref(false)
    const sourceNodeId = ref<NodeId | null>(null)

    const cursorClass = computed<string | null>(() => {
        if (!isActive.value) return null
        return sourceNodeId.value !== null ? 'cursor-cell' : 'cursor-crosshair'
    })

    const notification = computed<ToolNotification | null>(() => null)

    function activate(): void {
        isActive.value = true
    }

    function deactivate(): void {
        sourceNodeId.value = null
        isActive.value = false
    }

    // ── 不同事件的处理 ──

    function onNodeClick(nodeId: string): void {
        // 第一次点击：记录 source
        if (sourceNodeId.value === null) {
            sourceNodeId.value = nodeId as NodeId
            return
        }

        // 第二次点击：创建边
        if (!graphStore.graphView) {
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
            // 重置源节点
            sourceNodeId.value = null
        }
        //失败后保持源节点不变，可继续添加下一条边

    }

    const handler: ToolHandler = {
        id,
        get isActive() { return isActive.value },
        activate,
        deactivate,
        onNodeClick,
        get cursorClass() { return cursorClass.value },
        get notification() { return notification.value },
        get highlightNode(): string | null { return sourceNodeId.value },
    }
    return handler
}
