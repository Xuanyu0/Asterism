/**
 * tools/toolbar/add-node.ts
 *
 * 功能：
 *
 *     添加节点工具处理器。支持实节点和虚节点两种变体。
 *
 * 总体结构：
 *
 *     1. DraftNode — 节点草稿类型定义
 *     2. useAddNodeTool(kind) → ToolHandler
 *
 * 规则：
 *
 *     1. onCanvasClick 创建 DraftNode。
 *     2. onConfirm 校验 label → 构造 NodeData → 经适配层 commitToCurrentGraph → 清 draft → deactivate。
 *     3. deactivate 时清除草稿。
 */

import { ref, computed } from 'vue'

import { useGraphStore } from '@/graph/graph_store'
import { useGraphOperationAdapter } from '@/graph/adapters/useGraphOperationAdapter'
import { generateNodeId } from '@my-project/graph-engine'

import type { KnowledgeNodeKind } from '@my-project/graph-engine'

import type { ToolId, ToolHandler, ToolNotification } from '../types'

/**
 * 功能：
 *
 *     表示尚未提交到 GraphData 的节点草稿。
 *
 * 规则：
 *
 *     1. DraftNode 不属于 GraphData。
 *     2. 用户确认前允许为空字段。
 *     3. 关闭浮空窗后自动销毁。
 */
export interface DraftNode {
    kind: KnowledgeNodeKind
    x: number
    y: number
    label: string
    summary: string
}


export function useAddNodeTool(kind: 'real' | 'virtual'): ToolHandler {
    const graphStore = useGraphStore()
    const operations = useGraphOperationAdapter()

    const id: ToolId = (kind === 'real' ? 'add-real-node' : 'add-virtual-node')

    const isActive = ref(false)
    const draftNode = ref<DraftNode | null>(null)

    const cursorClass = computed<string | null>(() => {
        return isActive.value ? 'cursor-crosshair' : null
    })
    const notification = computed<ToolNotification | null>(() => null)

    function activate(): void {
        isActive.value = true
    }

    function deactivate(): void {
        draftNode.value = null
        isActive.value = false
    }

    // ── 不同事件的处理 ──

    function onCanvasClick(pos: { x: number; y: number }): void {
        draftNode.value = {
            kind: kind as KnowledgeNodeKind,
            x: pos.x,
            y: pos.y,
            label: '',
            summary: '',
        }
    }

    function onConfirm(label: string, summary: string): void {
        if (!draftNode.value || !graphStore.graphView) {
            return
        }

        // 空 label 不再前端预校验构造——提交后由引擎 validateAddNode 拒绝（EMPTY_LABEL），
        // 校验结果经 commitBatchToGraphs 同步到 lastValidationResult，draftNode 保留不清空
        const trimmedLabel = label.trim()

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
                x: draftNode.value.x,
                y: draftNode.value.y,
            },
        }

        const validation = operations.commitToCurrentGraph([{
            type: 'add_node',
            node,
        }], { source: id })

        if (validation.valid) {
            draftNode.value = null
        }
    }

    function onCancel(): void {
        draftNode.value = null
    }

    // ── 草稿管理 ──
    function updateDraftNode(patch: Partial<DraftNode>): void {
        if (!draftNode.value) {
            return
        }

        draftNode.value = {
            ...draftNode.value,
            ...patch,
        }
    }

    return {
        id,
        get isActive() { return isActive.value },
        activate,
        deactivate,
        onCanvasClick,
        onConfirm,
        onCancel,
        get cursorClass() { return cursorClass.value },
        get notification() { return notification.value },
        get draftNode() { return draftNode.value },
        updateDraftNode,
    }
}
