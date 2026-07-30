/**
 * tools/types.ts
 *
 * 功能：
 *     工具交互架构的共享类型定义。
 *
 * 总体结构：
 *     1. OperationTool — 8 种原子工具 ID
 *     2. CognitionTool — 认知演化操作 ID
 *     3. ArrangementTool — 布局操作 ID
 *     4. ToolId — 全工具联合类型
 *     5. ToolNotification — 工具通知模型
 *     6. ToolHandler — 工具处理器接口
 *     7. ToolConfig — 注册表条目
 *
 * 外部如何使用：
 *     所有 handler 模块从本文件导入类型。
 */

import type { Component } from 'vue'

// 服务特定实现的类型
import type { DraftNode } from './toolbar/add-node'

/**
 * 功能：
 *     定义常驻工具栏下平铺的 8 种原子工具。
 */
export type OperationTool =
    | 'add-real-node'
    | 'add-virtual-node'
    | 'add-real-directed'
    | 'add-real-undirected'
    | 'add-virtual-directed'
    | 'add-virtual-undirected'
    | 'delete'
    | 'fold'

/**
 * 功能：
 *     定义 Cognition 模式下的认知演化操作。
 *
 * 规则：
 *     1. CognitionTool 不直接等于图 CRUD。
 *     2. 这些操作未来通常会进入 Graph Transform Runtime 或 AI Runtime。
 */
export type CognitionTool =
    | 'explore'    // 探索
    | 'unearth'    // 发掘
    | 'deconstruct'    // 解构
    | 'induce'    // 归纳
    | 'internalize'    // 内化 / 常识化
    | 'diverge'    // 发散

/**
 * 功能：
 *     定义 Arrangement 模式下的布局操作。
 *
 * 规则：
 *     1. 每种操作有独立的选择 → 预览 → 确认流程。
 *     2. move 为单节点拖拽，不需要多选。
 *     3. orbit / path 需要选择中心/轴心 + 多个目标节点。
 *     4. adjustDistance / adjustOrbit 为连续微调操作。
 */
export type ArrangementTool =
    | 'move'    // 单节点移动
    | 'orbit'    // 环绕布局
    | 'path'    // 路径布局
    | 'adjustDistance'    // 调整距离
    | 'adjustOrbit'    // 调整轨道

/**
 * 功能：
 *     全工具联合类型。包含所有可激活的工具 ID。
 */
export type ToolId = OperationTool | CognitionTool | ArrangementTool | 'default'

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
    onNodeDoubleClick?(nodeId: string): void

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
 *     GraphPermanentToolbar.vue 读取 icon/label 渲染按钮。
 *     Graph.vue 调用 useTool() 创建 handler 并注册到 router。
 */
export interface ToolConfig {
    id: ToolId
    icon: Component
    iconClass?: string
    label: string
    useTool(): ToolHandler
}
