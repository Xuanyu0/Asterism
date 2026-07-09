/**
 * ui_store.ts
 *
 * 功能：
 * 使用 Pinia 管理前端 UI 状态，包括交互模式、按钮选择、浮空窗数据。
 *
 * 总体结构：
 * 1. interactionMode: 当前交互模式
 * 2. selectedCognitionAction / selectedOperationTool: 当前选中的操作
 * 3. pendingAddNode / pendingAddEdge: 待定添加状态
 * 4. floatingWindowData: 浮空窗显示的节点/边数据
 * 5. lastOperationValidation: 最近一次操作校验结果（由 operation_controller 写入）
 *
 * 外部使用方式：
 * import { useUIStore } from '@/ui/ui_store'
 * const uiStore = useUIStore()
 * uiStore.setInteractionMode('cognition')
 */

import { defineStore } from 'pinia'

import type { NodeData, EdgeData, NodeId, EdgeId } from '@my-project/graph-engine'
import type { ValidationResult } from '@my-project/graph-engine'

import type {
    InteractionMode,
    CognitionAction,
    ArrangementAction,
    OperationTool,
    AddTarget,
    PendingAddNodeState,
    PendingAddEdgeState,
} from '@/definitions/types/ui_types'

import type {
    KnowledgeNodeKind,
    EdgeKind,
    EdgeDirection,
} from '@my-project/graph-engine'



/**
 * 功能：
 *     UI Runtime 的状态定义。
 *
 * 规则：
 *     1. 本状态只描述用户当前 UI 意图。
 *     2. 本状态不保存 GraphData。
 *     3. GraphData 修改必须通过 graph_store 完成。
 *     4. UI Runtime 可以随时重建，不影响图谱本体。
 */
export interface UIStoreState {
    interactionMode: InteractionMode
    selectedCognitionAction: CognitionAction | null
    selectedArrangementAction: ArrangementAction | null
    selectedOperationTool: OperationTool | null
    pendingAddTarget: AddTarget | null
    pendingAddNode: PendingAddNodeState
    pendingAddEdge: PendingAddEdgeState
    floatingWindowData: NodeData | EdgeData | null
    lastOperationValidation: ValidationResult | null
    pendingDeleteNodeId: NodeId | null
    pendingDeleteEdgeId: EdgeId | null
}



/**
 * 功能：
 *     创建 UI Store 实例，管理用户交互意图与浮空窗状态。
 *
 * 总体结构：
 *     1. state: UIStoreState — 交互模式、选中工具、待定添加状态、浮空窗数据
 *     2. actions: 交互模式切换、工具选择、添加流程管理、浮空窗操作
 *
 * 规则：
 *     1. 本状态只描述用户当前 UI 意图，不保存 GraphData。
 *     2. GraphData 修改必须通过 graph_store 完成。
 *     3. UI Runtime 可以随时重建，不影响图谱本体。
 *
 * 使用：
 *     import { useUIStore } from '@/ui/ui_store'
 *     const uiStore = useUIStore()
 *     uiStore.setInteractionMode('cognition')
 */
export const useUIStore = defineStore('ui_store', {
    state: (): UIStoreState => ({
    interactionMode: 'cognition',  // 默认为 cognition 模式
    selectedCognitionAction: null,
    selectedArrangementAction: null,
    selectedOperationTool: null,
    pendingAddTarget: null,
    pendingAddNode: {
        kind: null,
    },
    pendingAddEdge: {
        kind: null,
        direction: null,
        sourceNodeId: null,
    },
    floatingWindowData: null,
    lastOperationValidation: null,
    pendingDeleteNodeId: null,
    pendingDeleteEdgeId: null,
    }),

    actions: {
        /**
         * 功能：
         *     切换当前主交互模式。
         *
         * 规则：
         *     1. cognition 与 arrangement 互斥。
         *     2. 切换模式时重置当前操作状态。
         */
        setInteractionMode(mode: InteractionMode) {
            this.interactionMode = mode

            this.selectedCognitionAction = null
            this.selectedArrangementAction = null
            this.selectedOperationTool = null
            this.pendingAddTarget = null

            this.pendingAddNode.kind = null

            this.pendingAddEdge.kind = null
            this.pendingAddEdge.direction = null
            this.pendingAddEdge.sourceNodeId = null

            this.pendingDeleteNodeId = null
            this.pendingDeleteEdgeId = null

            this.lastOperationValidation = null
        },



        /**
         * 功能：
         *     设置当前 Cognition 模式下的认知操作。
         *
         * 规则：
         *     1. 仅在 cognition 模式下有效。
         *     2. 切换操作时清除上一次操作的校验结果。
         */
        selectCognitionAction(actionType: CognitionAction | null) {
            this.selectedCognitionAction = actionType
            this.lastOperationValidation = null
        },

        /**
         * 功能：
         *     设置当前 Arrangement 模式下的布局操作。
         *
         * 规则：
         *     1. 仅在 arrangement 模式下有效。
         *     2. 切换操作时清除上一次操作的校验结果。
         */
        selectArrangementAction(actionType: ArrangementAction | null) {
            this.selectedArrangementAction = actionType
            this.lastOperationValidation = null
        },

        selectOperationTool(tool: OperationTool | null) {
            this.selectedOperationTool = tool
            this.lastOperationValidation = null

            // 切换工具时清理上一工具可能残留的边起点选择
            if (tool !== 'add') {
                this.pendingAddEdge.sourceNodeId = null
            }

            // 切换工具时清理待定删除目标
            if (tool !== 'delete') {
                this.pendingDeleteNodeId = null
                this.pendingDeleteEdgeId = null
            }
        },

        /**
         * 功能：
         *     设置 Add 模式下当前目标。
         *
         * 规则：
         *     1. 仅在 add 工具下有效。
         *     2. node 表示准备添加节点。
         *     3. edge 表示准备添加边。
         */
        setAddTarget(
            target: AddTarget | null
        ) {
            this.pendingAddTarget = target

            this.pendingAddNode.kind = null

            this.pendingAddEdge.kind = null
            this.pendingAddEdge.direction = null
            this.pendingAddEdge.sourceNodeId = null
        },

        /**
         * 功能：
         *     重置 Operation Runtime 状态。
         *
         * 规则：
         *     1. 不影响当前 GraphData。
         *     2. 清空所有待定添加状态。
         */
        resetOperationState() {
            this.selectedOperationTool = null

            this.pendingAddTarget = null

            this.pendingAddNode.kind = null

            this.pendingAddEdge.kind = null
            this.pendingAddEdge.direction = null
            this.pendingAddEdge.sourceNodeId = null

            this.pendingDeleteNodeId = null
            this.pendingDeleteEdgeId = null
        },


        openFloatingWindow(data: NodeData | EdgeData) {
            this.floatingWindowData = data
        },

        closeFloatingWindow() {
            this.floatingWindowData = null
            this.lastOperationValidation = null
        },

        /**
         * 功能：
         *     设置当前准备添加的节点类型。
         *
         * 规则：
         *     1. 仅在 Add Node 流程中有效。
         *     2. 设置后表示用户已经完成节点类型选择。
         */
        selectNodeKind(
            kind: KnowledgeNodeKind | null
        ) {
            this.pendingAddNode.kind = kind
        },

        /**
         * 功能：
         *     设置当前准备添加的边类型。
         *
         * 规则：
         *     1. real 表示实边。
         *     2. virtual 表示虚边。
         *     3. 修改边类型时重置边方向与起点。
         */
        selectEdgeKind(
            kind: EdgeKind | null
        ) {
            this.pendingAddEdge.kind = kind

            this.pendingAddEdge.direction = null
            this.pendingAddEdge.sourceNodeId = null
        },

        /**
         * 功能：
         *     设置当前准备添加的边方向。
         *
         * 规则：
         *     1. 只有确定边类型后才能设置方向。
         *     2. 修改方向时重置起始节点。
         */
        selectEdgeDirection(
            direction: EdgeDirection | null
        ) {
            this.pendingAddEdge.direction = direction

            this.pendingAddEdge.sourceNodeId = null
        },


        /**
         * 功能：
         *     重置当前边添加流程。
         *
         * 规则：
         *     1. 不影响节点添加流程。
         *     2. 清空边相关运行时状态。
         */
        resetPendingEdge() {
            this.pendingAddEdge.kind = null
            this.pendingAddEdge.direction = null
            this.pendingAddEdge.sourceNodeId = null
        },

        /**
         * 功能：
         *     标记待定删除的节点。
         *
         * 规则：
         *     1. 与 pendingDeleteEdgeId 互斥。
         *     2. 供两步删除确认流程使用。
         */
        setPendingDeleteNode(nodeId: NodeId) {
            this.pendingDeleteNodeId = nodeId
            this.pendingDeleteEdgeId = null
        },

        /**
         * 功能：
         *     标记待定删除的边。
         *
         * 规则：
         *     1. 与 pendingDeleteNodeId 互斥。
         *     2. 供两步删除确认流程使用。
         */
        setPendingDeleteEdge(edgeId: EdgeId) {
            this.pendingDeleteEdgeId = edgeId
            this.pendingDeleteNodeId = null
        },

        /**
         * 功能：
         *     清除所有待定删除状态。
         */
        clearPendingDelete() {
            this.pendingDeleteNodeId = null
            this.pendingDeleteEdgeId = null
        },

        /**
         * 功能：
         *
         *     退出当前模式，回到默认模式（cognition）。
         *
         * 规则：
         *
         *     1. 重置所有工具和子选择状态。
         *     2. 将 interactionMode 重置为 'cognition'。
         */
        exitMode() {
            this.resetOperationState()
            this.selectedCognitionAction = null
            this.selectedArrangementAction = null
            this.lastOperationValidation = null
            this.interactionMode = 'cognition'
        },


    },
})
