/**
 * 功能：
 *     提供 Cytoscape Renderer Runtime 单例 composable。
 *
 * 总体结构：
 *     1. RendererAPI 接口定义
 *     2. 模块级 singleton 引用
 *     3. useRenderer(containerRef?) → RendererAPI
 *        - 首次调用（传 containerRef）：创建闭包状态，返回完整 API
 *        - 后续调用（无参）：返回同一个 API 对象
 *
 * 外部如何使用：
 *     Graph.vue 首次调用： useRenderer(cyContainer)
 *     工具模块（move_node.ts）： useRenderer() 获取已创建的 API
 *     所有方法都在闭包内访问私有 cy，外部永远无法获取裸 Cy 实例。
 *
 * 规则：
 *     1. 本文件只负责 Cytoscape 生命周期与元素同步及视觉层操作。
 *     2. 本文件不能读取或修改 GraphData（除 syncFromGraphData 接收 GraphData 并映射）。
 *     3. 本文件不能访问 graph_store、ui_store。
 *     4. Cytoscape 不是事实源，只是 GraphData 的渲染器。
 *     5. 首次调用必须传 containerRef；后续调用可不传。
 */

import cytoscape from 'cytoscape'
import type { Core } from 'cytoscape'
import type { Ref } from 'vue'
import { watch } from 'vue'

import type { GraphData, NodePosition } from '@my-project/graph-engine'
import type { GraphInteractionHandlers } from './graph_interaction'

import { mapGraphDataToCyElements } from './graph_element_mapper'
import { bindCyEvents } from './graph_interaction'
import { createCytoscapeStyle } from './cytoscape_style'


// ── 接口定义 ──

/**
 * 功能：
 *     useRenderer 返回的 API 接口。
 *
 * 规则：
 *     1. 所有方法在 composable 闭包内访问私有 cy。
 *     2. 外部无法通过此 API 获取裸 Cytoscape 实例。
 */
export interface RendererAPI {
    /** 创建 Cytoscape 实例并挂载到 DOM 容器，同时绑定交互事件。 */
    mount(handlers: GraphInteractionHandlers): void

    /** 销毁当前 Cytoscape 实例并释放引用。 */
    destroy(): void

    /** 将 GraphData 同步到 Cytoscape 渲染器。 */
    syncFromGraphData(graphData: GraphData): void

    /** 将视口动画移动到指定元素，并施加短暂高亮提示。 */
    centerOnElement(elementId: string): void

    /** 设置节点的视觉位置（仅视觉层，不写 GraphData）。 */
    setNodePosition(nodeId: string, pos: NodePosition): void

    /** 获取节点的当前视觉位置。不存在时返回 null。 */
    getNodePosition(nodeId: string): NodePosition | null

    /** 将节点恢复到最近一次 syncFromGraphData 记录的 GraphData 位置。 */
    resetNodePosition(nodeId: string): void

    /** 为节点添加一个由指定 owner 管理的 class。 */
    addNodeClass(nodeId: string, className: string, owner: string): void

    /** 为节点移除一个由指定 owner 管理的 class。 */
    removeNodeClass(nodeId: string, className: string, owner: string): void

    /** 清除指定 owner 施加的全部 class。 */
    clearAllPreviews(owner: string): void

    /** 光标追踪：绑定 mousemove，返回 stop 句柄。 */
    trackCursor(callback: (modelPos: NodePosition) => void): { stop(): void }

    /** 反应式外部高亮。监听 getter 返回值，自动为对应元素施加/移除 className。 */
    bindHighlight(getter: () => string | null | undefined, className: string): void
}


// ── 模块级单例引用 ──

let singleton: RendererAPI | null = null


// ── useRenderer（单例 composable） ──

/**
 * 功能：
 *     获取/创建 Cytoscape 渲染器运行时单例。
 *
 * 规则：
 *     1. 首次调用必须传入 containerRef，后续调用可不传。
 *     2. mount() 必须在 onMounted 内显式调用，不在创建时自动挂载。
 *     3. bindHighlight 只能在 composable / setup 上下文中调用（内部调 watch）。
 *
 * 参数：
 *     containerRef — 可选。首次调用时必须传入 Vue 模板中 cy 容器的 ref。
 *                    后续调用（无参）返回已创建的单例。
 *
 * 使用：
 *     // Graph.vue 首次创建
 *     const renderer = useRenderer(cyContainer)
 *     renderer.mount(handlers)
 *     renderer.syncFromGraphData(graphView)
 *     renderer.bindHighlight(() => val, 'my-class')
 *
 *     // move_node.ts 获取已有实例
 *     const { setNodePosition, trackCursor } = useRenderer()
 *
 *     // 组件卸载
 *     renderer.destroy()
 */
export function useRenderer(
    containerRef?: Ref<HTMLElement | null>,
): RendererAPI {
    // 单例已存在 → 直接返回
    if (singleton) {
        return singleton
    }

    // 首次调用必须提供 containerRef
    if (!containerRef) {
        throw new Error(
            '[useRenderer] First call must provide containerRef. ' +
            'Call useRenderer(cyContainer) from Graph.vue setup before tools access it.',
        )
    }

    // ── 闭包内部状态 ──

    /**
     * Cytoscape 实例。mount() 创建，destroy() 置 null。
     * 外部不可见——所有操作必须通过 RendererAPI 方法间接访问。
     */
    let cy: Core | null = null

    /**
     * centerOnElement 的高亮 class 移除定时器。
     * 新调用自动清除旧定时器，保证同一时刻最多一个高亮。
     */
    let flashTimer: ReturnType<typeof setTimeout> | null = null

    /**
     * bindCyEvents 返回的 destroy 句柄。destroy() 时调用以解绑事件。
     */
    let eventsDestroy: (() => void) | null = null

    /**
     * 节点在最近一次 syncFromGraphData 中记录的 GraphData 位置。
     * key = nodeId，value = 模型坐标。供 resetNodePosition 恢复到"最后一次同步时的位置"。
     */
    const nodePositionsCache: Map<string, NodePosition> = new Map()

    /**
     * 每个 owner（如 'move'）通过 addNodeClass 施加的 class 记录。
     * 结构：Map<owner, Map<nodeId, Set<className>>>
     * 供 clearAllPreviews 批量清除指定 owner 的 class。
     * 仅管理 class，不操作 position。
     */
    const classOwners: Map<string, Map<string, Set<string>>> = new Map()


    // ── mount / destroy ──

    /**
     * 功能：
     *     创建 Cytoscape 实例并挂载到 DOM 容器，同时绑定交互事件。
     *
     * 规则：
     *     1. 只能在 containerRef.value 存在后调用。
     *     2. 初始 elements 为空，真实图元素由 syncFromGraphData() 注入。
     *     3. layout 必须使用 preset，避免自动布局覆盖 GraphData.position。
     *     4. 样式必须来自 createCytoscapeStyle()。
     *     5. 内部调用 bindCyEvents 将语义事件绑定到 Cy 实例。
     *
     * 使用：
     *     onMounted(() => {
     *         renderer.mount(handlers)
     *     })
     */
    function mount(handlers: GraphInteractionHandlers): void {
        if (!containerRef?.value) {
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

        // 绑定交互事件
        const events = bindCyEvents(cy, handlers)
        eventsDestroy = events.destroy
    }

    /**
     * 功能：
     *     销毁当前 Cytoscape 实例并释放引用。
     *
     * 规则：
     *     1. 组件卸载前必须调用。
     *     2. 销毁后 cy 必须恢复为 null。
     *     3. 清除瞬态状态缓存（位置缓存、class 记录、定时器）。
     *
     * 使用：
     *     onBeforeUnmount(() => {
     *         renderer.destroy()
     *     })
     */
    function destroy(): void {
        if (flashTimer !== null) {
            clearTimeout(flashTimer)
            flashTimer = null
        }

        if (eventsDestroy !== null) {
            eventsDestroy()
            eventsDestroy = null
        }

        if (cy) {
            cy.destroy()
            cy = null
        }

        nodePositionsCache.clear()
        classOwners.clear()
    }


    // ── 数据同步 ──

    /**
     * 功能：
     *     将 GraphData 同步到 Cytoscape 渲染器。
     *
     * 规则：
     *     1. 内部调用 mapGraphDataToCyElements 完成映射。
     *     2. 清除全部瞬态视觉状态（class 预览、位置缓存）。
     *     3. 记录每个节点的 GraphData 位置供 resetNodePosition 使用。
     *
     * 参数：
     *     graphData — 当前 GraphData（来自 graphStore.graphView）。
     */
    function syncFromGraphData(graphData: GraphData): void {
        if (!cy) {
            return
        }

        const cyElements = mapGraphDataToCyElements(graphData)
        cy.json({ elements: cyElements })
        cy.resize()

        // 记录所有节点的 GraphData 位置
        nodePositionsCache.clear()
        for (const node of graphData.nodes) {
            if (node.position) {
                nodePositionsCache.set(node.id, { x: node.position.x, y: node.position.y })
            }
        }

        // 清除全部瞬态视觉状态
        classOwners.clear()
    }


    // ── 视口定位 ──

    /**
     * 功能：
     *     将视口动画移动到指定元素，并施加短暂高亮提示。
     *
     * 规则：
     *     1. 只操作 Cytoscape 视口与样式 class，不触碰 GraphData。
     *     2. 元素不存在时静默返回。
     *     3. 高亮 class 由 cytoscape_style.ts 的 .search-focus 定义，
     *        1.2s 后自动移除。
     *     4. 当前缩放级别低于 1 时提升到 1，保证目标元素清晰可辨；
     *        更深的缩放保持不变，不打扰用户既有视角。
     *
     * 参数：
     *     elementId — 目标节点/边的 ID，与 CyElements 中的 id 一致。
     */
    function centerOnElement(elementId: string): void {
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


    // ── 视觉预览：位置 ──

    /**
     * 功能：
     *     设置节点的视觉位置（仅视觉层，不写 GraphData）。
     *
     * 规则：
     *     1. 不修改 GraphData，只操作 Cy 视觉层。
     *     2. 节点不存在时静默返回。
     *
     * 参数：
     *     nodeId — 目标节点 ID
     *     pos — 模型坐标 { x, y }
     */
    function setNodePosition(nodeId: string, pos: NodePosition): void {
        if (!cy) {
            return
        }

        const el = cy.getElementById(nodeId)
        if (el.length === 0) {
            return
        }

        el.position(pos)
    }

    /**
     * 功能：
     *     获取节点的当前视觉位置。
     *
     * 规则：
     *     1. 只读取 Cy 视觉层，不读 GraphData。
     *     2. 节点不存在时返回 null。
     *
     * 参数：
     *     nodeId — 目标节点 ID
     */
    function getNodePosition(nodeId: string): NodePosition | null {
        if (!cy) {
            return null
        }

        const el = cy.getElementById(nodeId)
        if (el.length === 0) {
            return null
        }

        const pos = el.position()
        return { x: pos.x, y: pos.y }
    }

    /**
     * 功能：
     *     将节点恢复到最近一次 syncFromGraphData 记录的 GraphData 位置。
     *
     * 规则：
     *     1. 仅恢复视觉层位置，不修改 GraphData。
     *     2. 不清除其他瞬态状态（class 等）。
     *     3. 未记录位置或无此节点时静默返回。
     *
     * 参数：
     *     nodeId — 目标节点 ID
     */
    function resetNodePosition(nodeId: string): void {
        if (!cy) {
            return
        }

        const pos = nodePositionsCache.get(nodeId)
        if (!pos) {
            return
        }

        const el = cy.getElementById(nodeId)
        if (el.length === 0) {
            return
        }

        el.position(pos)
    }


    // ── 视觉预览：class ──

    /**
     * 功能：
     *     为节点添加一个由指定 owner 管理的 class。
     *
     * 规则：
     *     1. 仅管理 class，不操作 position。
     *     2. 同一 owner + nodeId + className 组合可重复调用（幂等）。
     *
     * 参数：
     *     nodeId — 目标节点 ID
     *     className — 要添加的 class 名
     *     owner — 施加该 class 的拥有者标识（如 'move'），用于 clearAllPreviews
     */
    function addNodeClass(nodeId: string, className: string, owner: string): void {
        if (!cy) {
            return
        }

        const el = cy.getElementById(nodeId)
        if (el.length === 0) {
            return
        }

        el.addClass(className)

        let byNode = classOwners.get(owner)
        if (!byNode) {
            byNode = new Map()
            classOwners.set(owner, byNode)
        }
        let classSet = byNode.get(nodeId)
        if (!classSet) {
            classSet = new Set()
            byNode.set(nodeId, classSet)
        }
        classSet.add(className)
    }

    /**
     * 功能：
     *     为节点移除一个由指定 owner 管理的 class。
     *
     * 规则：
     *     1. 仅管理 class，不操作 position。
     *     2. 组合不存在时静默返回。
     *
     * 参数：
     *     nodeId — 目标节点 ID
     *     className — 要移除的 class 名
     *     owner — 最初施加该 class 的拥有者标识
     */
    function removeNodeClass(nodeId: string, className: string, owner: string): void {
        if (!cy) {
            return
        }

        const el = cy.getElementById(nodeId)
        if (el.length === 0) {
            return
        }

        el.removeClass(className)

        const byNode = classOwners.get(owner)
        if (!byNode) {
            return
        }
        const classSet = byNode.get(nodeId)
        if (!classSet) {
            return
        }
        classSet.delete(className)
        if (classSet.size === 0) {
            byNode.delete(nodeId)
        }
        if (byNode.size === 0) {
            classOwners.delete(owner)
        }
    }

    /**
     * 功能：
     *     清除指定 owner 施加的全部 class（仅 class，不重置 position）。
     *
     * 规则：
     *     1. 不操作 position，只移除 class。
     *     2. owner 无记录时静默返回。
     *
     * 参数：
     *     owner — 拥有者标识（如 'move'）
     */
    function clearAllPreviews(owner: string): void {
        if (!cy) {
            return
        }

        const byNode = classOwners.get(owner)
        if (!byNode) {
            return
        }

        for (const [nodeId, classSet] of byNode) {
            const el = cy.getElementById(nodeId)
            if (el.length > 0) {
                el.removeClass(Array.from(classSet))
            }
        }

        classOwners.delete(owner)
    }


    // ── 光标追踪 ──

    /**
     * 功能：
     *     在 Cy 容器上绑定 mousemove 事件，将 DOM 坐标转换为模型坐标后回调。
     *
     * 规则：
     *     1. 坐标通过 `(clientX - rect.left - pan.x) / zoom` 手动转换（不依赖 Cytoscape API）。
     *     2. 返回 stop 句柄，调用方负责在 deactivate 时调用。
     *     3. 若 cy 为空返回无操作 stop。
     *     4. 调用方应保证每次 activate 调用一次，deactivate 时停止。
     *
     * 参数：
     *     callback — 每次 mousemove 触发时被调用，参数为模型坐标
     *
     * 使用：
     *     const tracking = renderer.trackCursor((modelPos) => { ... })
     *     // 在 deactivate 中：
     *     tracking.stop()
     */
    function trackCursor(
        callback: (modelPos: NodePosition) => void,
    ): { stop(): void } {
        const currentCy = cy
        if (!currentCy) {
            return { stop() {} }
        }

        const container = currentCy.container()
        if (!container) {
            return { stop() {} }
        }

        const handler = (event: MouseEvent) => {
            const rect = container.getBoundingClientRect()
            const modelPos = {
                x: (event.clientX - rect.left - currentCy.pan().x) / currentCy.zoom(),
                y: (event.clientY - rect.top - currentCy.pan().y) / currentCy.zoom(),
            }
            callback(modelPos)
        }

        container.addEventListener('mousemove', handler)

        return {
            stop() {
                container.removeEventListener('mousemove', handler)
            },
        }
    }


    // ── 反应式高亮 ──

    /**
     * 功能：
     *     反应式外部高亮。监听 getter 返回的 ID，自动为对应元素施加/移除 className。
     *
     * 规则：
     *     1. 内部调 watch()，只能在 composable / setup 上下文中调用。
     *     2. getter 变化时：旧 ID 移除 class，新 ID 施加 class。
     *     3. getter 返回 null / undefined 时清除旧 ID 的 class。
     *
     * 参数：
     *     getter — () => string | null | undefined，返回需要高亮的元素 ID
     *     className — 要施加/移除的 class 名
     *
     * 使用：
     *     renderer.bindHighlight(
     *         () => mediator.activeHandler.value?.highlightNode ?? null,
     *         'delete-target',
     *     )
     */
    function bindHighlight(
        getter: () => string | null | undefined,
        className: string,
    ): void {
        watch(
            getter,
            (id, prevId) => {
                if (!cy) {
                    return
                }

                if (prevId) {
                    const prev = cy.getElementById(prevId)
                    if (prev.length > 0) {
                        prev.removeClass(className)
                    }
                }
                if (id) {
                    const target = cy.getElementById(id)
                    if (target.length > 0) {
                        target.addClass(className)
                    }
                }
            },
        )
    }


    // ── 组装 API 对象 ──

    const api: RendererAPI = {
        mount,
        destroy,
        syncFromGraphData,
        centerOnElement,
        setNodePosition,
        getNodePosition,
        resetNodePosition,
        addNodeClass,
        removeNodeClass,
        clearAllPreviews,
        trackCursor,
        bindHighlight,
    }

    singleton = api
    return api
}
