/**
 * tools/types.ts
 *
 * 功能：
 *     工具交互架构的共享类型定义。
 *
 * 总体结构：
 *     1. ToolId — 8 种原子工具 ID（与 ui_types.OperationTool 同步）
 *     2. ToolNotification — 工具通知模型（如删除确认弹窗）
 *     3. ToolHandler — 工具处理器接口（DraftNode 类型由 add-node.ts 提供）
 *     4. ToolConfig — 注册表条目（按钮显示 + 处理器工厂）
 *
 * 外部如何使用：
 *     所有 handler 模块和 router 从本文件导入类型。
 */

import type { Component } from 'vue'
import type { OperationTool } from '@/definitions/types/ui_types'

// 服务特定实现的类型
import type { DraftNode } from './toolbar/add-node'

/**
 * 功能：
 *     原子工具 ID。与 ui_types.ts 中 OperationTool 保持同步。
 */
export type ToolId = OperationTool

/**
 * 功能：
 *     工具通知模型。用于展示删除确认等交互提示。
 */
export interface ToolNotification {
    visible: boolean
    message: string
    onCancel(): void
}

/**
 * 功能：
 *     工具处理器接口。每个自包含的工具栏工具实现本接口。
 *
 * 规则：
 *     1. 每个 handler 独立管理内部状态。
 *     2. 事件通过 router 转发到 activeHandler。
 *     3. cursorClass / notification 暴露为计算属性让视图层消费。
 */
export interface ToolHandler {
    id: ToolId
    readonly isActive: boolean

    activate(): void
    deactivate(): void

    onCanvasClick?(pos: { x: number; y: number }): void
    onNodeClick?(nodeId: string): void
    onEdgeClick?(edgeId: string): void

    onConfirm?(label: string, summary: string): void
    onCancel?(): void

    readonly cursorClass: string | null
    readonly notification: ToolNotification | null
    
    /** 需要 Cytoscape 高亮的目标节点 ID。null 表示不高亮。可选——无高亮需求的 handler 不提供。 */
    readonly highlightNode?: string | null
    /** 需要 Cytoscape 高亮的目标边 ID。null 表示不高亮。可选——无高亮需求的 handler 不提供。 */
    readonly highlightEdge?: string | null

    /** 工具的当前节点草稿。null 表示无草稿。可选——无草稿需求的 handler 不提供。 */
    readonly draftNode?: DraftNode | null
    /** 浮空窗编辑时回调。可选——无草稿编辑需求的 handler 不提供。 */
    updateDraftNode?(patch: Partial<DraftNode>): void
}

/**
 * 功能：
 *     注册表条目。描述按钮显示信息与处理器工厂。
 *
 * 使用：
 *     toolbar/registry.ts 输出 ToolConfig[]。
 *     GraphOperationToolbar.vue 读取 icon/label 渲染按钮。
 *     Graph.vue 调用 useTool() 创建 handler 并注册到 router。
 */
export interface ToolConfig {
    id: ToolId
    icon: Component
    iconClass?: string
    label: string
    useTool(): ToolHandler
}
