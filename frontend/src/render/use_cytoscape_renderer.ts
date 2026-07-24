/**
 * 功能：
 *     提供 Cytoscape Renderer Runtime。
 *
 * 总体结构：
 *     1. mount()
 *     2. syncElements()
 *     3. destroy()
 *     4. getInstance()
 *     5. revealElement()  — 视口定位 + 高亮提示
 *
 * 外部如何使用：
 *     Graph.vue 在组件挂载后调用 mount() 创建 Cytoscape 实例，
 *     在 GraphData 投影结果变化后调用 syncElements() 同步渲染内容，
 *     在组件卸载前调用 destroy() 销毁 Cytoscape 实例。
 *
 * 规则：
 *     1. 本文件只负责 Cytoscape 生命周期与元素同步。
 *     2. 本文件不能读取或修改 GraphData。
 *     3. 本文件不能访问 graph_store、ui_store。
 *     4. 本文件接收的 elements 必须已经是 CyElements 投影结果。
 *     5. Cytoscape 不是事实源，只是 GraphData 的渲染器。
 */

import cytoscape from 'cytoscape'
import type { Core } from 'cytoscape'
import type { Ref } from 'vue'
import type { CyElements } from './graph_element_mapper'
import { createCytoscapeStyle } from './cytoscape_style'


// ── 模块级 Cytoscape 实例引用 ──

let cyInstance: Core | null = null

/**
 * 功能：
 *     获取当前 Cytoscape 实例（模块级）。
 *
 * 规则：
 *     1. mount() 创建实例后，本函数可获取该实例。
 *     2. destroy() 调用后返回 null。
 *     3. 供 move_node 等工具直接操作 Cy 视觉层（不写 GraphData）。
 *
 * 使用：
 *     import { getCy } from '@/render/use_cytoscape_renderer'
 *     const cy = getCy()
 */
export function getCyInstance(): Core | null {
    return cyInstance
}

/**
 * 功能：
 *     创建 Cytoscape 渲染器运行时。
 *
 * 规则：
 *     1. containerRef 必须指向 Vue 挂载后的 DOM 容器。
 *     2. 返回的函数共同管理同一个 Cytoscape 实例。
 *     3. 不在创建阶段立即初始化 Cytoscape，必须由 mount() 显式创建。
 *
 * 使用：
 *     const renderer = useCytoscapeRenderer(cyContainer)
 */
export function useCytoscapeRenderer(
    containerRef: Ref<HTMLElement | null>,
) {
    let cy: Core | null = null

    /** 高亮提示的移除定时器。新一次 reveal 或 destroy 时清除。 */
    let flashTimer: ReturnType<typeof setTimeout> | null = null

    /**
     * 功能：
     *     创建 Cytoscape 实例并挂载到 DOM 容器。
     *
     * 规则：
     *     1. 只能在 containerRef.value 存在后调用。
     *     2. 初始 elements 为空，真实图元素由 syncElements() 注入。
     *     3. layout 必须使用 preset，避免自动布局覆盖 GraphData.position。
     *     4. 样式必须来自 createCytoscapeStyle()。
     *
     * 使用：
     *     onMounted(() => {
     *         renderer.mount()
     *     })
     */
    function mount(): void {
        if (!containerRef.value) {
            return
        }

        cy = cytoscape({
            container: containerRef.value,
            elements: [],
            style: createCytoscapeStyle(),
            layout: {
                name: 'preset',
            },
            userPanningEnabled: true,
            userZoomingEnabled: true,
            autoungrabify: true,

        })

        cy.resize()
        cy.fit()

        cyInstance = cy
    }

    /**
     * 功能：
     *     将 CyElements 同步到当前 Cytoscape 实例。
     *
     * 规则：
     *     1. elements 必须来自 graph_element_mapper.ts。
     *     2. 本函数只接收投影结果，不接收 GraphData。
     *     3. 本函数不判断图规则合法性。
     *     4. 本函数不修改 graph_store。
     *
     * 使用：
     *     watch(
     *         () => graphStore.graphView,
     *         graph => {
     *             renderer.syncElements(mapGraphDataToCyElements(graph))
     *         },
     *     )
     */
    function syncElements(elements: CyElements): void {
        if (!cy) {
            return
        }

        cy.json({
            elements,
        })

        cy.resize()
    }

    /**
     * 功能：
     *     销毁当前 Cytoscape 实例并释放引用。
     *
     * 规则：
     *     1. 组件卸载前必须调用。
     *     2. 销毁后 cy 必须恢复为 null。
     *     3. 销毁操作不影响 GraphData。
     *
     * 使用：
     *     onBeforeUnmount(() => {
     *         renderer.destroy()
     *     })
     */
    function destroy(): void {
        if (!cy) {
            return
        }

        if (flashTimer !== null) {
            clearTimeout(flashTimer)
            flashTimer = null
        }

        cy.destroy()
        cy = null
        cyInstance = null
    }

    /**
     * 功能：
     *
     *     将视口动画移动到指定元素，并施加短暂高亮提示。
     *
     * 规则：
     *
     *     1. 只操作 Cytoscape 视口与样式 class，不触碰 GraphData。
     *     2. 元素不存在时静默返回。
     *     3. 高亮 class 由 cytoscape_style.ts 的 .search-focus 定义，
     *        1.2s 后自动移除。
     *     4. 当前缩放级别低于 1 时提升到 1，保证目标元素清晰可辨；
     *        更深的缩放保持不变，不打扰用户既有视角。
     *
     * 参数：
     *
     *     elementId — 目标节点/边的 ID，与 CyElements 中的 id 一致。
     *
     * 使用：
     *
     *     Graph.vue 消费 ui_store.pendingCanvasFocusId 时调用。
     */
    function revealElement(elementId: string): void {
        if (!cy) {
            return
        }

        const element = cy.getElementById(elementId)
        if (element.empty()) {
            return
        }

        cy.animate({
            center: { eles: element },
            zoom: Math.max(cy.zoom(), 1),
        }, {
            duration: 300,
        })

        if (flashTimer !== null) {
            clearTimeout(flashTimer)
        }

        element.addClass('search-focus')
        flashTimer = setTimeout(() => {
            element.removeClass('search-focus')
            flashTimer = null
        }, 1200)
    }

    /**
     * 功能：
     *     获取当前 Cytoscape 实例。
     *
     * 规则：
     *     1. 只用于 Interaction Runtime 绑定事件。
     *     2. 外部不能通过该实例修改 GraphData。
     *     3. mount() 之前返回 null。
     *
     * 使用：
     *     const cy = renderer.getInstance()
     */
    function getInstance(): Core | null {
        return cy
    }

    return {
        mount,
        syncElements,
        destroy,
        getInstance,
        revealElement,
    }
}
