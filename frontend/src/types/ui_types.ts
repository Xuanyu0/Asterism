/**
 * ui_types.ts
 *
 * 功能：
 *     定义知识图谱前端 UI Runtime 的状态类型。
 *     本文件只描述 UI 当前处于什么状态，不直接修改 GraphData。
 *
 * 总体结构：
 *     1. InteractionMode：认知 / 操作 两种主模式。
 *     2. CognitionAction：认知演化操作。
 *     3. ArrangementAction：布局操作。
 *     4. OperationTool：平铺的 8 种原子工具。
 *
 * 外部如何使用：
 *     ui_store.ts 从本文件导入类型。
 *     组件不直接猜测字符串，而是使用这些类型约束 UI Runtime 状态。
 */


export type InteractionMode = 'cognition' | 'arrangement' | null
// 当前主交互模式。null 表示未激活任何模式（默认状态）。
// arrangement 为 Phase 2 占位。

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
