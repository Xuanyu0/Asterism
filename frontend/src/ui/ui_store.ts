/**
 * ui_store.ts
 *
 * 功能：
 * 使用 Pinia 管理前端 UI 状态，包括交互模式、模式子工具选择、浮空窗数据。
 *
 * 总体结构：
 * 1. interactionMode: 当前交互模式
 * 2. selectedCognitionAction / selectedArrangementAction: 模式子工具选择
 * 3. floatingWindowData: 浮空窗显示的节点/边数据
 *
 * 外部使用方式：
 * import { useUIStore } from '@/ui/ui_store'
 * const uiStore = useUIStore()
 * uiStore.setInteractionMode('cognition')
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { NodeData, EdgeData } from '@my-project/graph-engine'

import type {
    InteractionMode,
    CognitionAction,
    ArrangementAction,
} from '@/types/ui_types'

import { useGraphStore } from '@/graph/graph_store'

/**
 * 功能：
 *     创建 UI Store 实例，管理用户交互意图与浮空窗状态。
 *
 * 总体结构：
 *     1. 状态: UIStoreState — 交互模式、模式子工具选择、浮空窗数据
 *     2. API: 交互模式切换、子工具选择、浮空窗操作
 *
 * 规则：
 *     1. 本状态只描述用户当前 UI 意图，不保存 GraphData。
 *
 * 使用：
 *     import { useUIStore } from '@/ui/ui_store'
 *     const uiStore = useUIStore()
 *     uiStore.setInteractionMode('cognition')
 */
export const useUIStore = defineStore('ui_store', () => {
    const interactionMode = ref<InteractionMode>('cognition')
    
    const selectedCognitionAction = ref<CognitionAction | null>(null)
    const selectedArrangementAction = ref<ArrangementAction | null>(null)
    const floatingWindowData = ref<NodeData | EdgeData | null>(null)

    /**
     * 功能：
     *     切换当前主交互模式。
     *
     * 规则：
     *     1. cognition 与 arrangement 互斥。
     *     2. 切换模式时重置当前操作状态。
     */
    function setInteractionMode(mode: InteractionMode) {
        useGraphStore().clearValidationResult()

        interactionMode.value = mode

        selectedCognitionAction.value = null
        selectedArrangementAction.value = null
    }

    /**
     * 功能：
     *     设置当前 Cognition 模式下的认知操作。
     *
     * 规则：
     *     1. 仅在 cognition 模式下有效。
     *     2. 切换操作时清除上一次操作的校验结果。
     */
    function selectCognitionAction(actionType: CognitionAction | null) {
        useGraphStore().clearValidationResult()

        selectedCognitionAction.value = actionType
    }

    /**
     * 功能：
     *     设置当前 Arrangement 模式下的布局操作。
     *
     * 规则：
     *     1. 仅在 arrangement 模式下有效。
     *     2. 切换操作时清除上一次操作的校验结果。
     */
    function selectArrangementAction(actionType: ArrangementAction | null) {
        useGraphStore().clearValidationResult()

        selectedArrangementAction.value = actionType
    }

    function openFloatingWindow(data: NodeData | EdgeData) {
        floatingWindowData.value = data
    }

    function closeFloatingWindow() {
        useGraphStore().clearValidationResult()

        floatingWindowData.value = null
    }

    return {
        interactionMode,
        selectedCognitionAction,
        selectedArrangementAction,
        floatingWindowData,
        setInteractionMode,
        selectCognitionAction,
        selectArrangementAction,
        openFloatingWindow,
        closeFloatingWindow,
    }
})
