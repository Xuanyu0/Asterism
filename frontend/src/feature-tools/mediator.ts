/**
 * 说明：
 *
 *     全局单例工具中介者：负责工具注册、激活/取消、事件转发。
 *
 * 调用契约：
 *
 *     1. 同一时刻最多一个激活工具——activate 新工具前自动取消当前。
 *     2. 初始化即激活 default，不存在"无工具"状态；取消工具一律走 deactivate()（恢复 default）。
 *     3. 不直接修改 GraphData——图操作由激活的 handler 经 graphStore 完成。
 */

import { ref, shallowRef, type ShallowRef, type Ref } from 'vue'

import type { ToolId, ToolHandler } from './types'
import { useDefaultTool } from './default_tool'
import { useFloatingWindow } from '@/composables/useFloatingWindow'

/**
 * 说明：
 *
 *     useToolMediator 返回的工具中介者 API。
 *
 * 调用契约：
 *
 *     1. 事件转发只送达当前激活的 handler。
 *     2. registry 可直接读取；修改请走 register()。
 */
export interface ToolMediatorAPI {
    /** 当前激活工具 id（初始化即 default，不存在"无工具"状态）。 */
    activeToolId: Ref<ToolId>

    /** 当前激活的 handler 引用。 */
    activeHandler: ShallowRef<ToolHandler>

    /** 工具注册表（id → handler）。修改请走 register()，勿直接写入。 */
    registry: Map<ToolId, ToolHandler>

    /**
     * 说明：
     *
     *     注册工具 handler，供 activate 按 id 激活。
     *
     * 参数：
     *
     *     id — 工具标识
     *     handler — 该工具的事件处理实现
     */
    register(id: ToolId, handler: ToolHandler): void

    /**
     * 说明：
     *
     *     激活指定工具；激活新工具前自动取消当前激活的工具（互斥）。
     *
     * 调用契约：
     *
     *     1. id 未注册时静默返回，当前状态不变。
     *     2. 切换工具时自动关闭浮空窗。
     *
     * 参数：
     *
     *     id — 目标工具标识；取消工具请走 deactivate()
     */
    activate(id: ToolId): void

    /**
     * 说明：
     *
     *     取消当前激活的工具，恢复 default 工具作为 baseline。
     *
     * 调用契约：
     *
     *     1. 调用后必有激活工具（default），不产生"无工具"状态。
     */
    deactivate(): void

    /** 将画布点击事件转发给当前激活工具。 */
    onCanvasClick(pos: { x: number; y: number }): void

    /** 将节点点击事件转发给当前激活工具。 */
    onNodeClick(nodeId: string): void

    /** 将边点击事件转发给当前激活工具。 */
    onEdgeClick(edgeId: string): void

    /** 将节点双击事件转发给当前激活工具。 */
    onNodeDoubleClick(nodeId: string): void

    /** 将节点悬停事件转发给当前激活工具。 */
    onNodeHover(nodeId: string): void

    /** 将节点悬停离开事件转发给当前激活工具。 */
    onNodeHoverOut(nodeId: string): void

    /** 画布右键：取消当前工具（最终会恢复为 default）。 */
    onRightClick(): void
}

let singleton: ToolMediatorAPI | null = null

/**
 * 说明：
 *
 *     获取全局唯一工具中介者实例（懒创建）。
 *
 * 调用契约：
 *
 *     1. 必须在 Pinia 安装后调用（setup 内或之后，createMediator 会创建
 *        default handler 与浮空窗单例，二者内部使用 graphStore）。
 *     2. 后续调用返回同一实例。
 */
export function useToolMediator(): ToolMediatorAPI {
    if (!singleton) {
        singleton = createMediator()
    }
    return singleton
}

function createMediator(): ToolMediatorAPI {
    // ── 状态 ──

    const handlerRegistry: Map<ToolId, ToolHandler> = new Map()

    // 自动注册 default 兜底 handler 并初始激活——不存在"无工具"状态
    const defaultHandler = useDefaultTool()
    handlerRegistry.set('default', defaultHandler)

    const activeToolId: Ref<ToolId> = ref<ToolId>('default')
    const activeHandler: ShallowRef<ToolHandler> =
        shallowRef<ToolHandler>(defaultHandler)
    defaultHandler.activate()

    function register(id: ToolId, handler: ToolHandler): void {
        handlerRegistry.set(id, handler)
    }

    function activate(id: ToolId): void {
        activeHandler.value.deactivate()

        const handler = handlerRegistry.get(id)
        if (!handler) {
            return
        }

        handler.activate()
        activeToolId.value = id
        activeHandler.value = handler

        // 切换工具时自动关闭浮空窗，避免旧浮空窗在非 default 工具下 Confirm 静默失败
        useFloatingWindow().close()
    }

    function deactivate(): void {
        activeHandler.value.deactivate()

        // 恢复 default 工具作为 baseline（createMediator 已注册，保证存在）
        const defaultHandler = handlerRegistry.get('default')!
        defaultHandler.activate()
        activeToolId.value = 'default'
        activeHandler.value = defaultHandler
    }

    // ── 事件转发 ──

    function onCanvasClick(pos: { x: number; y: number }): void {
        activeHandler.value?.onCanvasClick?.(pos)
    }

    function onNodeClick(nodeId: string): void {
        activeHandler.value?.onNodeClick?.(nodeId)
    }

    function onEdgeClick(edgeId: string): void {
        activeHandler.value?.onEdgeClick?.(edgeId)
    }

    function onNodeDoubleClick(nodeId: string): void {
        activeHandler.value?.onNodeDoubleClick?.(nodeId)
    }

    function onNodeHover(nodeId: string): void {
        activeHandler.value?.onNodeHover?.(nodeId)
    }

    function onNodeHoverOut(nodeId: string): void {
        activeHandler.value?.onNodeHoverOut?.(nodeId)
    }

    function onRightClick(): void {
        deactivate()
    }

    const api: ToolMediatorAPI = {
        activeToolId,
        activeHandler,
        registry: handlerRegistry,
        register,
        activate,
        deactivate,
        onCanvasClick,
        onNodeClick,
        onEdgeClick,
        onNodeDoubleClick,
        onNodeHover,
        onNodeHoverOut,
        onRightClick,
    }
    return api
}
