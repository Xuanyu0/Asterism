/**
 * operation_controller.ts
 *
 * 功能：
 *
 *     纯 UI 适配层。负责交互模式/工具状态管理和语义事件路由。
 *     不调引擎 compose、不调 graphStore.applyBatch——所有图操作委托给 graph_operations。
 *
 * 总体结构：
 *
 *     1. 语义事件 Payload 定义
 *     2. useOperationController()：
 *        - 模式切换  — enterCognitionMode / enterArrangementMode
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
 *     Graph.vue、GraphNodeWindow.vue、GraphOperationToolbar.vue 和 GraphModeSelector.vue 调用本文件。
 */

import type {
    NodeId,
    EdgeId,
    GraphPosition,
} from '@my-project/graph-engine'
import type { OperationTool, AddTarget, CognitionAction, ArrangementAction } from '@/definitions/types/ui_types'
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

    // ── 认知操作选择 ──

    function selectCognitionAction(action: CognitionAction | null): void {
        uiStore.selectCognitionAction(action)
    }

    function selectArrangementAction(action: ArrangementAction | null): void {
        uiStore.selectArrangementAction(action)
    }

    // ── 右键 ──

    /**
     * 功能：
     *
     *     处理画布区域右键点击。
     *
     * 规则：
     *
     *     仅取消当前所选操作、放弃所有草稿编辑。不改变交互模式。
     */
    function handleRightClick(): void {
        // 清工具
        if (uiStore.selectedOperationTool !== null) {
            uiStore.resetOperationState()
        }

        // 清待定状态
        uiStore.clearPendingDelete()

        // 清草稿
        draftStore.clearDraftNode()

        // 清认知操作选中
        if (uiStore.selectedCognitionAction !== null) {
            uiStore.selectCognitionAction(null)
        }

        // 清布局操作选中
        if (uiStore.selectedArrangementAction !== null) {
            uiStore.selectArrangementAction(null)
        }
    }

    // ── 事件分派 ──

    /**
     * 功能：
     *
     *     处理画布点击——根据当前激活工具路由到对应操作。
     *
     * 规则：
     *
     *     1. 添加节点工具 + kind 已确定 → 创建 DraftNode。
     *     2. 删除工具 → 清除待定删除目标。
     *     3. 其他工具或无工具 → 忽略。
     */
    function handleCanvasClicked(
        payload: CanvasClickedPayload,
    ): void {
        // 删除模式：点击空白取消待定
        if (uiStore.selectedOperationTool === 'delete') {
            uiStore.clearPendingDelete()
            return
        }

        // 添加节点模式：创建 DraftNode
        if (uiStore.selectedOperationTool === 'add'
            && uiStore.pendingAddTarget === 'node'
            && uiStore.pendingAddNode.kind
        ) {
            draftStore.createDraftNode(
                uiStore.pendingAddNode.kind,
                payload.x,
                payload.y,
            )
        }
    }

    /**
     * 功能：
     *
     *     处理节点点击——根据当前激活工具或认知操作分派，无工具时打开浮空窗。
     *
     * 规则：
     *
     *     1. 认知操作优先：deconstruct → 执行解构并清除选中。
     *     2. Add 工具 → 委托 ops.targetNodeForEdge（添加边流程）。
     *     3. Delete 工具 → 委托 ops.targetNodeForDelete（删除两步确认）。
     *     4. Fold 工具 → 委托 ops.toggleFold。
     *     5. 无激活工具 → 打开节点编辑浮空窗。
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

        const tool = uiStore.selectedOperationTool

        switch (tool) {
            case 'add': {
                ops.targetNodeForEdge(payload.nodeId)
                return
            }

            case 'delete': {
                ops.targetNodeForDelete(payload.nodeId)
                return
            }

            case 'fold': {
                ops.toggleFold(payload.nodeId)
                return
            }

            default: {
                const node = graphStore.graphView?.nodes.find(node => node.id === payload.nodeId)
                if (node) {
                    uiStore.openFloatingWindow(node)
                }
            }
        }
    }

    /**
     * 功能：
     *
     *     处理边点击——根据当前激活工具分派，无工具时打开浮空窗。
     *
     * 规则：
     *
     *     1. Delete 工具 → 委托 ops.targetEdgeForDelete（删除两步确认）。
     *     2. 其他或无工具 → 打开边编辑浮空窗。
     */
    function handleEdgeClicked(
        payload: EdgeClickedPayload,
    ): void {
        if (uiStore.selectedOperationTool === 'delete') {
            ops.targetEdgeForDelete(payload.edgeId)
            return
        }

        const edge = graphStore.graphView?.edges.find(potentialEdge => potentialEdge.id === payload.edgeId)
        if (edge) {
            uiStore.openFloatingWindow(edge)
        }
    }

    // ── 公开 API ──

    return {
        // 模式入口
        enterCognitionMode,
        enterArrangementMode,
        // 工具选择
        selectOperationTool,
        selectAddTarget,
        selectAddNodeKind,
        selectAddEdgeKind,
        selectAddEdgeDirection,
        resetOperationTool,
        selectCognitionAction,
        selectArrangementAction,
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
