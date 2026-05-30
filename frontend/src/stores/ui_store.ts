/**
 * ui_store.ts
 *
 * 功能：
 * 使用 Pinia 管理前端 UI 状态，包括交互模式、按钮选择、浮空窗数据。
 * 并在用户操作时调用 operation_validator 做局部校验。
 *
 * 总体结构：
 * 1. interactionMode: 当前交互模式（相机 / 点击）
 * 2. selectedCognitionAction: 当前选中的认知演化操作
 * 3. selectedOperationAction: 当前选中的修改/显示操作
 * 4. floatingWindowData: 浮空窗显示的节点/边数据
 * 5. toggleInteractionMode(): 切换交互模式
 * 6. selectCognitionAction()/selectOperationAction(): 选中操作
 * 7. applyFloatingWindowChanges(): 用户点击浮空窗确认修改时调用 operation_validator 校验
 *
 * 外部使用方式：
 * import { useUIStore } from '@/stores/ui_store'
 * const uiStore = useUIStore()
 * uiStore.toggleInteractionMode()
 */

import { defineStore } from 'pinia'
import type { GraphOperation } from '@/definitions/types/graph_operation_types'
import type { NodeData, EdgeData } from '@/definitions/types/graph_types'
import { OperationValidator } from '@/definitions/validators/operation_validator'
import type { ValidationResult } from '@/definitions/types/validation_types'
import { useGraphStore } from './graph_store'

import type {
    InteractionMode,
    CognitionAction,
    OperationTool,
    AddTarget,
    PendingAddNodeState,
    PendingAddEdgeState,
} from '@/definitions/types/ui_types'


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
    selectedOperationTool: OperationTool | null
    pendingAddTarget: AddTarget | null
    pendingAddNode: PendingAddNodeState
    pendingAddEdge: PendingAddEdgeState
    floatingWindowData: NodeData | EdgeData | null
    lastOperationValidation: ValidationResult | null
}



export const useUIStore = defineStore('ui_store', {
    state: (): UIStoreState => ({
    interactionMode: 'cognition',
    selectedCognitionAction: null,
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
    }),

    actions: {
                /**
         * 功能：
         *     切换当前主交互模式。
         *
         * 规则：
         *     1. cognition 与 operation 互斥。
         *     2. 切换模式时重置当前操作状态。
         */
        setInteractionMode(mode: InteractionMode) {
            this.interactionMode = mode

            this.selectedCognitionAction = null
            this.selectedOperationTool = null
            this.pendingAddTarget = null

            this.pendingAddNode.kind = null

            this.pendingAddEdge.kind = null
            this.pendingAddEdge.direction = null
            this.pendingAddEdge.sourceNodeId = null
        },



        selectCognitionAction(actionType: CognitionAction | null) {
            this.selectedCognitionAction = actionType
        },

        selectOperationTool(tool: OperationTool | null) {
            this.selectedOperationTool = tool
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
        },


        openFloatingWindow(data: NodeData | EdgeData) {
            this.floatingWindowData = data
        },

        closeFloatingWindow() {
            this.floatingWindowData = null
            this.lastOperationValidation = null
        },

        /**
         * 用户在浮空窗修改节点/边后点击确认
         */
        applyFloatingWindowChanges(operation: GraphOperation) {
            const graphStore = useGraphStore()

            if (!graphStore.currentGraph) {
                return
            }

            const validationResult = OperationValidator.validateOperation(graphStore.currentGraph, operation)
            this.lastOperationValidation = validationResult

            if (!validationResult.valid) {
                return validationResult // 校验未通过，不修改图
            }

            // 校验通过，执行操作
            graphStore.currentGraph = graphStore.applyOperationToGraph(graphStore.currentGraph, operation)

            // 清空浮空窗
            this.closeFloatingWindow()

            return validationResult
        },
    },
})
