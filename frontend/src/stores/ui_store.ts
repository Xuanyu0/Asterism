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
import type { GraphOperation } from '@/definations/types/graph_operation_types'
import type { NodeData, EdgeData } from '@/definations/types/graph_types'
import { OperationValidator } from '@/definations/validators/operation_validator'
import type { ValidationResult } from '@/definations/types/validation_types'
import { useGraphStore } from './graph_store'

export interface UIStoreState {
    interactionMode: 'camera' | 'click' // 当前交互模式
    selectedCognitionAction: string | null // 当前选中的认知演化按钮
    selectedOperationAction: string | null // 当前选中的修改/显示按钮
    floatingWindowData: NodeData | EdgeData | null // 浮空窗数据
    lastOperationValidation: ValidationResult | null // 最近一次局部校验结果
}

export const useUIStore = defineStore('ui_store', {
    state: (): UIStoreState => ({
        interactionMode: 'camera',
        selectedCognitionAction: null,
        selectedOperationAction: null,
        floatingWindowData: null,
        lastOperationValidation: null,
    }),

    actions: {
        toggleInteractionMode() {
            this.interactionMode = this.interactionMode === 'camera' ? 'click' : 'camera'
        },

        selectCognitionAction(actionType: string | null) {
            this.selectedCognitionAction = actionType
        },

        selectOperationAction(actionType: string | null) {
            this.selectedOperationAction = actionType
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
