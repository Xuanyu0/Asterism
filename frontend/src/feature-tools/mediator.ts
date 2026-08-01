/**
 * 说明：
 *
 *     全局单例工具中介者：负责工具注册、激活/取消、事件转发。
 *
 * 调用契约：
 *
 *     1. 同一时刻最多一个激活工具——activate 新工具前自动取消当前。
 *     2. 不直接修改 GraphData——图操作由激活的 handler 经 graphStore 完成。
 */

import { ref, shallowRef, type ShallowRef, type Ref } from 'vue'

import type { ToolId, ToolHandler } from './types'
import { useUIStore } from '@/ui/ui_store'
import { useDefaultTool } from './default_tool'

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
export interface ToolMediator {
    /** 当前激活工具 id（null = 无激活工具）。 */
    activeToolId: Ref<ToolId | null>

    /** 当前激活的 handler 引用。 */
    activeHandler: ShallowRef<ToolHandler | null>

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
     *     1. id 为 null 时复位为无激活工具。
     *     2. id 未注册时静默返回，当前状态不变。
     *     3. 切换工具时自动关闭浮空窗。
     *
     * 参数：
     *
     *     id — 目标工具标识；null 表示取消当前工具
     */
    activate(id: ToolId | null): void

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

    /** 画布右键：取消当前工具（最终会恢复为 default）。 */
    onRightClick(): void
}

let singleton: ToolMediator | null = null

/**
 * 说明：
 *
 *     获取全局唯一工具中介者实例（懒创建）。
 *
 * 调用契约：
 *
 *     1. 必须在 Pinia 安装后调用（setup 内或之后，Mediator 内部使用 uiStore）。
 *     2. 后续调用返回同一实例。
 */
export function useToolMediator(): ToolMediator {
    if (!singleton) {
        singleton = createMediator()
    }
    return singleton
}

function createMediator(): ToolMediator {
    // ── 状态 ──

    const activeToolId: Ref<ToolId | null> = ref(null)
    const activeHandler: ShallowRef<ToolHandler | null> = shallowRef(null)
    const handlerRegistry: Map<ToolId, ToolHandler> = new Map()
    const uiStore = useUIStore()

    // 自动注册 default 兜底 handler（mediator 启动时注册，调用方无需关心）
    handlerRegistry.set('default', useDefaultTool())

    function register(id: ToolId, handler: ToolHandler): void {
        handlerRegistry.set(id, handler)
    }

    function activate(id: ToolId | null): void {
        if (activeHandler.value) {
            activeHandler.value.deactivate()
        }

        if (id === null) {
            activeToolId.value = null
            activeHandler.value = null
            return
        }

        const handler = handlerRegistry.get(id)
        if (!handler) {
            return
        }

        handler.activate()
        activeToolId.value = id
        activeHandler.value = handler

        // 切换工具时自动关闭浮空窗，避免旧浮空窗在非 default 工具下 Confirm 静默失败
        uiStore.closeFloatingWindow()
    }

    function deactivate(): void {
        if (activeHandler.value) {
            activeHandler.value.deactivate()
        }

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

    function onRightClick(): void {
        deactivate()
    }

    const api: ToolMediator = {
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
        onRightClick,
    }
    return api
}
