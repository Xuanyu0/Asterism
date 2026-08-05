/**
 * 说明：
 *
 *     画布视口定位请求模块级单例。承载一次性 UI 意图：
 *     写入目标元素 ID → Graph.vue 监听并交给 renderer.centerOnElement 执行 → 清除回 null。
 *
 * 调用契约：
 *
 *     1. 消费后必须清除（clearCanvasFocus），保证同一元素可重复定位。
 *     2. 本状态只描述 UI 意图，不保存 GraphData。
 */

import { ref, type Ref } from 'vue'

/**
 * 说明：
 *
 *     useCanvasFocus 返回的画布焦点单例 API。
 */
interface CanvasFocusAPI {
    /** 画布视口定位请求。null = 无待处理定位请求。 */
    pendingCanvasFocusId: Ref<string | null>

    /**
     * 说明：
     *
     *     发起画布定位请求。
     *
     * 参数：
     *
     *     targetId — 目标节点/边的 ID，与渲染元素的 id 一致。
     */
    requestCanvasFocus(targetId: string): void

    /**
     * 说明：
     *
     *     清除画布定位请求。由消费方（Graph.vue）在执行后调用。
     */
    clearCanvasFocus(): void
}

let singleton: CanvasFocusAPI | null = null

/**
 * 说明：
 *
 *     获取画布焦点模块级单例（懒创建）。
 *
 * 调用契约：
 *
 *     1. 后续调用返回同一实例。
 */
export function useCanvasFocus(): CanvasFocusAPI {
    if (!singleton) {
        singleton = createCanvasFocus()
    }
    return singleton
}

function createCanvasFocus(): CanvasFocusAPI {
    const pendingCanvasFocusId = ref<string | null>(null)

    function requestCanvasFocus(targetId: string): void {
        pendingCanvasFocusId.value = targetId
    }

    function clearCanvasFocus(): void {
        pendingCanvasFocusId.value = null
    }

    return {
        pendingCanvasFocusId,
        requestCanvasFocus,
        clearCanvasFocus,
    }
}
