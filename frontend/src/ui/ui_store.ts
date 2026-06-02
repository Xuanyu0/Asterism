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
 * 5. applyFloatingWindowChanges(): 用户确认浮空窗修改，经 graph_store.applyOperation() 执行
 *
 * 外部使用方式：
 * import { useUIStore } from '@/ui/ui_store'
 * const uiStore = useUIStore()
 * uiStore.setInteractionMode('operation')
 */

import { defineStore } from 'pinia'

import type { GraphOperation } from '@/definitions/types/graph_operation_types'
import type { NodeData, EdgeData } from '@/definitions/types/graph_types'
import type { ValidationResult } from '@/definitions/types/validation_types'

import type {
    InteractionMode,
    CognitionAction,
    OperationTool,
    AddTarget,
    PendingAddNodeState,
    PendingAddEdgeState,
} from '@/definitions/types/ui_types'

import type {
    NodeKind,
    EdgeKind,
    EdgeDirection,
} from '@/definitions/types/graph_types'

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
    selectedOperationTool: OperationTool | null
    pendingAddTarget: AddTarget | null
    pendingAddNode: PendingAddNodeState
    pendingAddEdge: PendingAddEdgeState
    floatingWindowData: NodeData | EdgeData | null
    lastOperationValidation: ValidationResult | null
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
 *     uiStore.setInteractionMode('operation')
 */
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
         * 功能：
         *     用户在浮空窗修改节点/边后点击确认，经 graph_store.applyOperation() 执行。
         *
         * 规则：
         *     1. 校验和执行全部交给 graph_store.applyOperation()。
         *     2. 校验通过后自动关闭浮空窗。
         *     3. 本函数不直接修改 GraphData。
         *
         * 使用：
         *     NodeWindow.vue 中调用。
         */
        applyFloatingWindowChanges(operation: GraphOperation) {
            const graphStore = useGraphStore()

            if (!graphStore.currentGraph) {
                return
            }

            const result = graphStore.applyOperation(operation)
            this.lastOperationValidation = result

            if (result.valid) {
                this.closeFloatingWindow()
            }

            return result
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
            kind: NodeKind | null
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



    },
})
