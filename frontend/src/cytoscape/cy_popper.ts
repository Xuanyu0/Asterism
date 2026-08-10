/**
 * 渲染层 Cytoscape 外部库隔离边界内的 popper 锚定模块：给定元素 id 与内容元素，
 * 把内容锚定到目标右侧（节点包围盒中心 / 边包围盒中心即中点），并跟随目标位移与画布平移缩放实时更新。
 *
 * @remarks
 * 基于 cytoscape-popper（v4，注册必须传 factory）+ @floating-ui/dom。是通用锚定 API
 * （非 GraphNodeWindow 专用）——供 GraphNodeWindow 与未来操作日志侧边栏详情浮卡复用。
 * 模块职责：
 * - registerPopperExtension：把 popperFactory 注册为 cytoscape-popper 扩展
 * - popperFactory：floating-ui computePosition 封装（写 content 的 left/top）
 * - attachElementPopper：给定元素建立锚定，绑定跟随事件，返回 update/destroy
 */

import cytoscape from 'cytoscape'
import cytoscapePopper from 'cytoscape-popper'
import { computePosition, flip, limitShift, shift } from '@floating-ui/dom'

import type { Middleware, Placement, Strategy } from '@floating-ui/dom'
import type { Core } from 'cytoscape'

/**
 * 锚定句柄：update 重算锚定位置，destroy 解绑全部事件并清理 popper。
 */
export interface PopperAnchorHandle {
    update(): void
    destroy(): void
}

/**
 * attachElementPopper 的扩展选项，透传给 floating-ui computePosition。
 *
 * @remarks
 * 各字段缺省值：placement 'right'（目标右侧，验收契约）、strategy 'fixed'（相对视口定位，
 * 不撑大文档——absolute 会使超出视口的浮窗触发滚动条）、middleware flip + shift(limitShift)
 * （视口边缘自动翻转/平移，不截断）。显式传入的选项优先——工厂内 ...options 在默认值之后展开。
 */
export interface PopperAnchorOptions {
    placement?: Placement
    strategy?: Strategy
    middleware?: Middleware[]
}

/** cytoscape-popper 传给 factory 的引用对象：仅保证 getBoundingClientRect 可用。 */
type PopperRef = Pick<Element, 'getBoundingClientRect'>

/**
 * 注册 cytoscape-popper 扩展。
 *
 * @remarks
 * cytoscape-popper v4 必须在 use 时传入 popper factory。调用契约：
 * - 幂等——重复调用不抛错（cytoscape 重复注册同名扩展为覆盖写）
 * - 必须在任意 ele.popper() 调用前完成注册（useRenderer 顶层调用）
 */
export function registerPopperExtension(): void {
    cytoscape.use(cytoscapePopper(popperFactory))
}

/**
 * 把 floating-ui 的"定位计算 + 坐标写入"封装成可重复调用的 update 句柄，
 * 作为注入到 cytoscape-popper 的定位引擎实现。
 *
 * @remarks
 * 创建即定位一次；目标位移 / 画布平移缩放后由调用方调 update() 重算。
 *
 * @param ref - 锚点引用对象（cytoscape-popper 注入，getBoundingClientRect 返回当前渲染包围盒）
 * @param content - 被锚定的内容元素
 * @param options - 透传给 computePosition 的选项；placement 缺省 'right'（目标右侧），
 *                  middleware 缺省 flip + shift(limitShift)，显式传入时覆盖默认
 * @returns 可重算的定位句柄 { update }
 */
export function popperFactory(
    ref: PopperRef,
    content: HTMLElement,
    options?: PopperAnchorOptions,
): { update(): void } {
    // 默认 middleware 在工厂创建时定型一次——update 随 pan/zoom/position 高频触发，
    // 每次重建 flip/shift 实例是纯浪费（options.middleware 显式传入时覆盖此默认）
    const defaultMiddleware: Middleware[] = [flip(), shift({ limiter: limitShift() })]

    const update = (): void => {
        // computePosition 为异步：坐标就绪后写 left/top（position 由调用方 CSS 提供）。
        // floating-ui 默认 placement 是 'bottom'——必须显式缺省 'right' 满足"目标右侧"验收契约；
        // 调用方 options 在默认值之后展开，可覆盖 placement / middleware。
        void computePosition(ref, content, {
            placement: 'right',
            // 相对视口定位：absolute 会让超出视口的浮窗撑大文档（出现滚动条），
            // fixed 不撑大文档、浮窗钉在视口位置；调用方 options 可覆盖为 'absolute'。
            strategy: 'fixed',
            middleware: defaultMiddleware,
            ...options,
        }).then(({ x, y }) => {
            content.style.left = `${x}px`
            content.style.top = `${y}px`
        })
    }

    update()

    return { update }
}

/**
 * 将 contentEl 锚定到元素 elementId 上，返回 update / destroy 句柄。
 *
 * @remarks
 * 调用契约：
 * - 目标元素不存在时返回 no-op 句柄（update/destroy 空实现），不抛错
 * - update 重算锚定位置；destroy 解绑 position / pan / zoom / resize 事件并清理 popper
 * - 调用方必须持有句柄并在关闭 / 切换目标 / 卸载时调 destroy——否则监听泄漏
 *
 * @param cy - 已注册 popper 扩展的 Cytoscape 实例
 * @param elementId - 目标节点/边的 ID
 * @param contentEl - 被锚定的 DOM 元素
 * @param options - 透传给 floating-ui 的选项
 * @returns 锚定句柄 { update, destroy }
 */
export function attachElementPopper(
    cy: Core,
    elementId: string,
    contentEl: HTMLElement,
    options?: PopperAnchorOptions,
): PopperAnchorHandle {
    const ele = cy.getElementById(elementId)
    if (ele.length === 0) {
        return { update() {}, destroy() {} }
    }

    // ele.popper 由 registerPopperExtension 注入；返回值为 popperFactory 的返回值。
    // destroy 为防御性调用（当前 factory 只返回 update，floating-ui computePosition 无持久资源）。
    const popper = ele.popper({ content: contentEl, popper: options }) as { update(): void; destroy?: () => void }

    const update = (): void => {
        popper.update()
    }

    // 目标位移 / 画布平移缩放 / 容器尺寸变化 → 重算锚定位置
    ele.on('position', update)
    cy.on('pan zoom resize', update)

    return {
        update,
        destroy: () => {
            // CollectionEvents.off 的签名为 (events, selector?, handler?)——需 undefined 占位；
            // CoreEvents.off 有 (events, handler?) 重载，两参直达 handler
            ele.off('position', undefined, update)
            cy.off('pan zoom resize', update)
            popper.destroy?.()
        },
    }
}
