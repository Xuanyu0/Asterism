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
 * 4. pendingCanvasFocusId: 画布视口定位请求（写入 → Graph.vue 消费 → 清除）
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

    /**
     * 功能：
     *
     *     画布视口定位请求。这是一笔一次性 UI 意图：
     *     写入目标元素 ID → Graph.vue 监听并交给 renderer 执行 → 清除回 null。
     *
     * 规则：
     *
     *     1. 只表达"用户想让视口移到某元素"的意图，不携带任何 Cytoscape 对象。
     *     2. 消费后必须清除（clearCanvasFocus），保证同一元素可重复定位。
     */
    const pendingCanvasFocusId = ref<string | null>(null)

    /**
     * 功能：
     *
     *     发起画布定位请求。
     *
     * 参数：
     *
     *     targetId — 目标节点/边的 ID，与渲染元素的 id 一致。
     */
    function requestCanvasFocus(targetId: string) {
        pendingCanvasFocusId.value = targetId
    }

    /**
     * 功能：
     *
     *     清除画布定位请求。由消费方（Graph.vue）在执行后调用。
     */
    function clearCanvasFocus() {
        pendingCanvasFocusId.value = null
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
        pendingCanvasFocusId,
        requestCanvasFocus,
        clearCanvasFocus,
    }
})
