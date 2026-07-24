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
 *     6. 禁止直接修改 GraphData；所有写入通过 graphStore.applyBatchToGraph。
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
import { getCyInstance } from '@/render/use_cytoscape_renderer'

import type { NodeId } from '@my-project/graph-engine'

import type { ToolId, ToolHandler, ToolNotification } from '../types'


// ── useMoveNodeTool ──

/**
 * 功能：
 *     创建移动节点工具处理器。
 *
 * 规则：
 *     1. 内部维护拾取放置状态机（idle ↔ picked）。
 *     2. 鼠标追踪通过 DOM mousemove 事件绑定在 cy.container() 上。
 *     3. 碰撞检测委托引擎 composeMoveNode。
 *     4. 碰撞错误通过 notification 暴露供视图消费。
 *     5. 右键返回 true 阻止 mediator 默认 deactivate，由本 handler 内部处理取消。
 */
export function useMoveNodeTool(): ToolHandler {
    const graphStore = useGraphStore()
    const id: ToolId = 'move'

    // ── 命令式变量 ──
    /** 已拾取节点的 ID。 */
    let pickedNodeId: string | null = null

    /** 已拾取节点的原始位置（用于取消时弹回）。 */
    let originalPosition: { x: number; y: number } | null = null

    /** DOM mousemove 监听函数的引用（仅用于解绑）。 */
    let mousemoveHandler: ((event: MouseEvent) => void) | null = null

    /** 最后已知的鼠标容器坐标（clientX/Y 格式），用于点击时立即吸附。 */
    let lastMouseClientX = 0
    let lastMouseClientY = 0

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
     *     1. 注册 DOM mousemove 监听（状态守卫仅在 picked 时生效）。
     *     2. 光标通过 cursorClass 暴露为 cursor-crosshair。
     */
    function activate(): void {
        isActive.value = true
        isPicked.value = false
        pickedNodeId = null
        originalPosition = null
        collisionMessage.value = null

        bindMousemove()
    }

    /**
     * 功能：
     *     取消激活工具。
     *
     * 规则：
     *     1. 卸载 mousemove 监听。
     *     2. 已拾取状态下弹回节点到原位。
     *     3. 重置全部状态。
     */
    function deactivate(): void {
        unbindMousemove()

        // 已拾取则弹回节点
        if (isPicked.value) {
            cancelPick()
        }

        isActive.value = false
        isPicked.value = false
        pickedNodeId = null
        originalPosition = null
        collisionMessage.value = null
    }

    // ── 画布事件 ──

    /**
     * 功能：
     *     处理节点点击事件。
     *
     * 规则：
     *     待拾取 → 进入已拾取：记录 nodeId + originalPosition，节点开始跟随光标。
     *     已拾取 → 放置尝试（与 onCanvasClick 相同行为）。
     */
    function onNodeClick(nodeId: string): void {
        const cy = getCyInstance()
        if (!cy) return

        if (!isPicked.value) {
            // ── 进入已拾取 ──

            const cyNode = cy.getElementById(nodeId)
            if (cyNode.length === 0) return

            // 记录原始位置
            const pos = cyNode.position()
            originalPosition = { x: pos.x, y: pos.y }

            // 记录已拾取节点
            pickedNodeId = nodeId
            isPicked.value = true

            // 拾取后节点以半透明草稿形式跟随光标（视觉预览）。
            cyNode.style('opacity', 0.4)

            // 立即将节点吸附至当前光标位置（利用 mousemove 监听器持续追踪的最后坐标）
            const container = cy.container()
            if (container && lastMouseClientX !== 0) {
                // 转换坐标系（虽然目前 cy 的 DOMrect 为全屏，留着也可）
                const rect = container.getBoundingClientRect()
                const renderedPos = {
                    x: lastMouseClientX - rect.left,
                    y: lastMouseClientY - rect.top,
                }
                cyNode.position({
                    x: (renderedPos.x - cy.pan().x) / cy.zoom(),
                    y: (renderedPos.y - cy.pan().y) / cy.zoom(),
                })
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

        // ── 鼠标追踪 ──

    /**
     * 功能：
     *     绑定 DOM mousemove 事件到 Cy 容器。
     *
     * 规则：
     *     1. handler 内部按 isPicked 守卫，仅在已拾取状态生效。
     *     2. 每帧将 Cy 节点位置更新至光标位置（仅视觉层，不写 GraphData）。
     *     3. 清除碰撞红色高亮（如有）。
     */
    function bindMousemove(): void {
        const cy = getCyInstance()
        if (!cy) return

        const handler = (event: MouseEvent) => {
            // 始终记录最后已知鼠标位置（即使未拾取），
            // 用于 onNodeClick 中点击时立即吸附至光标。
            lastMouseClientX = event.clientX
            lastMouseClientY = event.clientY

            if (!isPicked.value || pickedNodeId === null) return

            const cyNode = cy.getElementById(pickedNodeId)
            if (cyNode.length === 0) return

            // 转换 DOM 鼠标坐标到 Cy 画布坐标系（考虑 zoom + pan）
            const container = cy.container()
            if (!container) return
            const rect = container.getBoundingClientRect()
            const renderedPos = {
                x: event.clientX - rect.left,
                y: event.clientY - rect.top,
            }
            const modelPos = {
                x: (renderedPos.x - cy.pan().x) / cy.zoom(),
                y: (renderedPos.y - cy.pan().y) / cy.zoom(),
            }

            // 更新节点位置（仅视觉层）
            cyNode.position(modelPos)

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
                    cyNode.addClass('move-collision')
                } else {
                    cyNode.removeClass('move-collision')
                }
            }
        }

        const container = cy.container()
        if (container) {
            container.addEventListener('mousemove', handler)
        }
        mousemoveHandler = handler
    }

    /**
     * 功能：
     *     解绑 DOM mousemove 事件。
     *
     * 规则：
     *     1. deactivate() 和取消拾取时必须调用。
     *     2. handler 引用为 null 时静默返回。
     */
    function unbindMousemove(): void {
        if (mousemoveHandler === null) return

        const cy = getCyInstance()
        if (cy) {
            const container = cy.container()
            if (container) {
                container.removeEventListener('mousemove', mousemoveHandler)
            }
        }

        mousemoveHandler = null
    }

    // ── 取消拾取 ──

    /**
     * 功能：
     *     取消当前拾取，弹回节点到原始位置。
     *
     * 规则：
     *     1. 清除碰撞高亮。
     *     2. 清除碰撞通知。
     *     3. 回到待拾取（idle）状态。
     *     4. 不卸载 mousemove 监听（继续监听，下次 idle → picked 无需重新绑定）。
     */
    function cancelPick(): void {
        if (pickedNodeId === null || originalPosition === null) return

        const cy = getCyInstance()
        if (cy) {
            const cyNode = cy.getElementById(pickedNodeId)
            if (cyNode.length > 0) {
                // 弹回原始位置 + 清除碰撞高亮 + 恢复透明度
                cyNode.position(originalPosition)
                cyNode.removeClass('move-collision')
                cyNode.style('opacity', '')
            }
        }

        // 重置状态
        pickedNodeId = null
        originalPosition = null
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
     *     3. 无碰撞 → applyBatchToGraph 写入 GraphData → 回到 idle。
     *     4. 有碰撞 → 节点红色高亮 + notification → 保持 picked（不弹回）。
     */
    function placeAttempt(): void {
        if (!graphStore.graphView || pickedNodeId === null) return

        const cy = getCyInstance()
        if (!cy) return

        const cyNode = cy.getElementById(pickedNodeId)
        if (cyNode.length === 0) return

        // 获取当前视觉位置
        const currentPos = cyNode.position()
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
            cyNode.addClass('move-collision')
            // 显示碰撞通知
            collisionMessage.value = '节点在目标位置与已有节点碰撞，无法放置。'
            return
        }

        // 无碰撞 → 写入 GraphData
        const batchResult = graphStore.applyBatchToGraph(
            graphStore.graphView,
            result.operations,
        )

        if (batchResult.validation.valid) {
            // 清除 opacity override，回退到样式表默认不透明
            cyNode.removeStyle('opacity')

            // 重置状态
            pickedNodeId = null
            originalPosition = null
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
