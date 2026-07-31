/**
 * 功能：
 *
 *     全局单例工具中介者。负责工具注册、激活/取消、互斥保证、事件转发。
 *
 * 总体结构：
 *
 *     1. useToolMediator() — 获取全局唯一中介者实例（懒创建）
 *     2. createMediator() — 创建中介者（注册 / 激活 / 事件转发）
 */

import { ref, shallowRef, type ShallowRef, type Ref } from 'vue'

import type { ToolId, ToolHandler } from './types'
import { useUIStore } from '@/ui/ui_store'
import { useDefaultTool } from './default_tool'


// ── 模块级单例 ──

let singleton: ReturnType<typeof createMediator> | null = null

/**
 * 功能：
 *
 *     获取全局唯一工具中介者实例（懒创建）。
 *
 * 规则：
 *
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

    // 自动注册 default 兜底 handler（mediator 启动时注册，调用方无需关心）
    handlerRegistry.set('default', useDefaultTool())

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
