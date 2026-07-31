/**
 * useAutoFade.ts
 *
 * 功能：
 *
 *     通用自动淡化能力。
 *     根据 pointer 是否处在有效区域内判断淡化与否
 *
 * 规则：
 *
 *     1. onPointerLeave 内部检查 preventFade——若为 true，不启动淡化计时器。
 *     2. 监听 preventFade 变化：变为 true 时清除计时器并撤销淡化；
 *        变为 false 时若指针不在区域内，重新启动淡化计时器。
 *     3. 指针在区域内时，preventFade 的变化不会错误启动计时器。
 */

import { ref, watch } from 'vue'
import type { Ref } from 'vue'

export function useAutoFade(options: {
    /** 指针离开后淡化延迟（ms），默认 3000。 */
    delay?: number
    /**
     * 阻止淡化的响应式条件。
     *
     * 规则：
     *     从 true→false 时若指针不在区域内则重启计时器。
     */
    preventFade: Ref<boolean>
}): {
    /** 是否处于淡化状态。 */
    isFaded: Ref<boolean>
    /** pointer 进入区域——清除计时器，立即取消淡化。 */
    onPointerEnter: () => void
    /** pointer 离开区域——启动淡化计时器（preventFade 时不启动）。 */
    onPointerLeave: () => void
} {
    const { delay = 3000, preventFade } = options
    const isFaded = ref(false)
    /** 指针是否在区域内。内部标记，不暴露。 */
    const isPointerInside = ref(false)

    let fadeTimer: ReturnType<typeof setTimeout> | null = null

    function clearTimer(): void {
        if (fadeTimer !== null) {
            clearTimeout(fadeTimer)
            fadeTimer = null
        }
    }

    function startTimer(): void {
        if (preventFade.value) return

        clearTimer()
        fadeTimer = setTimeout(() => {
            isFaded.value = true
        }, delay)
    }

    function onPointerEnter(): void {
        isPointerInside.value = true
        clearTimer()
        isFaded.value = false
    }

    function onPointerLeave(): void {
        isPointerInside.value = false
        startTimer()
    }

    // preventFade 变化时同步淡化状态
    watch(preventFade, (prevented) => {
        if (prevented) {
            // 阻止淡化：清除计时器，撤销已生效的淡化
            clearTimer()
            isFaded.value = false
        } else if (!isPointerInside.value) {
            // 不再阻止且指针在外面：重启计时器
            startTimer()
        }
        // prevented=false 且指针在区域内：什么都不做，pointer 离开时自然会启动
    })

    return {
        isFaded,
        onPointerEnter,
        onPointerLeave,
    }
}
