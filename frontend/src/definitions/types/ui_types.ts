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
 *     4. OperationTool：Operation 模式下的一级工具。
 *     5. AddTarget：添加操作下的二级目标。
 *     6. PendingAddNodeState：添加节点时的待定状态。
 *     7. PendingAddEdgeState：添加边时的待定状态。
 *     8. NavigationCardState：导航卡片状态。
 *     9. UIStateSnapshot：UI 全局状态快照。
 *
 * 外部如何使用：
 *     ui_store.ts 从本文件导入类型。
 *     组件不直接猜测字符串，而是使用这些类型约束 UI Runtime 状态。
 */

import type {
    EdgeDirection,
    EdgeKind,
    KnowledgeNodeKind,
    NodeId,
} from '@my-project/graph-engine'

export type InteractionMode = 'cognition' | 'operation' | 'arrangement' | null
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

/**
 * 功能：
 *     定义 Operation 模式下的一级工具。
 *
 * 规则：
 *     1. add 只是一级入口，不直接说明添加节点还是添加边。
 *     2. delete 表示删除模式。
 *     3. move 表示移动节点模式。
 *     4. fold 表示依赖折叠 / 展开模式。
 */
export type OperationTool =
    | 'add'
    | 'delete'
    | 'fold'

/**
 * 功能：
 *     定义 add 工具展开后的二级目标。
 *
 * 规则：
 *     1. node 表示准备添加节点。
 *     2. edge 表示准备添加边。
 *     3. null 表示尚未选择具体添加目标。
 */
export type AddTarget =
    | 'node'
    | 'edge'

/**
 * 功能：
 *     描述添加节点时的待定状态。
 *
 * 规则：
 *     1. kind 为 null 表示还没有选择实节点或虚节点。
 *     2. kind 不为 null 时，用户下一次点击空白画布会进入节点草稿流程。
 *     3. 节点草稿在 label 未补全前不应该写入 GraphData。
 */
export interface PendingAddNodeState {
    kind: KnowledgeNodeKind | null    // 当前准备添加的节点类型
}

/**
 * 功能：
 *     描述添加边时的待定状态。
 *
 * 规则：
 *     1. kind 表示实边或虚边。
 *     2. direction 表示有向边或无向边。
 *     3. sourceNodeId 表示用户第一次点击的节点。
 *     4. 有向边中，第一次点击为 source，第二次点击为 target。
 *     5. 无向边也保留点击顺序，但语义上不区分方向。
 */
export interface PendingAddEdgeState {
    kind: EdgeKind | null    // 当前准备添加的边类型
    direction: EdgeDirection | null    // 当前准备添加的边方向
    sourceNodeId: NodeId | null    // 添加边时第一次点击的节点
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
    pendingAddTarget: AddTarget | null    // 当前 Add 二级目标
    pendingAddNode: PendingAddNodeState    // 当前添加节点待定状态
    pendingAddEdge: PendingAddEdgeState    // 当前添加边待定状态
    navigationCardState: NavigationCardState    // 导航卡片状态
    immersiveModeEnabled: boolean    // 是否开启沉浸模式
    aiPanelExpanded: boolean    // AI 面板是否展开
}
