/**
 * ui_store.ts
 *
 * 功能：
 *
 *     使用 Pinia 管理前端 UI 纯展示状态（画布视口定位）。
 *     工具激活状态已由 feature-tools/mediator 统一管理；
 *     浮空窗状态已迁入 feature-tools/composables/useFloatingWindow。
 *
 * 总体结构：
 *
 *     1. pendingCanvasFocusId: 画布视口定位请求（写入 → Graph.vue 消费 → 清除）
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * 功能：
 *
 *     创建 UI Store 实例，管理纯展示状态。
 *
 * 总体结构：
 *
 *     1. 状态: pendingCanvasFocusId — 画布视口定位请求
 *     2. API: requestCanvasFocus / clearCanvasFocus
 *
 * 规则：
 *
 *     1. 本状态只描述用户当前 UI 意图，不保存 GraphData。
 */
export const useUIStore = defineStore('ui_store', () => {
    /**
     * 功能：
     *
     *     画布视口定位请求。这是一笔一次性 UI 意图：
     *     写入目标元素 ID → Graph.vue 监听并交给 renderer 执行 → 清除回 null。
     *
     * 规则：
     *
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
        pendingCanvasFocusId,
        requestCanvasFocus,
        clearCanvasFocus,
    }
})
