/**
 * operation_controller.ts
 *
 * 功能：
 *
 *     纯 UI 适配层。负责交互模式/工具状态管理和语义事件路由。
 *     不调引擎 compose、不调 graphStore.applyOperation——所有图操作委托给 graph_operations。
 *
 * 总体结构：
 *
 *     1. 语义事件 Payload 定义
 *     2. useOperationController()：
 *        - 模式切换  — enterOperationMode / enterCognitionMode / enterArrangementMode / exitMode
 *        - 工具选择  — selectOperationTool / selectAddTarget / selectAddNodeKind 等
 *        - 右键退出  — handleRightClick
 *        - 事件分派  — handleCanvasClicked / handleNodeClicked / handleEdgeClicked
 *
 * 规则：
 *
 *     1. 可以读取 ui_store 与 draft_store。
 *     2. 禁止直接修改 GraphData。
 *     3. 禁止操作 Cytoscape 实例。
 *     4. 所有图操作委托给 graph_operations。
 *
 * 外部如何使用：
 *
 *     KnowledgeGraph.vue、NodeWindow.vue、OperationToolbar.vue 调用本文件。
 */

import type {
    NodeId,
    EdgeId,
    GraphPosition,
} from '@my-project/graph-engine'
import type { OperationTool, AddTarget } from '@/definitions/types/ui_types'
import type { EdgeKind, EdgeDirection } from '@my-project/graph-engine'
import type { KnowledgeNodeKind } from '@my-project/graph-engine'

import { useGraphStore } from '@/graph/graph_store'
import { useUIStore } from '@/ui/ui_store'
import { useDraftStore } from '@/ui/draft_store'

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
 *     2. 是否创建 DraftNode 由当前 UI Runtime 状态决定。
 */
export interface CanvasClickedPayload extends GraphPosition {

}

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
 *     提供 UI 操作控制器——交互模式/工具状态管理和语义事件路由。
 *
 * 规则：
 *
 *     1. 可以读取 ui_store 与 draft_store。
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
    const draftStore = useDraftStore()
    const ops = useGraphOperations()

    // ── 模式入口 ──

    function enterOperationMode(): void {
        uiStore.setInteractionMode('operation')
    }

    function enterCognitionMode(): void {
        uiStore.setInteractionMode('cognition')
    }

    function enterArrangementMode(): void {
        uiStore.setInteractionMode('arrangement')
    }

    // ── 工具选择 ──

    function selectOperationTool(tool: OperationTool | null): void {
        uiStore.selectOperationTool(tool)
    }

    function selectAddTarget(target: AddTarget | null): void {
        uiStore.setAddTarget(target)
    }

    function selectAddNodeKind(kind: KnowledgeNodeKind | null): void {
        uiStore.selectNodeKind(kind)
    }

    function selectAddEdgeKind(kind: EdgeKind | null): void {
        uiStore.selectEdgeKind(kind)
    }

    function selectAddEdgeDirection(direction: EdgeDirection | null): void {
        uiStore.selectEdgeDirection(direction)
    }

    function resetOperationTool(): void {
        uiStore.resetOperationState()
    }

    function exitMode(): void {
        uiStore.exitMode()
    }

    // ── 右键 ──

    /**
     * 功能：
     *
     *     处理画布区域右键点击。
     *
     * 规则：
     *
     *     两级退出：
     *     1. 有激活工具 → 清工具，保留模式（第一层）。
     *     2. 无激活工具 → 退出模式（第二层）。
     */
    function handleRightClick(): void {
        const mode = uiStore.interactionMode

        if (mode === null) {
            return
        }

        if (mode === 'operation') {
            if (uiStore.selectedOperationTool !== null) {
                uiStore.resetOperationState()
                return
            }
            uiStore.exitMode()
            return
        }

        if (mode === 'cognition') {
            if (uiStore.selectedCognitionAction !== null) {
                uiStore.selectCognitionAction(null)
                return
            }
            uiStore.exitMode()
            return
        }

        if (mode === 'arrangement') {
            uiStore.exitMode()
        }
    }

    // ── 事件分派 ──

    /**
     * 功能：
     *
     *     处理画布点击——根据当前 UI 状态路由到对应操作。
     *
     * 规则：
     *
     *     1. 仅在 Operation / Add / Node / kind 已确定时创建 DraftNode。
     *     2. 在 Delete 模式下，点击空白画布清除待定删除目标。
     */
    function handleCanvasClicked(
        payload: CanvasClickedPayload,
    ): void {
        if (uiStore.interactionMode === 'operation' && uiStore.selectedOperationTool === 'delete') {
            uiStore.clearPendingDelete()
            return
        }

        if (uiStore.interactionMode !== 'operation') {
            return
        }

        if (uiStore.selectedOperationTool !== 'add') {
            return
        }

        if (uiStore.pendingAddTarget !== 'node') {
            return
        }

        if (!uiStore.pendingAddNode.kind) {
            return
        }

        draftStore.createDraftNode(
            uiStore.pendingAddNode.kind,
            payload.x,
            payload.y,
        )
    }

    /**
     * 功能：
     *
     *     处理节点点击——根据当前 UI 状态上下文感知分派。
     *
     * 规则：
     *
     *     1. 默认模式（无激活工具）→ 打开节点编辑浮空窗。
     *     2. Add + Edge 模式 → 委托 ops.targetNodeForEdge。
     *     3. Delete 模式 → 委托 ops.targetNodeForDelete。
     *     4. Fold 模式 → 委托 ops.toggleFold。
     */
    function handleNodeClicked(
        payload: NodeClickedPayload,
    ): void {
        const mode = uiStore.interactionMode
        const tool = uiStore.selectedOperationTool

        if (mode !== 'operation' || !tool) {
            const node = graphStore.currentGraph?.nodes.find(node => node.id === payload.nodeId)
            if (node) {
                uiStore.openFloatingWindow(node)
            }
            return
        }

        switch (tool) {
            case 'add': {
                ops.targetNodeForEdge(payload.nodeId)
                break
            }

            case 'delete': {
                ops.targetNodeForDelete(payload.nodeId)
                break
            }

            case 'fold': {
                ops.toggleFold(payload.nodeId)
                break
            }
        }
    }

    /**
     * 功能：
     *
     *     处理边点击——根据当前 UI 状态上下文感知分派。
     *
     * 规则：
     *
     *     1. Delete 模式 → 委托 ops.targetEdgeForDelete。
     *     2. 默认模式 → 打开边编辑浮空窗。
     */
    function handleEdgeClicked(
        payload: EdgeClickedPayload,
    ): void {
        if (uiStore.interactionMode === 'operation' && uiStore.selectedOperationTool === 'delete') {
            ops.targetEdgeForDelete(payload.edgeId)
            return
        }

        const edge = graphStore.currentGraph?.edges.find(potentialEdge => potentialEdge.id === payload.edgeId)
        if (edge) {
            uiStore.openFloatingWindow(edge)
        }
    }

    // ── 公开 API ──

    return {
        // 模式入口
        enterOperationMode,
        enterCognitionMode,
        enterArrangementMode,
        // 工具选择
        selectOperationTool,
        selectAddTarget,
        selectAddNodeKind,
        selectAddEdgeKind,
        selectAddEdgeDirection,
        resetOperationTool,
        exitMode,
        // 右键
        handleRightClick,
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
        handleCanvasClicked,
        handleNodeClicked,
        handleEdgeClicked,
        // DraftNode 生命周期
        updateDraftNode: ops.updateDraftNode,
        cancelDraftNode: ops.cancelDraftNode,
        confirmDraftNode: ops.confirmDraftNode,
        // 浮空窗编辑
        confirmExistingNodeEdit: ops.confirmExistingNodeEdit,
        confirmExistingEdgeEdit: ops.confirmExistingEdgeEdit,
        closeFloatingWindow: ops.closeFloatingWindow,
        // 删除
        confirmDelete: ops.confirmDelete,
        cancelDelete: ops.cancelDelete,

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
