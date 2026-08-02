/**
 * 说明：
 *
 *     Cytoscape 渲染运行时单例 composable：负责实例生命周期、GraphData → 画布同步
 *     与视觉层操作。是 GraphData 的只读投影——不持有、不修改 GraphData，不访问
 *     graph_store / ui_store，Cytoscape 不是事实源。
 *
 * 调用契约：
 *
 *     1. 首次调用必须传 containerRef 创建单例；后续调用不传参，返回同一实例。
 *     2. syncFromGraphData 是唯一接收 GraphData 的入口，仅做映射，不落任何状态。
 */

import cytoscape from 'cytoscape'
import cytoscapeCanvas from 'cytoscape-canvas'
import type { Core } from 'cytoscape'
import type { Ref } from 'vue'
import { watch } from 'vue'

import type { GraphData, NodePosition } from '@my-project/graph-engine'
import { DEFAULT_LAYOUT_RULES } from '@my-project/graph-engine'

import type { CyInteractionHandlers } from './cy_interaction'

import { mapGraphDataToCyElements } from './cy_element_mapper'
import { bindCyEvents } from './cy_interaction'
import { createCytoscapeStyle } from './cy_style'

// 注册 cytoscape-canvas 扩展（用于格点背景）
cytoscape.use(cytoscapeCanvas)

// 模块级 renderer 单例引用
let singleton: RendererAPI | null = null

/**
 * 说明：
 *
 *     useRenderer 返回的 API 接口。
 *
 * 调用契约：
 *
 *     1. 所有方法在 composable 闭包内访问私有 cy。
 *     2. 外部无法通过此 API 获取裸 Cytoscape 实例。
 */
interface RendererAPI {
    /**
     * 说明：
     *
     *     创建 Cytoscape 实例并挂载到 DOM 容器，同时绑定交互事件。
     *     初始 elements 为空，真实图元素由 syncFromGraphData() 注入。
     *
     * 调用契约：
     *
     *     1. 只能在 containerRef.value 存在后调用；容器缺失时静默返回。
     *
     * 参数：
     *
     *     handlers — 调用方提供的语义交互处理器，经 bindCyEvents 绑定到实例。
     */
    mount(handlers: CyInteractionHandlers): void

    /**
     * 说明：
     *
     *     销毁当前 Cytoscape 实例并释放全部资源：交互事件、格点层、定时器与 class 记录。
     *
     * 调用契约：
     *
     *     1. 组件卸载前必须调用。
     */
    destroy(): void

    /**
     * 说明：
     *
     *     将 GraphData 重新映射为 CyElements 并整体注入。
     *
     * 调用契约：
     *
     *     1. 未挂载时静默返回。
     *     2. 同步会清空全部 owner 的 class 预览（classOwners）——持有预览的调用方需知晓。
     *
     * 参数：
     *
     *     graphData — 当前 GraphData（来自 graphStore.graphView）。
     */
    syncFromGraphData(graphData: GraphData): void

    /**
     * 说明：
     *
     *     将视口动画移动到指定元素，并施加短暂高亮提示。
     *
     * 调用契约：
     *
     *     1. 只操作 Cytoscape 视口与样式 class，不触碰 GraphData。
     *     2. 高亮 1.2s 后自动移除。
     *     3. 当前缩放级别低于 1 时提升到 1，保证目标元素清晰可辨。
     *
     * 参数：
     *
     *     elementId — 目标节点/边的 ID，与 CyElements 中的 id 一致。
     */
    centerOnElement(elementId: string): void

    /**
     * 说明：
     *
     *     获取节点的当前视觉位置。
     *
     * 调用契约：
     *
     *     1. 只读取 Cy 视觉层的当前坐标，而非 GraphData 中持久化的坐标。
     *
     * 参数：
     *
     *     nodeId — 目标节点 ID
     */
    getNodePosition(nodeId: string): NodePosition | null

    /**
     * 说明：
     *
     *     为节点添加一个由指定 owner 管理的 class。
     *
     * 调用契约：
     *
     *     1. 仅管理 class，不操作 position。
     *     2. 同一 owner + nodeId + className 组合可重复调用（幂等）。
     *
     * 参数：
     *
     *     nodeId — 目标节点 ID
     *     className — 要添加的 class 名
     *     owner — 施加该 class 的拥有者标识（如 'move'），用于 clearAllPreviews
     */
    addNodeClass(nodeId: string, className: string, owner: string): void

    /**
     * 说明：
     *
     *     为节点移除一个由指定 owner 管理的 class。
     *
     * 调用契约：
     *
     *     1. 仅管理 class，不操作 position。
     *     2. 组合不存在时静默返回。
     *
     * 参数：
     *
     *     nodeId — 目标节点 ID
     *     className — 要移除的 class 名
     *     owner — 最初施加该 class 的拥有者标识
     */
    removeNodeClass(nodeId: string, className: string, owner: string): void

    /**
     * 说明：
     *
     *     清除指定 owner 施加的全部 class（仅 class，不重置 position）。
     *
     * 调用契约：
     *
     *     1. 不操作 position，只移除 class。
     *     2. owner 无记录时静默返回。
     *
     * 参数：
     *
     *     owner — 拥有者标识（如 'move'）
     */
    clearAllPreviews(owner: string): void

    /**
     * 说明：
     *
     *     在 Cy 容器上绑定原生 DOM mousemove 监听，手动把屏幕坐标换算为模型坐标后回调
     *     （原生 DOM 事件无 Cytoscape 位置数据，故坐标手动换算，不依赖 Cytoscape 事件 API）。
     *
     * 调用契约：
     *
     *     1. 每次 activate 调用一次，返回的 stop 必须在 deactivate 时调用——否则监听泄漏。
     *     2. cy 或容器不可用时返回无操作 stop，不抛错。
     *
     * 注意：
     *
     *     回调随 mousemove 高频触发，调用方按需自行节流。
     *
     * 参数：
     *
     *     callback — 每次 mousemove 触发时被调用，参数为模型坐标
     */
    trackCursor(callback: (modelPos: NodePosition) => void): { stop(): void }

    /**
     * 说明：
     *
     *     反应式外部高亮。监听 getter 返回的 ID，自动为对应元素施加/移除 className。
     *
     * 调用契约：
     *
     *     1. 函数内部调 watch()，只能在 composable / setup 上下文中调用。
     *     2. getter 变化时：旧 ID 移除 class，新 ID 施加 class。
     *     3. getter 返回 null / undefined 时清除旧 ID 的 class。
     *
     * 参数：
     *
     *     getter — 返回需要高亮的元素 ID
     *     className — 要施加/移除的 class 名
     */
    bindHighlight(getter: () => string | null | undefined, className: string): void
}

/**
 * 说明：
 *
 *     获取/创建 Cytoscape 渲染器运行时单例。
 *
 * 调用契约：
 *
 *     1. 首次调用必须传入 containerRef，后续调用可不传。
 *     2. mount() 必须在 onMounted 内显式调用，不在创建时自动挂载。
 *     3. bindHighlight 只能在 composable / setup 上下文中调用（内部调 watch）。
 *
 * 参数：
 *
 *     containerRef — 可选。首次调用时必须传入 Vue 模板中 cy 容器的 ref。
 *                    后续调用（无参）返回已创建的单例。
 */
export function useRenderer(
    containerRef?: Ref<HTMLElement | null>,
): RendererAPI {
    if (singleton) {
        return singleton
    }

    if (!containerRef) {
        throw new Error(
            '[useRenderer] First call must provide containerRef. ' +
            'Call useRenderer(cyContainer) from Graph.vue setup before tools access it.',
        )
    }

    // ── 闭包内部状态 ──

    /** Cytoscape 实例生命周期：mount() 创建，destroy() 置 null。 */
    let cy: Core | null = null

    /** 移除 search-focus 高亮的定时器。新调用先清旧定时器，保证同时最多一个高亮。 */
    let highlightClearTimer: ReturnType<typeof setTimeout> | null = null

    let unbindEvents: (() => void) | null = null

    /** cyCanvas 格点背景层。destroy() 时置 null。 */
    let gridBackgroundLayer: ReturnType<Core['cyCanvas']> | null = null

    /** owner（如 'move'）施加的 class 记录。仅管理 class，不操作 position。 */
    type OwnerClassMap = Map<string, Map<string, Set<string>>>
    const classOwners: OwnerClassMap = new Map()

    function mount(handlers: CyInteractionHandlers): void {
        const container = containerRef?.value
        if (!container) {
            return
        }

        cy = cytoscape({
            container,
            elements: [],
            style: createCytoscapeStyle(),
            layout: {
                name: 'preset',  // 必须用 preset，避免自动布局覆盖 GraphData.position
            },
            userPanningEnabled: true,
            userZoomingEnabled: true,
            autoungrabify: true,
        })

        // 绑定 cy 交互事件
        const events = bindCyEvents(cy, handlers)
        unbindEvents = events.destroy

        // 格点背景：cyCanvas 插件提供一张独立 canvas 层（canvas 默认全透明，本层只画圆点）。
        // zIndex 0 使其垫在 Cytoscape 主画布之下——格点从主画布透明像素中透出，不遮节点/边。
        gridBackgroundLayer = cy.cyCanvas({ zIndex: 0 })
        gridBackgroundLayer.getCanvas().style.pointerEvents = 'none'  // 鼠标穿透到主画布，否则平移/点击会被本层挡住
        cy.on('render cyCanvas.resize', drawDotGrid)  // 视口重绘或画布尺寸变化时重画，保证格点跟随视口对齐
        drawDotGrid()  // 首次调用时，主动绘制一次格点背景
    }

    function destroy(): void {
        if (highlightClearTimer !== null) {
            clearTimeout(highlightClearTimer)
            highlightClearTimer = null
        }

        if (unbindEvents !== null) {
            unbindEvents()
            unbindEvents = null
        }

        if (gridBackgroundLayer && cy) {
            cy.off('render cyCanvas.resize', drawDotGrid)  // 先于 cy.destroy() 解绑：off 依赖存活的 cy
            gridBackgroundLayer = null
        }

        if (cy) {
            cy.destroy()
            cy = null
        }

        classOwners.clear()
    }

    function syncFromGraphData(graphData: GraphData): void {
        if (!cy) {
            return
        }

        const cyElements = mapGraphDataToCyElements(graphData)
        cy.json({ elements: cyElements })
        cy.resize()

        // 清除全部过程中的视觉状态
        classOwners.clear()
    }


    // ── 视口定位 ──

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

        if (highlightClearTimer !== null) {
            clearTimeout(highlightClearTimer)
        }

        element.addClass('search-focus')
        highlightClearTimer = setTimeout(() => {
            element.removeClass('search-focus')
            highlightClearTimer = null
        }, 1200)
    }

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

    function addNodeClass(nodeId: string, className: string, owner: string): void {
        if (!cy) {
            return
        }

        const el = cy.getElementById(nodeId)
        if (el.length === 0) {
            return
        }

        el.addClass(className)

        // 记账：把 (owner, nodeId, className) 记入 classOwners，供 clearAllPreviews(owner) 翻账本批量移除。
        // 注意：Map.get() 返回账本内对象的引用（本项目少见的用法）——classSet.add() 直接修改账本中的 Set 本体。
        // 函数结束后局部变量销毁，账本数据不受影响。
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


    // ── 私有辅助：格点背景 ──

    /**
     * 说明：
     *
     *     在 canvas overlay 上绘制离散格点背景。
     *     格点间距 = DEFAULT_LAYOUT_RULES.unitDistance。
     */
    function drawDotGrid(): void {
        if (!gridBackgroundLayer || !cy) {
            return
        }

        const ctx = gridBackgroundLayer.getCanvas().getContext('2d')
        if (!ctx) {
            return
        }

        // 清除上一帧
        gridBackgroundLayer.resetTransform(ctx)
        gridBackgroundLayer.clear(ctx)

        // 切换到模型坐标系（自动跟随 zoom / pan）
        gridBackgroundLayer.setTransform(ctx)

        const unitDistance = DEFAULT_LAYOUT_RULES.unitDistance
        const dotRadius = 1.4  // 模型空间圆点半径，zoom=1 时对应 1.4 CSS px

        // 可视范围（模型坐标）
        const extent = cy.extent()

        const startX = Math.floor(extent.x1 / unitDistance) * unitDistance
        const startY = Math.floor(extent.y1 / unitDistance) * unitDistance
        const endX = Math.ceil(extent.x2 / unitDistance) * unitDistance
        const endY = Math.ceil(extent.y2 / unitDistance) * unitDistance
        ctx.fillStyle = 'rgba(100, 116, 139, 0.22)'
        for (let x = startX; x <= endX; x += unitDistance) {
            for (let y = startY; y <= endY; y += unitDistance) {
                ctx.beginPath()
                // 画圆周
                ctx.arc(x, y, dotRadius, 0, 2 * Math.PI)
                // 给圆填色
                ctx.fill()
            }
        }
    }

    const api: RendererAPI = {
        mount,
        destroy,
        syncFromGraphData,
        centerOnElement,
        getNodePosition,
        addNodeClass,
        removeNodeClass,
        clearAllPreviews,
        trackCursor,
        bindHighlight,
    }

    singleton = api
    return api
}
