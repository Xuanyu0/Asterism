/**
 * useOverflowDetection.ts
 *
 * 功能：
 *
 *     通用 DOM 水平溢出检测。
 *     判断宿主元素的 scrollWidth 是否超过 clientWidth，
 *     用于触发截断/淡化等溢出视觉反馈。
 *
 * 规则：
 *
 *     1. composable 不主动 watch 任何东西——何时测量由调用方决定。
 *     2. measure() 内部 await nextTick() 后判断 element.scrollWidth > element.clientWidth + 1
 *        （1px 容差吸收亚像素舍入）。
 *     3. 调用方在 onMounted、watch(数据源)、onWindowResize 中自行调 measure()。
 *     4. 接口不绑定路径、截断等语义——diverge 搜索浮窗等水平溢出场景可复用。
 */

import { ref, nextTick } from 'vue'
import type { Ref } from 'vue'

/**
 * 功能：
 *
 *     DOM 元素水平溢出检测。
 *
 * 参数：
 *
 *     element — 被检测元素的 Ref。可为 null（元素尚未挂载）。
 */
export function useOverflowDetection(element: Ref<HTMLElement | null>): {
    /** 是否处于水平溢出状态。 */
    isOverflowing: Ref<boolean>
    /**
     * 执行一次溢出测量。
     */
    measure: () => Promise<void>
} {
    const isOverflowing = ref(false)

    async function measure(): Promise<void> {
        await nextTick()

        const el = element.value
        if (!el) {
            isOverflowing.value = false
            return
        }
        isOverflowing.value = el.scrollWidth > el.clientWidth + 1
    }

    return {
        isOverflowing,
        measure,
    }
}
