/**
 * ui_types.ts
 *
 * 功能：
 * 定义知识图谱前端 UI 系统的状态类型。
 * 
 * 总体结构：
 * 1. InteractionMode：两种核心交互模式（认知 / 操作）
 * 2. BaseInteractionState：基础交互能力（相机 + 点击能力同时存在）
 * 3. CognitionAction：认知演化操作
 * 4. OperationAction：修改/显示操作
 * 5. UIAction：当前被激活的操作
 * 6. NavigationCardState：导航卡片状态
 * 7. UIStateSnapshot：全局 UI 状态快照
 *
 * 外部使用方式：
 * import type { UIStateSnapshot, UIAction, InteractionMode } from '@/types/ui_types'
 */

export type InteractionMode = 'cognition' | 'operation'    // 当前主交互模式

/**
 * BaseInteractionState
 * 基础交互能力，默认同时具备相机拖拽平移和点击交互能力
 */
export interface BaseInteractionState {
    cameraEnabled: boolean    // 是否允许拖拽平移和滚轮缩放
    clickEnabled: boolean     // 是否允许点击节点或边弹出浮空窗
}

/**
 * CognitionAction
 * 定义认知演化相关操作
 */
export type CognitionAction =
    | 'explore'       // 探索
    | 'discover'      // 发掘
    | 'deconstruct'   // 解构
    | 'induce'        // 归纳
    | 'internalize'   // 内化（常识化）

/**
 * OperationAction
 * 定义修改/显示相关操作
 */
export type OperationAction =
    | 'add'
    | 'add_node'
    | 'add_edge'
    | 'delete'
    | 'collapse'
    | 'expand'
    | 'move_node'

/**
 * UIAction
 * 当前被激活的操作，可以是认知操作、修改操作，或者 null 表示无操作
 */
export type UIAction = CognitionAction | OperationAction | null

/**
 * NavigationCardState
 * 导航卡片三种状态
 */
export type NavigationCardState = 'dock' | 'expand' | 'hidden'

/**
 * UIStateSnapshot
 * 全局 UI 状态快照
 * 前端组件从这个状态读取或订阅变化，实现 UI 可插拔和沉浸浏览模式
 */
export interface UIStateSnapshot {
    interactionMode: InteractionMode                     // 当前主模式
    baseInteraction: BaseInteractionState              // 基础交互能力（相机 + 点击同时存在）
    activeAction: UIAction                              // 当前激活操作
    navigationCardState: NavigationCardState           // 导航卡片状态
    immersiveModeEnabled: boolean                       // 是否开启沉浸模式
    aiPanelExpanded: boolean                             // AI 面板是否展开
}
