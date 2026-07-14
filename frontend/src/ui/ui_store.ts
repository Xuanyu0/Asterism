/**
 * ui_store.ts
 *
 * 功能：
 * 使用 Pinia 管理前端 UI 状态，包括交互模式、按钮选择、浮空窗数据。
 *
 * 总体结构：
 * 1. interactionMode: 当前交互模式
 * 2. selectedCognitionAction / selectedOperationTool: 当前选中的操作
 * 3. operationRuntime: 操作运行时中间状态（边添加起点、删除待定目标）
 * 4. floatingWindowData: 浮空窗显示的节点/边数据
 *
 * 外部使用方式：
 * import { useUIStore } from '@/ui/ui_store'
 * const uiStore = useUIStore()
 * uiStore.setInteractionMode('cognition')
 */

import { defineStore } from 'pinia'

import type { NodeData, EdgeData, NodeId, EdgeId } from '@my-project/graph-engine'

import type {
    InteractionMode,
    CognitionAction,
    ArrangementAction,
    OperationTool,
    OperationRuntimeState,
} from '@/definitions/types/ui_types'

import { useGraphStore } from '@/graph/graph_store'



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
    operationRuntime: OperationRuntimeState
    floatingWindowData: NodeData | EdgeData | null
}



/**
 * 功能：
 *     创建 UI Store 实例，管理用户交互意图与浮空窗状态。
 *
 * 总体结构：
 *     1. state: UIStoreState — 交互模式、选中工具、运行时状态、浮空窗数据
 *     2. actions: 交互模式切换、工具选择、运行时管理、浮空窗操作
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
    operationRuntime: {
        addEdgeSourceNodeId: null,
        pendingDeleteNodeId: null,
        pendingDeleteEdgeId: null,
    },
    floatingWindowData: null,
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
            useGraphStore().clearValidationResult()

            this.interactionMode = mode

            this.selectedCognitionAction = null
            this.selectedArrangementAction = null
            this.selectedOperationTool = null
            this.operationRuntime = {
                addEdgeSourceNodeId: null,
                pendingDeleteNodeId: null,
                pendingDeleteEdgeId: null,
            }
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
            useGraphStore().clearValidationResult()

            this.selectedCognitionAction = actionType
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
            useGraphStore().clearValidationResult()

            this.selectedArrangementAction = actionType
        },

        selectOperationTool(tool: OperationTool | null) {
            useGraphStore().clearValidationResult()

            this.selectedOperationTool = tool

            // 切换工具时整体复位运行态
            this.operationRuntime = {
                addEdgeSourceNodeId: null,
                pendingDeleteNodeId: null,
                pendingDeleteEdgeId: null,
            }
        },

        /**
         * 功能：
         *     重置 Operation Runtime 状态。
         *
         * 规则：
         *     1. 不影响当前 GraphData。
         *     2. 清空工具选择与运行态。
         */
        resetOperationState() {
            this.selectedOperationTool = null

            this.operationRuntime = {
                addEdgeSourceNodeId: null,
                pendingDeleteNodeId: null,
                pendingDeleteEdgeId: null,
            }
        },


        openFloatingWindow(data: NodeData | EdgeData) {
            this.floatingWindowData = data
        },

        closeFloatingWindow() {
            useGraphStore().clearValidationResult()

            this.floatingWindowData = null
        },

        /**
         * 功能：
         *     重置当前边添加流程。
         *
         * 规则：
         *     1. 不影响当前工具选择（kind/direction 由工具编码）。
         *     2. 只清空边起点节点 ID。
         */
        resetPendingEdge() {
            this.operationRuntime.addEdgeSourceNodeId = null
        },

        /**
         * 功能：
         *     标记待定删除的节点。
         *
         * 规则：
         *     1. 与 operationRuntime.pendingDeleteEdgeId 互斥。
         *     2. 供两步删除确认流程使用。
         */
        setPendingDeleteNode(nodeId: NodeId) {
            this.operationRuntime.pendingDeleteNodeId = nodeId
            this.operationRuntime.pendingDeleteEdgeId = null
        },

        /**
         * 功能：
         *     标记待定删除的边。
         *
         * 规则：
         *     1. 与 operationRuntime.pendingDeleteNodeId 互斥。
         *     2. 供两步删除确认流程使用。
         */
        setPendingDeleteEdge(edgeId: EdgeId) {
            this.operationRuntime.pendingDeleteEdgeId = edgeId
            this.operationRuntime.pendingDeleteNodeId = null
        },

        /**
         * 功能：
         *     清除所有待定删除状态。
         */
        clearPendingDelete() {
            this.operationRuntime.pendingDeleteNodeId = null
            this.operationRuntime.pendingDeleteEdgeId = null
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
            useGraphStore().clearValidationResult()

            this.resetOperationState()
            this.selectedCognitionAction = null
            this.selectedArrangementAction = null
            this.interactionMode = 'cognition'
        },


    },
})
