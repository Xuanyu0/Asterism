/**
 * 功能：
 *     提供 Cytoscape Renderer Runtime。
 *
 * 总体结构：
 *     1. mount()
 *     2. syncElements()
 *     3. destroy()
 *     4. getInstance()
 *
 * 外部如何使用：
 *     KnowledgeGraph.vue 在组件挂载后调用 mount() 创建 Cytoscape 实例，
 *     在 GraphData 投影结果变化后调用 syncElements() 同步渲染内容，
 *     在组件卸载前调用 destroy() 销毁 Cytoscape 实例。
 *
 * 规则：
 *     1. 本文件只负责 Cytoscape 生命周期与元素同步。
 *     2. 本文件不能读取或修改 GraphData。
 *     3. 本文件不能访问 graph_store、ui_store、draft_store。
 *     4. 本文件接收的 elements 必须已经是 CyElements 投影结果。
 *     5. Cytoscape 不是事实源，只是 GraphData 的渲染器。
 */

import cytoscape from 'cytoscape'
import type { Core } from 'cytoscape'
import type { Ref } from 'vue'
import type { CyElements } from './graph_element_mapper'
import { createCytoscapeStyle } from './cytoscape_style'

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
     *         () => graphStore.currentGraph,
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

    function fitView(): void {
        if (!cy) {
            return
        }

        cy.fit()
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

        cy.destroy()
        cy = null
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
    }
}
