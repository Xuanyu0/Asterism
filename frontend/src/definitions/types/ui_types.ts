/**
 * ui_types.ts
 *
 * 功能：
 *     定义知识图谱前端 UI Runtime 的状态类型。
 *     本文件只描述 UI 当前处于什么状态，不直接修改 GraphData。
 *
 * 总体结构：
 *     1. InteractionMode：认知 / 操作 两种主模式。
 *     2. BaseInteractionState：基础相机与点击能力。
 *     3. CognitionAction：认知演化操作。
 *     4. OperationTool：平铺的 8 种原子工具。
 *     5. OperationRuntimeState：操作运行时中间状态。
 *     6. NavigationCardState：导航卡片状态。
 *     7. UIStateSnapshot：UI 全局状态快照。
 *
 * 外部如何使用：
 *     ui_store.ts 从本文件导入类型。
 *     组件不直接猜测字符串，而是使用这些类型约束 UI Runtime 状态。
 */

import type {
    NodeId,
    EdgeId,
} from '@my-project/graph-engine'

export type InteractionMode = 'cognition' | 'arrangement' | null
// 当前主交互模式。null 表示未激活任何模式（默认状态）。
// arrangement 为 Phase 2 占位。

/**
 * 功能：
 *     描述知识图谱基础交互能力。
 *
 * 规则：
 *     1. 相机能力和点击能力可以同时存在。
 *     2. 具体工具模式不应该直接关闭基础能力，除非交互逻辑明确需要。
 *
 * 使用：
 *     uiState.baseInteraction.cameraEnabled
 */
export interface BaseInteractionState {
    cameraEnabled: boolean    // 是否允许拖拽平移和滚轮缩放
    clickEnabled: boolean    // 是否允许点击节点或边弹出浮空窗
}

/**
 * 功能：
 *     定义 Cognition 模式下的认知演化操作。
 *
 * 规则：
 *     1. CognitionAction 不直接等于图 CRUD。
 *     2. 这些操作未来通常会进入 Graph Transform Runtime 或 AI Runtime。
 */
export type CognitionAction =
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
export type ArrangementAction =
    | 'move'    // 单节点移动
    | 'orbit'    // 环绕布局
    | 'path'    // 路径布局
    | 'adjustDistance'    // 调整距离
    | 'adjustOrbit'    // 调整轨道

/**
 * 功能：
 *     定义 Operation 模式下平铺的 8 种原子工具。
 *
 * 规则：
 *     1. 每个工具编码完整的添加路径（目标 + kind + direction）。
 *     2. delete 表示删除模式。
 *     3. fold 表示依赖折叠 / 展开模式。
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
 *     描述 Operation 模式下的运行时中间状态。
 *
 * 规则：
 *     1. 只存储操作执行过程中产生的临时数据。
 *     2. 工具切换时整体复位，不清零则可能造成误操作。
 */
export interface OperationRuntimeState {
    addEdgeSourceNodeId: NodeId | null    // 添加边时第一次点击的节点
    pendingDeleteNodeId: NodeId | null
    pendingDeleteEdgeId: EdgeId | null
}

/**
 * 功能：
 *     当前被激活的高层 UI 操作。
 *
 * 规则：
 *     1. CognitionAction 只在 cognition 模式下有效。
 *     2. OperationTool 只在 operation 模式下有效。
 *     3. null 表示没有激活任何高级操作。
 */
export type UIAction = CognitionAction | OperationTool | null

/**
 * 功能：
 *     定义导航卡片三种状态。
 */
export type NavigationCardState = 'dock' | 'expand' | 'hidden'

/**
 * 功能：
 *     定义 UI Runtime 的全局状态快照。
 *
 * 规则：
 *     1. 本结构只描述 UI 当前状态。
 *     2. 不保存 GraphData 本体。
 *     3. 不直接保存 Cytoscape 实例。
 *     4. 与 GraphData 修改相关的操作，最终必须交给 graph_store。
 */
export interface UIStateSnapshot {
    interactionMode: InteractionMode    // 当前主模式
    baseInteraction: BaseInteractionState    // 基础交互能力
    activeAction: UIAction    // 当前高层激活操作
    selectedCognitionAction: CognitionAction | null    // 当前认知操作
    selectedOperationTool: OperationTool | null    // 当前 Operation 工具
    operationRuntime: OperationRuntimeState    // 操作运行时状态
    navigationCardState: NavigationCardState    // 导航卡片状态
    immersiveModeEnabled: boolean    // 是否开启沉浸模式
    aiPanelExpanded: boolean    // AI 面板是否展开
}
