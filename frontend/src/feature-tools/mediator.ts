/**
 * tools/tool_mediator.ts
 *
 * 功能：
 *     全局单例工具中介者（Mediator）。负责工具注册、激活/取消、互斥保证、事件转发。
 *
 * 总体结构：
 *     1. 模块级单例状态
 *     2. createRouter() — 创建中介者实例
 *     3. useToolMediator() — 获取/创建单例
 *
 * 规则：
 *     1. 同一时刻最多一个工具处于激活状态。
 *     2. 激活新工具前自动取消当前工具。
 *     3. 事件通过 handler 的可选方法转发。
 *
 * 外部如何使用：
 *     import { useToolMediator } from '@/tools/tool_mediator'
 *     const mediator = useToolMediator()
 *     mediator.activate('add-real-node')
 *     mediator.onNodeClick(nodeId)
 *     mediator.onRightClick()
 */

import { ref, shallowRef, type ShallowRef, type Ref } from 'vue'

import type { ToolId, ToolHandler } from './types'
import { useUIStore } from '@/ui/ui_store'


// ── 模块级单例 ──

let singleton: ReturnType<typeof createMediator> | null = null

/**
 * 功能：
 *     获取全局唯一工具中介者实例（懒创建）。
 *
 * 规则：
 *     1. 必须在 Pinia 安装后调用（setup 内或之后）。
 *     2. 后续调用返回同一实例。
 */
export function useToolMediator(): ReturnType<typeof createMediator> {
    if (!singleton) {
        singleton = createMediator()
    }
    return singleton
}

function createMediator() {
    // ── 状态 ──

    const activeToolId: Ref<ToolId | null> = ref(null)
    const activeHandler: ShallowRef<ToolHandler | null> = shallowRef(null)
    const handlerRegistry: Map<ToolId, ToolHandler> = new Map()
    const uiStore = useUIStore()

    // ── 注册 ──

    function register(id: ToolId, handler: ToolHandler): void {
        handlerRegistry.set(id, handler)
    }

    // ── 激活/取消 ──

    function activate(id: ToolId | null): void {
        // 取消当前
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

        // 恢复 default 工具作为 baseline
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

    return {
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
}
