/**
 * operation_controller.ts
 *
 * 功能：
 *
 *     纯 UI 适配层。负责交互模式管理和认知/布局操作事件路由。
 *     工具栏工具事件已由 tools/tool_mediator 接管。
 *     不调引擎 compose、不调 graphStore.applyBatch——所有图操作委托给 graph_operations。
 *
 * 总体结构：
 *
 *     1. 语义事件 Payload 定义
 *     2. useOperationController()：
 *        - 模式切换  — enterCognitionMode / enterArrangementMode
 *        - 认知操作选择  — selectCognitionAction / selectArrangementAction
 *        - 事件分派  — handleNodeClicked / handleEdgeClicked
 *        - 画布定位请求  — requestCanvasFocus / clearCanvasFocus
 *
 * 规则：
 *
 *     1. 可以读取 ui_store。
 *     2. 禁止直接修改 GraphData。
 *     3. 禁止操作 Cytoscape 实例。
 *     4. 所有图操作委托给 graph_operations。
 *
 * 外部如何使用：
 *
 *     Graph.vue、GraphNodeWindow.vue、GraphModeSelector.vue、
 *     GraphNavigationCard.vue 调用本文件。
 */

import type {
    NodeId,
    EdgeId,
    GraphPosition,
} from '@my-project/graph-engine'
import type { CognitionAction, ArrangementAction } from '@/types/ui_types'

import { useGraphStore } from '@/graph/graph_store'
import { useUIStore } from '@/ui/ui_store'

import { useGraphOperations } from '@/graph/graph_operations'


// ── 语义事件 Payload ──

/**
 * 功能：
 *
 *     画布点击语义事件。
 *
 * 规则：
 *
 *     1. 坐标来自 Cytoscape 交互适配层。
 */
export type CanvasClickedPayload = GraphPosition

/**
 * 功能：
 *
 *     节点点击语义事件。
 *
 * 规则：
 *
 *     1. 只表达用户点击了哪个节点。
 *     2. 不携带 Cytoscape 原始事件。
 */
export interface NodeClickedPayload {
    nodeId: NodeId
}

/**
 * 功能：
 *
 *     边点击语义事件。
 *
 * 规则：
 *
 *     1. 只表达用户点击了哪条边。
 *     2. 不携带 Cytoscape 原始事件。
 */
export interface EdgeClickedPayload {
    edgeId: EdgeId
}


// ── useOperationController ──

/**
 * 功能：
 *
 *     提供 UI 操作控制器——交互模式/认知操作状态管理。
 *     工具栏工具事件已由 tools/tool_mediator 接管。
 *
 * 规则：
 *
 *     1. 可以读取 ui_store。
 *     2. 禁止直接修改 GraphData。
 *     3. 禁止操作 Cytoscape 实例。
 *     4. 所有图操作委托给 graph_operations。
 *
 * 使用：
 *
 *     const controller = useOperationController()
 *     controller.enterCognitionMode()
 *     controller.handleNodeClicked({ nodeId: '...' })
 */
export function useOperationController() {
    const graphStore = useGraphStore()
    const uiStore = useUIStore()
    const ops = useGraphOperations()

    // ── 模式入口 ──

    function enterCognitionMode(): void {
        uiStore.setInteractionMode('cognition')
    }

    function enterArrangementMode(): void {
        uiStore.setInteractionMode('arrangement')
    }

    // ── 认知操作选择 ──

    function selectCognitionAction(action: CognitionAction | null): void {
        uiStore.selectCognitionAction(action)
    }

    function selectArrangementAction(action: ArrangementAction | null): void {
        uiStore.selectArrangementAction(action)
    }

    // ── 事件分派 ──

    /**
     * 功能：
     *
     *     处理节点点击——认知操作分派或打开浮空窗。
     *     工具栏工具事件由 router 转发。
     *
     * 规则：
     *
     *     1. 认知操作优先：deconstruct → 执行解构并清除选中。
     *     2. 无激活认知操作 → 打开节点编辑浮空窗。
     */
    function handleNodeClicked(
        payload: NodeClickedPayload,
    ): void {
        // 认知操作优先——用户先点了工具栏的 Deconstruct，再点击节点
        if (uiStore.selectedCognitionAction === 'deconstruct') {
            ops.deconstruct(payload.nodeId)
            uiStore.selectCognitionAction(null)
            return
        }

        // 无工具/认知操作 → 打开浮空窗
        const node = graphStore.graphView?.nodes.find(node => node.id === payload.nodeId)
        if (node) {
            uiStore.openFloatingWindow(node)
        }
    }

    /**
     * 功能：
     *
     *     处理边点击——打开浮空窗。工具栏工具事件由 router 转发。
     */
    function handleEdgeClicked(
        payload: EdgeClickedPayload,
    ): void {
        const edge = graphStore.graphView?.edges.find(potentialEdge => potentialEdge.id === payload.edgeId)
        if (edge) {
            uiStore.openFloatingWindow(edge)
        }
    }

    // ── 画布定位请求 ──

    /**
     * 功能：
     *
     *     请求画布视口定位到指定元素（节点/边）。
     *     意图写入 ui_store，由 Graph.vue 消费并交给 renderer 执行。
     *
     * 参数：
     *
     *     targetId — 目标节点/边的 ID，与渲染元素的 id 一致。
     */
    function requestCanvasFocus(targetId: string): void {
        uiStore.requestCanvasFocus(targetId)
    }

    /**
     * 功能：
     *
     *     清除画布定位请求。由消费方（Graph.vue）在执行后调用。
     */
    function clearCanvasFocus(): void {
        uiStore.clearCanvasFocus()
    }

    // ── 公开 API ──

    return {
        // 模式入口
        enterCognitionMode,
        enterArrangementMode,
        // 认知操作选择
        selectCognitionAction,
        selectArrangementAction,
        // 认知操作
        explore: ops.explore,
        unearth: ops.unearth,
        deconstruct: ops.deconstruct,
        induce: ops.induce,
        internalize: ops.internalize,
        diverge: ops.diverge,
        // 布局操作
        moveNode: ops.moveNode,
        // 交互事件
        handleNodeClicked,
        handleEdgeClicked,
        // 画布定位请求
        requestCanvasFocus,
        clearCanvasFocus,
        // 浮空窗编辑
        confirmExistingNodeEdit: ops.confirmExistingNodeEdit,
        confirmExistingEdgeEdit: ops.confirmExistingEdgeEdit,
        closeFloatingWindow: ops.closeFloatingWindow,

        /**
         * 只读 UI 状态通道。包含 uiStore 的全部可读字段。
         *
         * 规则：
         *
         *     1. 组件读取 UI 状态必须通过 `controller.ui.state.xxx`。
         *     2. 禁止通过本通道执行 uiStore 的写操作（setInteractionMode 等）。
         *     3. 所有 UI 状态写入必须调用 controller 的公开方法。
         *
         * 注意：
         *
         *     本约束是架构规约而非编译器保护——
         *     组件层仍可直接 import { useUIStore } 绕过。
         *     ui.state 是在代码中做视觉提醒，不是安全屏障。
         */
        ui: {
            state: uiStore,
        },
    }
}
