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
 *     1. 激活后经 trackCursor 实时预览（previewAddNode）：光标下显示占位节点，
 *        碰撞时叠加 preview-collision 红色高亮。
 *     2. onCanvasClick 将预览节点定格在点击位置并创建 DraftNode；confirm 前
 *        画布保留预览节点，提交后经 GraphData 更新无缝替换为真实节点。
 *     3. onConfirm 校验 label → 构造 NodeData → 经适配层 commitToCurrentGraph → 清 draft → deactivate。
 *     4. deactivate / onCancel 时停止光标追踪、清除草稿与预览。
 */

import { ref, computed } from 'vue'

import { useGraphStore } from '@/graph/graph_store'
import { useGraphOperationAdapter } from '@/graph/adapters/useGraphOperationAdapter'
import { generateNodeId } from '@my-project/graph-engine'
import { useRenderer } from '@/cytoscape/useRenderer'
import { previewAddNode } from '@/feature-tools/preview/preview_engine'

import type { KnowledgeNodeKind, NodePosition } from '@my-project/graph-engine'

import type { ToolId, ToolHandler, ToolNotification } from '../types'

/**
 * 尚未提交到 GraphData 的节点草稿。
 *
 * @remarks
 * 规则：
 * - DraftNode 不属于 GraphData
 * - nodeId 是预览节点 ID（previewAddNode 生成），供浮空窗锚定到画布上的占位节点
 * - 用户确认前允许为空字段；关闭浮空窗后自动销毁
 */
export interface DraftNode {
    /** 预览节点 ID——画布上占位节点的锚定目标（浮空窗据此定位）。 */
    nodeId: string
    kind: KnowledgeNodeKind
    x: number
    y: number
    label: string
    summary: string
}


export function useAddNodeTool(kind: 'real' | 'virtual'): ToolHandler {
    const graphStore = useGraphStore()
    const operations = useGraphOperationAdapter()
    const {
        syncFromGraphData,
        addNodeClass,
        clearAllPreviews,
        trackCursor,
    } = useRenderer()

    const id: ToolId = (kind === 'real' ? 'add-real-node' : 'add-virtual-node')

    const isActive = ref(false)
    const draftNode = ref<DraftNode | null>(null)

    /** 碰撞通知消息。null = 无通知。点击碰撞位置时设置，下次成功点击清除。 */
    const collisionMessage = ref<string | null>(null)

    // ── 命令式变量 ──
    /** trackCursor 返回的 stop 句柄（handle）。 */
    let stopCursorTracking: { stop(): void } | null = null

    const cursorClass = computed<string | null>(() => {
        return isActive.value ? 'cursor-crosshair' : null
    })

    // 碰撞消息 → 工具通知面板（Graph.vue 消费 activeHandler.notification 渲染）。
    // 点击碰撞位置时置入；再次点击无碰撞处或取消时清除。
    const notification = computed<ToolNotification | null>(() => {
        if (!isActive.value || collisionMessage.value === null) return null

        return {
            visible: true,
            message: collisionMessage.value,
            onCancel: () => { collisionMessage.value = null },
        }
    })

    function activate(): void {
        isActive.value = true

        // 光标追踪实时预览：鼠标移动 → 预览节点跟随光标
        stopCursorTracking = trackCursor((modelPos) => {
            if (draftNode.value !== null) return
            applyAddNodePreview(modelPos)
        })
    }

    function deactivate(): void {
        if (stopCursorTracking) {
            stopCursorTracking.stop()
            stopCursorTracking = null
        }

        // 清理预览 class 并切回真实图
        clearAllPreviews('add-node')
        if (graphStore.graphView) {
            syncFromGraphData(graphStore.graphView)
        }

        draftNode.value = null
        collisionMessage.value = null
        isActive.value = false
    }

    // ── 不同事件的处理 ──

    function onCanvasClick(pos: { x: number; y: number }): void {
        // 点击落定：定格预览节点在点击位置。若该位置碰撞，直接报错拒绝，
        // 不进入浮空窗编辑（用户需移动光标到无碰撞处重新点击）。
        const { collides, nodeId } = applyAddNodePreview(pos)

        if (collides) {
            collisionMessage.value = '该位置与已有节点碰撞，无法放置。'
            return
        }

        collisionMessage.value = null

        draftNode.value = {
            // 预览节点 ID 写入草稿，供浮空窗锚定到画布上的占位节点
            nodeId: nodeId ?? '',
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

        // 取消：清理预览节点并切回真实图（画布不再保留占位节点）
        clearAllPreviews('add-node')
        if (graphStore.graphView) {
            syncFromGraphData(graphStore.graphView)
        }
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

    // ── 实时预览 ──

    /**
     * 在当前光标位置应用添加节点预览：整图切到预览图（含占位节点），碰撞时叠加红色高亮。
     *
     * @remarks
     * sync 会清空全部 class，因此占位 / 碰撞 class 必须在 sync 后重施。
     *
     * @param pos - 当前光标模型坐标
     * @returns collides 为该位置是否与已有节点碰撞（调用方据此决定是否允许落定）；
     *          nodeId 为预览生成的占位节点 ID（graphView 缺失时为 null，
     *          onCanvasClick 定格时写入 draftNode.nodeId 供浮空窗锚定）
     */
    function applyAddNodePreview(pos: NodePosition): { collides: boolean; nodeId: string | null } {
        if (!graphStore.graphView) return { collides: false, nodeId: null }

        const { previewGraph, collides, nodeId } = previewAddNode(graphStore.graphView, pos, kind)

        syncFromGraphData(previewGraph)
        addNodeClass(nodeId, 'add-node-preview', 'add-node')
        if (collides) {
            addNodeClass(nodeId, 'preview-collision', 'add-node')
        }

        return { collides, nodeId }
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
