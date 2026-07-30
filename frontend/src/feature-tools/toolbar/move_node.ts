/**
 * feature-tools/toolbar/move_node.ts
 *
 * 功能：
 *     移动节点工具处理器。实现拾取放置交互（pick-and-place）。
 *
 * 总体结构：
 *     useMoveNodeTool() → ToolHandler
 *
 * 规则：
 *     1. 两种状态：待拾取（idle）和已拾取（picked）。
 *     2. 待拾取状态下点击节点 → 已拾取，节点跟随光标。
 *     3. 已拾取状态下点击 → 放置尝试。
 *     4. 放置碰撞 → 红色高亮 + notification，保持已拾取。
 *     5. 右键取消拾取 → 弹回原位。
 *     6. 禁止直接修改 GraphData；所有写入通过 graphStore.commitBatchToGraph。
 *     7. 中间位置不写 GraphData，只更新 Cy 视觉层。
 *
 * 外部如何使用：
 *     toolbar/registry.ts 调用 useMoveNodeTool()。
 */

import { ref, computed } from 'vue'

import { useGraphStore } from '@/graph/graph_store'
import { computeNodeRadiusOverrides } from '@/graph/node_radius'
import { hasErrors } from '@/graph/issue_mapper'
import { moveNode as composeMoveNode } from '@my-project/graph-engine'
import { useRenderer } from '@/cytoscape/useRenderer'

import type { NodeId } from '@my-project/graph-engine'

import type { ToolId, ToolHandler, ToolNotification } from '../types'


// ── useMoveNodeTool ──

/**
 * 功能：
 *     创建移动节点工具处理器。
 *
 * 规则：
 *     1. 内部维护拾取放置状态机（idle ↔ picked）。
 *     2. 鼠标追踪通过 renderer 的 trackCursor 完成坐标转换。
 *     3. 碰撞检测委托引擎 composeMoveNode。
 *     4. 碰撞错误通过 notification 暴露供视图消费。
 *     5. 右键返回 true 阻止 mediator 默认 deactivate，由本 handler 内部处理取消。
 */
export function useMoveNodeTool(): ToolHandler {
    const graphStore = useGraphStore()
    const {
        setNodePosition,
        getNodePosition,
        resetNodePosition,
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
     * 功能：
     *     激活工具。进入待拾取状态。
     *
     * 规则：
     *     1. 通过 trackCursor 注册光标追踪（状态守卫仅在 picked 时生效）。
     *     2. 光标通过 cursorClass 暴露为 cursor-crosshair。
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

            // 更新节点位置（仅视觉层）
            setNodePosition(pickedNodeId, modelPos)

            // 实时碰撞检测：每帧跑 composeMoveNode，碰撞即红色高亮。
            // 复杂度 O(n)；节点数 < 100 时 60fps 无压力；数百节点后可能掉帧。
            const graphView = graphStore.graphView
            if (graphView) {
                const collisionResult = composeMoveNode({
                    nodeId: pickedNodeId as NodeId,
                    desiredPosition: modelPos,
                    allNodes: graphView.nodes,
                    nodeRadiusOverrides: computeNodeRadiusOverrides(graphView),
                })
                if (hasErrors(collisionResult.issues)) {
                    addNodeClass(pickedNodeId, 'move-collision', 'move')
                } else {
                    removeNodeClass(pickedNodeId, 'move-collision', 'move')
                }
            }
        })
    }

    /**
     * 功能：
     *     取消激活工具。
     *
     * 规则：
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

        // cancelPick 内部调 resetNodePosition + clearAllPreviews('move')，同时覆盖已拾取回退和 class 清理
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
     * 功能：
     *     处理节点点击事件。
     *
     * 规则：
     *     待拾取 → 进入已拾取：记录 nodeId，节点开始跟随光标。
     *     已拾取 → 放置尝试（与 onCanvasClick 相同行为）。
     */
    function onNodeClick(nodeId: string): void {
        if (!isPicked.value) {
            // ── 进入已拾取 ──

            const pos = getNodePosition(nodeId)
            if (!pos) return

            // 记录已拾取节点（取消时通过 resetNodePosition 恢复至最近一次 sync 记录的位置）
            pickedNodeId = nodeId
            isPicked.value = true

            // 拾取后节点以半透明草稿形式跟随光标（视觉预览）。
            addNodeClass(nodeId, 'move-picked', 'move')

            // 立即将节点吸附至当前光标位置（利用 trackCursor 持续追踪的最后模型坐标）
            if (lastModelPos) {
                setNodePosition(nodeId, lastModelPos)
            }
            return
        }

        // ── 已拾取 → 放置尝试 ──
        placeAttempt()
    }

    /**
     * 功能：
     *     处理画布空白区域点击事件。
     *
     * 规则：
     *     已拾取状态 → 放置尝试（与 onNodeClick 的已拾取分支行为一致）。
     *     待拾取状态 → 无操作（不创建草稿）。
     */
    function onCanvasClick(_pos: { x: number; y: number }): void {
        if (isPicked.value) {
            placeAttempt()
        }
    }

    // ── 取消拾取 ──

    /**
     * 功能：
     *     取消当前拾取，弹回节点到最近一次 syncFromGraphData 记录的位置。
     *
     * 规则：
     *     1. 恢复节点到最近一次 syncFromGraphData 记录的位置（通过 resetNodePosition）。
     *     2. 清除本工具施加的全部 class（碰撞红、半透明）。
     *     3. 回到待拾取（idle）状态。
     *     4. 不停止 trackCursor（继续追踪，下次 idle → picked 无需重新绑定）。
     */
    function cancelPick(): void {
        if (pickedNodeId === null) return

        // 弹回原始位置 + 清除本工具施加的全部 class
        resetNodePosition(pickedNodeId)
        clearAllPreviews('move')

        // 重置状态
        pickedNodeId = null
        isPicked.value = false
        collisionMessage.value = null
    }

    // ── 放置尝试 ──

    /**
     * 功能：
     *     在当前光标位置尝试放置节点。
     *
     * 规则：
     *     1. 读取 Cy 节点当前视觉位置作为 desiredPosition。
     *     2. 调引擎 composeMoveNode 做碰撞检测。
     *     3. 无碰撞 → commitBatchToGraph 写入 GraphData → 回到 idle。
     *     4. 有碰撞 → 节点红色高亮 + notification → 保持 picked（不弹回）。
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
            nodeRadiusOverrides: computeNodeRadiusOverrides(graphStore.graphView),
        })

        // 有碰撞 → 拒绝放置
        if (hasErrors(result.issues)) {
            // 红色高亮（后续 mousemove 会自动清除）
            addNodeClass(pickedNodeId, 'move-collision', 'move')
            // 显示碰撞通知
            collisionMessage.value = '节点在目标位置与已有节点碰撞，无法放置。'
            return
        }

        // 无碰撞 → 写入 GraphData
        const batchResult = graphStore.commitBatchToGraph(
            graphStore.graphView,
            result.operations,
        )

        if (batchResult.validation.valid) {
            // 清除透明度 preview
            removeNodeClass(pickedNodeId, 'move-picked', 'move')

            // 重置状态
            pickedNodeId = null
            isPicked.value = false
            collisionMessage.value = null
        }
        // batchResult.validation.valid === false 理论上不可达
        // （compose 已通过的操作 execute 阶段不会失败）——防御性保留
    }

    // ── 公开 API ──

    return {
        id,
        get isActive() { return isActive.value },
        activate,
        deactivate,
        onNodeClick,
        onCanvasClick,
        get cursorClass() { return cursorClass.value },
        get notification() { return notification.value },
    }
}
