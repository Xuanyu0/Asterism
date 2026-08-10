/**
 * 说明：
 *
 *     移动节点工具处理器。实现拾取放置交互（pick-and-place）。
 *
 * 调用契约：
 *
 *     1. 两种状态：待拾取（idle）和已拾取（picked）。
 *     2. 待拾取状态下点击节点 → 已拾取，节点跟随光标。
 *     3. 已拾取状态下点击 → 放置尝试。
 *     4. 放置碰撞 → 红色高亮 + notification，保持已拾取。
 *     5. 右键取消拾取 → 弹回原位。
 *     6. 禁止直接修改 GraphData；所有写入经适配层 commitToCurrentGraph（内部走 commitBatchToGraphs）。
 *     7. 中间位置不写 GraphData，经 preview_engine 克隆预览通道整图 sync 渲染。
 */

import { ref, computed } from 'vue'

import { useGraphStore } from '@/graph/graph_store'
import { useGraphOperationAdapter } from '@/graph/adapters/useGraphOperationAdapter'
import { computeNodeRadiusOverrides } from '@/graph/utils/node_radius'
import { hasErrors } from '@/graph/utils/issue_guard'
import { moveNode as composeMoveNode } from '@my-project/graph-engine'
import { useRenderer } from '@/cytoscape/useRenderer'
import { previewMoveNode } from '@/feature-tools/preview/preview_engine'

import type { NodeId, NodePosition } from '@my-project/graph-engine'

import type { ToolId, ToolHandler, ToolNotification } from '../types'

// ── useMoveNodeTool ──

/**
 * 说明：
 *
 *     创建移动节点工具处理器。
 *
 * 调用契约：
 *
 *     1. 内部维护拾取放置状态机（idle ↔ picked）。
 *     2. 鼠标追踪通过 renderer 的 trackCursor 完成坐标转换。
 *     3. 拖动预览走 preview_engine.previewMoveNode（clone+sync 单通道），
 *        放置碰撞检测委托引擎 composeMoveNode。
 *     4. 碰撞错误通过 notification 暴露供视图消费。
 *     5. 右键返回 true 阻止 mediator 默认 deactivate，由本 handler 内部处理取消。
 */
export function useMoveNodeTool(): ToolHandler {
    const graphStore = useGraphStore()
    const operations = useGraphOperationAdapter()
    const {
        syncFromGraphData,
        getNodePosition,
        addNodeClass,
        removeNodeClass,
        clearAllPreviews,
        trackCursor,
    } = useRenderer()
    const id: ToolId = 'move'

    // ── 命令式变量 ──
    /** 已拾取节点的 ID。 */
    let pickedNodeId: string | null = null

    /** trackCursor 返回的 stop 句柄（handle）。 */
    let stopCursorTracking: { stop(): void } | null = null

    /** 最后已知的模型坐标（用于点击拾取时立即吸附）。已拾取状态下每帧由 trackCursor 更新。 */
    let lastModelPos: { x: number; y: number } | null = null

    // ── 响应式状态 ──
    /** 工具是否激活。 */
    const isActive = ref(false)

    /** 是否已拾取节点（跟随光标中）。 */
    const isPicked = ref(false)

    /** 碰撞通知消息。null 表示无通知。 */
    const collisionMessage = ref<string | null>(null)

    // ── 计算属性 ──
    const cursorClass = computed<string | null>(() => {
        if (!isActive.value) return null
        return !isPicked.value ? 'cursor-crosshair' : null
    })

    const notification = computed<ToolNotification | null>(() => {
        if (!isActive.value || collisionMessage.value === null) return null

        return {
            visible: true,
            message: collisionMessage.value,
            onCancel: cancelPick,
        }
    })

    // ── 生命周期 ──

    /**
     * 说明：
     *
     *     激活工具。进入待拾取状态。
     */
    function activate(): void {
        isActive.value = true
        isPicked.value = false
        pickedNodeId = null
        collisionMessage.value = null
        lastModelPos = null

        stopCursorTracking = trackCursor((modelPos) => {
            // 始终记录最后已知模型坐标（即使未拾取），
            // 用于 onNodeClick 中点击时立即吸附至光标。
            lastModelPos = modelPos

            if (!isPicked.value || pickedNodeId === null) return

            // 拖动预览：整图切到预览图（位置 + 边宽 + 尺寸一次到位）
            applyPreviewMove(modelPos)
        })
    }

    /**
     * 说明：
     *
     *     取消激活工具。
     *
     * 调用契约：
     *
     *     1. 停止光标追踪。
     *     2. 已拾取状态下弹回节点到原位。
     *     3. 清理本工具施加的全部 class。
     *     4. 重置全部状态。
     */
    function deactivate(): void {
        if (stopCursorTracking) {
            stopCursorTracking.stop()
            stopCursorTracking = null
        }

        // cancelPick 内部调 clearAllPreviews('move') + syncFromGraphData(真实GraphData)，
        // 同时覆盖已拾取回退和 class 清理
        if (isPicked.value) {
            cancelPick()
        }

        isActive.value = false
        isPicked.value = false
        pickedNodeId = null
        collisionMessage.value = null
    }

    // ── 画布事件 ──

    /**
     * 说明：
     *
     *     处理节点点击事件。
     *
     * 调用契约：
     *
     *     待拾取 → 进入已拾取：记录 nodeId，节点开始跟随光标。
     *     已拾取 → 放置尝试（与 onCanvasClick 相同行为）。
     */
    function onNodeClick(nodeId: string): void {
        if (!isPicked.value) {
            // ── 进入已拾取 ──

            const pos = getNodePosition(nodeId)
            if (!pos) return

            // 记录已拾取节点（取消时通过切回真实图 sync 恢复）
            pickedNodeId = nodeId
            isPicked.value = true

            // 立即将节点吸附至当前光标位置并渲染预览（利用 trackCursor 持续追踪的最后模型坐标）
            if (lastModelPos) {
                // applyPreviewMove 内部 sync 后重施 move-picked，无需单独加 class
                applyPreviewMove(lastModelPos)
            } else {
                // 无最后坐标（罕见）：仅施加半透明 class，位置不动
                addNodeClass(nodeId, 'move-picked', 'move')
            }
        } else {
            // ── 已拾取 → 放置尝试 ──
            placeAttempt()
        }
    }

    /**
     * 说明：
     *
     *     处理画布空白区域点击事件。
     */
    function onCanvasClick(_pos: { x: number; y: number }): void {
        if (isPicked.value) {
            placeAttempt()
        }
    }

    function applyPreviewMove(pos: NodePosition): void {
        if (!graphStore.graphView || pickedNodeId === null) return

        const { previewGraph, collides } = previewMoveNode(
            graphStore.graphView,
            pickedNodeId as NodeId,
            pos,
        )

        // 整图切换到预览图——sync 清空 class，以下 class 必须在 sync 后重施
        syncFromGraphData(previewGraph)
        addNodeClass(pickedNodeId, 'move-picked', 'move')
        if (collides) {
            addNodeClass(pickedNodeId, 'preview-collision', 'move')
        }
    }

    // ── 取消拾取 ──

    /**
     * 说明：
     *
     *     取消当前拾取，弹回节点到真实图位置。
     *
     * 调用契约：
     *
     *     1. 整图切回真实图（syncFromGraphData）——位置 / 边宽 / class 一次全部恢复。
     *        不再用 resetNodePosition：sync 已同时刷新 renderer 位置记录，
     *        resetNodePosition 只会恢复到最近一次 sync 的预览位置。
     *     2. 清除本工具施加的全部 class（碰撞红、半透明）。
     *     3. 不停止 trackCursor（继续追踪，下次 idle → picked 无需重新绑定）。
     */
    function cancelPick(): void {
        if (pickedNodeId === null) return

        // 弹回：整图切回真实图——位置 / 边宽 / class 由 sync 一次全部恢复
        clearAllPreviews('move')
        if (graphStore.graphView) {
            syncFromGraphData(graphStore.graphView)
        }

        // 重置状态
        pickedNodeId = null
        isPicked.value = false
        collisionMessage.value = null
    }

    // ── 放置尝试 ──

    /**
     * 说明：
     *
     *     在当前光标位置尝试放置节点。
     */
    function placeAttempt(): void {
        if (!graphStore.graphView || pickedNodeId === null) {
            return
        }

        const currentPos = getNodePosition(pickedNodeId)
        if (!currentPos) {
            return
        }

        const desiredPosition = { x: currentPos.x, y: currentPos.y }

        // 调引擎 composeMoveNode 做碰撞检测
        const result = composeMoveNode({
            nodeId: pickedNodeId as NodeId,
            desiredPosition,
            allNodes: graphStore.graphView.nodes,
            nodeRadiusOverrides: computeNodeRadiusOverrides(
                graphStore.graphView,
            ),
        })

        // 有碰撞 → 拒绝放置
        if (hasErrors(result.issues)) {
            // 红色高亮（后续 preview sync 时若无碰撞会自动清除）
            addNodeClass(pickedNodeId, 'preview-collision', 'move')
            // 显示碰撞通知
            collisionMessage.value = '节点在目标位置与已有节点碰撞，无法放置。'
            return
        }

        // 无碰撞 → 写入 GraphData
        const validation = operations.commitToCurrentGraph(result.operations, {
            source: id,
        })

        if (validation.valid) {
            // 清除透明度 preview
            removeNodeClass(pickedNodeId, 'move-picked', 'move')

            // 重置状态
            pickedNodeId = null
            isPicked.value = false
            collisionMessage.value = null
        }
        // validation.valid === false 理论上不可达
        // （compose 已通过的操作 execute 阶段不会失败）——防御性保留
    }

    // ── 公开 API ──

    return {
        id,
        get isActive() {
            return isActive.value
        },
        activate,
        deactivate,
        onNodeClick,
        onCanvasClick,
        get cursorClass() {
            return cursorClass.value
        },
        get notification() {
            return notification.value
        },
    }
}
