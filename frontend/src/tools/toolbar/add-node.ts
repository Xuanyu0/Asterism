/**
 * tools/toolbar/add-node.ts
 *
 * 功能：
 *     添加节点工具处理器。支持实节点和虚节点两种变体。
 *
 * 总体结构：
 *     useAddNodeTool(kind) → ToolHandler
 *
 * 规则：
 *     1. onCanvasClick 创建 DraftNode。
 *     2. onConfirm 校验 label → 构造 NodeData → applyBatchToGraph → 清 draft → deactivate。
 *     3. deactivate 时清除草稿。
 *
 * 外部如何使用：
 *     toolbar/registry.ts 调用 useAddNodeTool('real') / useAddNodeTool('virtual')。
 */

import { ref, computed } from 'vue'

import { useGraphStore } from '@/graph/graph_store'
import { useDraftStore } from '@/ui/draft_store'
import { generateNodeId } from '@my-project/graph-engine'

import type { KnowledgeNodeKind } from '@my-project/graph-engine'

import type { ToolId, ToolHandler, ToolNotification } from '../types'


export function useAddNodeTool(kind: 'real' | 'virtual'): ToolHandler {
    const graphStore = useGraphStore()
    const draftStore = useDraftStore()
    const id: ToolId = (kind === 'real' ? 'add-real-node' : 'add-virtual-node')

    const isActive = ref(false)

    const cursorClass = computed<string | null>(() => {
        return isActive.value ? 'cursor-crosshair' : null
    })

    const notification = computed<ToolNotification | null>(() => null)

    function activate(): void {
        isActive.value = true
    }

    function deactivate(): void {
        draftStore.clearDraftNode()
        isActive.value = false
    }

    // ── 不同事件的处理 ──

    function onCanvasClick(pos: { x: number; y: number }): void {
        draftStore.createDraftNode(kind as KnowledgeNodeKind, pos.x, pos.y)
    }

    function onConfirm(label: string, summary: string): void {
        if (!draftStore.draftNode || !graphStore.graphView) {
            return
        }

        const trimmedLabel = label.trim()
        if (!trimmedLabel) {
            graphStore.lastValidationResult = {
                valid: false,
                issues: [{
                    severity: 'error' as const,
                    code: 'EMPTY_LABEL',
                    message: '节点标签不能为空。',
                    targetType: 'node' as const,
                }],
            }
            return
        }

        const node = {
            role: 'knowledge' as const,
            id: generateNodeId(),
            graphId: graphStore.graphView.id,
            kind,
            form: kind === 'real' ? ('atomic' as const) : undefined,
            label: trimmedLabel,
            summary: summary.trim(),
            abstractionLevel: 0,
            degree: 0,
            position: {
                x: draftStore.draftNode.x,
                y: draftStore.draftNode.y,
            },
        }

        const result = graphStore.applyBatchToGraph(graphStore.graphView, [{
            type: 'add_node',
            node,
        }])

        graphStore.lastValidationResult = result.validation

        if (result.validation.valid) {
            draftStore.clearDraftNode()
        }
    }

    return {
        id,
        get isActive() { return isActive.value },
        activate,
        deactivate,
        onCanvasClick,
        onConfirm,
        get cursorClass() { return cursorClass.value },
        get notification() { return notification.value },
    }
}
