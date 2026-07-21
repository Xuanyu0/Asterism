/**
 * useDragPosition.ts
 *
 * 功能：
 *
 *     通用的窗口拖拽能力。
 *     捕获 Pointer Events 
 *     实现拖拽、视口边界钳制、松手后边缘吸附
 *     以及 localStorage 位置持久化。
 *
 * 规则：
 *
 *     1. 默认以 pointer capture 锁定到首个 pointerdown 事件的目标元素。
 *     2. 拖拽期间实时 clamp 到视口，距视口边缘 ≥ margin。
 *     3. pointerup 时若提供 snap 参数，执行边缘吸附 → 触发 onDragEnd 回调
 *        → 若提供 storageKey 则持久化到 localStorage。
 *     4. 接口不包含拖拽 DOM 结构之外的任何领域概念。
 *
 * 外部如何使用：
 *
 *     const { position, isDragging, elementRef, handlers, clampToViewport }
 *         = useDragPosition({ defaultPosition: { x: 52, y: 12 } })
 *
 *     <div ref="elementRef" v-bind:style="{ left: position.x + 'px', top: position.y + 'px' }">
 *         <div v-on:pointerdown="handlers.onPointerdown"
 *              v-on:pointermove="handlers.onPointermove"
 *              v-on:pointerup="handlers.onPointerup"
 *              v-on:pointercancel="handlers.onPointerup">...</div>
 *     </div>
 */

import type { Ref } from 'vue'
import { ref } from 'vue'

export function useDragPosition(options: {
    /** localStorage 存储键。不提供则不做持久化。 */
    storageKey?: string
    /** 初始位置。 */
    defaultPosition: { x: number; y: number }
    /** 视口边距（px），默认 8。 */
    margin?: number
    /**
     * 边缘吸附参数：
     * 
     *     - threshold — 距边缘多近时触发吸附
     *     - margin — 吸附后距边缘的距离
     */
    snapthreshold?: number
    /** 拖拽结束回调。接收吸附后的最终位置。 */
    onDragEnd?: (pos: { x: number; y: number }) => void
}): {
    /** 当前位置。 */
    position: Ref<{ x: number; y: number }>
    isDragging: Ref<boolean>
    /** 宿主元素引用，绑到拖拽容器的 DOM 元素。 */
    elementRef: Ref<HTMLElement | null>
    /** 拖拽事件处理器。 */
    handlers: {
        onPointerdown: (e: PointerEvent) => void
        onPointermove: (e: PointerEvent) => void
        onPointerup: (e: PointerEvent) => void
    }
    /** 以当前 elementRef 的实际尺寸将位置钳制到视口内。 */
    clampToViewport: () => void
} {
    const {
        storageKey,
        defaultPosition,
        margin = 8,
        snapthreshold,
        onDragEnd,
    } = options

    const position = ref<{ x: number; y: number }>(loadPersistedPosition())
    const elementRef = ref<HTMLElement | null>(null)
    const isDragging = ref(false)

    // 拖拽时的中间变量——非响应式，拖拽期间有效。
    const dragPointerOffset = { x: 0, y: 0 }
    const dragElementSize = { width: 0, height: 0 }

    /**
     * 功能：
     *
     *     读取 localStorage 中持久化的位置，数据缺失或损坏时回退默认位置。
     *
     * 规则：
     *
     *     1. 在 setup 阶段同步调用——首帧即落在恢复位置。
     *     2. 不做视口钳制——尺寸未知，由 clampToViewport 在挂载后负责。
     */
    function loadPersistedPosition(): { x: number; y: number } {
        if (!storageKey) return { ...defaultPosition }

        try {
            const raw = localStorage.getItem(storageKey)
            if (raw) {
                const parsed: unknown = JSON.parse(raw)
                if (
                    typeof parsed === 'object' && parsed !== null
                    && 'x' in parsed && 'y' in parsed
                    && typeof (parsed as Record<string, unknown>).x === 'number'
                    && typeof (parsed as Record<string, unknown>).y === 'number'
                ) {
                    return parsed as { x: number; y: number }
                }
            }
        } catch {
            // 损坏数据静默回退默认位置
        }
        return { ...defaultPosition }
    }

    /**
     * 功能：
     *
     *     将当前位置持久化到 localStorage。
     */
    function persistPosition(): void {
        if (storageKey) {
            localStorage.setItem(storageKey, JSON.stringify(position.value))
        }
    }

    // 内部函数
    function clampCardToViewport(x: number, y: number, width: number, height: number): { x: number; y: number } {
        const maxX = Math.max(margin, window.innerWidth - width - margin)
        const maxY = Math.max(margin, window.innerHeight - height - margin)

        return {
            x: Math.min(Math.max(x, margin), maxX),
            y: Math.min(Math.max(y, margin), maxY),
        }
    }

    /**
     * 功能：
     *
     *     以当前 elementRef 的实际尺寸将 position 钳制到视口内。
     *     挂载完成与窗口 resize 时调用。
     */
    function clampToViewport(): void {
        const el = elementRef.value
        if (!el) return

        position.value = clampCardToViewport(
            position.value.x,
            position.value.y,
            el.offsetWidth,
            el.offsetHeight,
        )
    }

    /**
     * 功能：
     *
     *     松手后边缘吸附：距视口边缘 ≤ threshold 的轴吸附到 margin。
     *
     * 规则：
     *
     *     1. x / y 两轴独立判定，可只吸附一边。
     *     2. 不提供 snap 参数则不执行吸附，原样返回。
     */
    function snapToEdges(pos: { x: number; y: number }): { x: number; y: number } {
        if (!snapthreshold) return pos

        const { width, height } = dragElementSize
        let { x, y } = pos

        const snapMargin =  margin

        if (x < snapthreshold) {
            x = snapMargin
        } else if (x > window.innerWidth - width - snapthreshold) {
            x = window.innerWidth - width - snapMargin
        }

        if (y < snapthreshold) {
            y = snapMargin
        } else if (y > window.innerHeight - height - snapthreshold) {
            y = window.innerHeight - height - snapMargin
        }

        return { x, y }
    }

    /**
     * 功能：
     *
     *     拖拽开始。pointer capture 锁定到事件目标（手柄元素）。
     *
     * 规则：
     *
     *     全部事件定向到手柄，不流向下层画布。
     */
    function onPointerdown(event: PointerEvent): void {
        if (event.button !== 0) return

        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
        event.preventDefault()

        const el = elementRef.value
        if (el) {
            dragElementSize.width = el.offsetWidth
            dragElementSize.height = el.offsetHeight
        }

        dragPointerOffset.x = event.clientX - position.value.x
        dragPointerOffset.y = event.clientY - position.value.y
        isDragging.value = true
    }

    /**
     * 功能：
     *
     *     拖拽中持续更新位置，实时 clamp 到视口。
     */
    function onPointermove(event: PointerEvent): void {
        if (!isDragging.value) return

        position.value = clampCardToViewport(
            event.clientX - dragPointerOffset.x,
            event.clientY - dragPointerOffset.y,
            dragElementSize.width,
            dragElementSize.height,
        )
    }

    /**
     * 功能：
     *
     *     拖拽结束：边缘吸附 → onDragEnd 回调 → 持久化。
     *     pointerup 与 pointercancel 共用。
     */
    function onPointerup(): void {
        if (!isDragging.value) return

        isDragging.value = false
        position.value = snapToEdges(position.value)
        onDragEnd?.(position.value)
        persistPosition()
    }

    return {
        position,
        isDragging,
        elementRef,
        handlers: {
            onPointerdown,
            onPointermove,
            onPointerup,
        },
        clampToViewport,
    }
}
