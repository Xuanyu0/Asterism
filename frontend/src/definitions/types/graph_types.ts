/**
 * graph_types.ts
 *
 * 功能：
 * 定义知识图谱 GraphData、NodeData、EdgeData 以及 Cytoscape 渲染转换类型。
 *
 * 总体结构：
 * 1. Graph：图数据、图类型、认知状态
 * 2. Node：节点身份（知识本体 / 引用投影）、通用属性、专有属性
 * 3. Edge：边数据、边方向、边显示身份（本次未改）
 *
 * 外部如何使用：
 * import type { GraphData, NodeData, EdgeData } from '@/definations/types/graph_types'
 */

// ============================================================
// Graph
// ============================================================

/** 图空间中的二维坐标。表示 Cytoscape model position，不表示 DOM 像素坐标。 */
export interface GraphPosition {
    x: number
    y: number
}

export type GraphId = string // 图 ID：主图、子图、知识块都用它区分作用域
export type NodeId = string // 节点 ID：节点在整个系统中的唯一标识
export type EdgeId = string // 边 ID：边在整个系统中的唯一标识

export type GraphKind = 'main' | 'subgraph' | 'learningBlock' | 'commonLayer' // 图类型：主图 / 子图 / 学习知识块 / 常识层

export interface GraphData {
    id: GraphId
    kind: GraphKind
    title: string // 图标题，用于页面显示和 AI 理解上下文
    parentGraphId?: GraphId // 父图 ID，只有子图通常需要
    ownerNodeId?: NodeId // 拥有该子图的抽象节点 ID，只有 subgraph 通常需要
    nodes: NodeData[]
    edges: EdgeData[]
    cognitiveState?: GraphCognitiveState // 当前图的认知显示状态，随 GraphData 一起持久化
    createdAt?: string // 创建时间，方便 Supabase 长期保存和排序
    updatedAt?: string // 更新时间，方便同步和版本管理
}

export interface GraphCognitiveState {
    foldedDependencies: FoldedDependencyState[] // 用户主动折叠的依赖区域，表示用户当前认知焦点
}

export interface FoldedDependencyState {
    targetNodeId: NodeId // 被聚焦的 DAG 末尾节点
    foldedNodeIds: NodeId[] // 被折叠隐藏的前置依赖节点
}

// ============================================================
// Node — 身份判别（第一层：知识本体 vs 引用投影）
// ============================================================

/**
 * 节点在当前图中的本体身份。
 *
 * - 'knowledge'：知识节点。知识本体属于当前图，修改仅影响当前图。
 * - 'reference'：引用节点。原知识节点在其他图中的投影/代理（C++ 引用语义：
 *   T& r = a，所有操作穿透到 a，用户交互层不暴露"解引用"这个动作）。
 *   底层指针 sourceGraphId / sourceNodeId 仅在 operation_executor 内部使用
 *   和用户主动"定位原节点"时作为导航目标。
 */
export type NodeRole = 'knowledge' | 'reference'

// --- 知识节点子类型 (role === 'knowledge') ---

export type KnowledgeNodeKind = 'virtual' | 'real'
// 'virtual'：虚节点——未掌握的知识，仅标签属性。不可被归纳或解构，只能连接无向虚边。
// 'real'：实节点——已掌握的知识，全属性。可被归纳、解构、常识化。

export type RealNodeForm = 'atomic' | 'abstract'
// 实节点形态，仅 kind === 'real' 时有效。
// 'atomic'：原子知识，不可再分解，abstractionLevel === 0。
// 'abstract'：容器知识，内部有子图，abstractionLevel >= 1。

// --- 引用节点子类型 (role === 'reference') ---

export type ReferenceNodeKind = 'communication' | 'heuristic'
// 'communication'：沟通节点。父子图间纵向联系，双向出现，修改同步。
//   半透明渲染。点击可跳转回父图。属性 sourceGraphId / sourceNodeId 指向原节点。
// 'heuristic'：启发节点。通过"发散"操作创建，横向联系。
//   修改同步作用于原节点。属性 sourceGraphId / sourceNodeId 指向原节点。

// ============================================================
// Node — 通用属性基类 (NodeBase)
// ============================================================

/**
 * 所有节点共享的通用属性。不依赖节点身份，任何代码可安全读取，无需 narrow role。
 *
 * abstractionLevel / childGraphId 放在通用区的原因：
 * 引用节点在创建时从源节点复制这两个值（denormalization），
 * 保证交互层透明——用户在任何地方看到引用节点，都直接支持
 * "展开子图"等操作，不需要先跳转到原节点所在图再操作。
 */
interface NodeBase {
    id: NodeId
    graphId: GraphId // 当前节点所在图 ID
    role: NodeRole // 第一层判别：本体 or 投影
    label: string // 节点标签，直接显示在图上，限制不超过 20 个中文字符
    degree: number // 度数（连接边数量），由 assembleGraph 自动计算
    position?: NodePosition // 节点在图空间中的持久化位置，拖动结束后写回
    abstractionLevel: number // 认知抽象等级。虚节点/原子实节点恒为 0，抽象实节点 >= 1。
    // 引用节点创建时从源节点复制，用于自身渲染和交互决策。
    childGraphId?: GraphId // 拥有子图的 ID。仅抽象实节点有值，引用节点从源节点复制。
}

// ============================================================
// Node — 知识节点 (role === 'knowledge')
// ============================================================

/**
 * 知识节点——知识本体属于当前图。修改仅影响当前图。
 */
export interface KnowledgeNodeData extends NodeBase {
    role: 'knowledge'
    kind: KnowledgeNodeKind // 虚/实
    form?: RealNodeForm // 实节点形态，仅 kind === 'real' 有效
    summary?: string // 节点摘要，主要用于实节点，限制不超过 80 字
    noteLink?: string // 笔记跳转链接，主要用于实节点
}

// ============================================================
// Node — 引用节点 (role === 'reference')
// ============================================================

/**
 * 引用节点——原知识节点在其他图中的透明别名。
 *
 * 规则：
 * 1. 修改引用节点同时作用于原知识节点（C++ 引用语义）。
 * 2. label / abstractionLevel / childGraphId 在创建时从源节点复制。
 * 3. sourceGraphId / sourceNodeId 是实现引用语义的底层指针，
 *    仅在 operation_executor 内实现修改穿透和用户主动"定位原节点"时使用。
 */
export interface ReferenceNodeData extends NodeBase {
    role: 'reference'
    referenceKind: ReferenceNodeKind // communication | heuristic
    sourceGraphId: GraphId // 原节点所在图 ID（非空，编译期保证）
    sourceNodeId: NodeId // 原节点 ID（非空，编译期保证）
}

// ============================================================
// Node — 联合类型
// ============================================================

/** 节点数据。用 role 区分知识本体 / 引用投影，TS 编译器自动 narrow 专属字段。 */
export type NodeData = KnowledgeNodeData | ReferenceNodeData

export type NodePosition = GraphPosition

// ============================================================
// Edge（本次未改）
// ============================================================

export type EdgeKind = 'real' | 'virtual' // 边本体类型：实边 / 虚边

export type EdgeDirection = 'directed' | 'undirected' // 边方向：有向 / 无向

export type EdgeViewRole = 'normal' | 'communication'
// 'normal'：普通边。边本体属于当前图，参与所有图规则校验。
// 'communication'：沟通边。配合沟通节点使用，出现在子图中。
//   一端可连接沟通节点（半悬空效果）。属性 sourceGraphId / sourceEdgeId 指向父图原边。

export interface EdgeData {
    id: EdgeId
    graphId: GraphId
    source: NodeId
    target: NodeId
    kind: EdgeKind
    direction: EdgeDirection
    viewRole: EdgeViewRole
    label?: string // 边标签，用户自定义，限制不超过 10 个中文字符
    sourceEdgeId?: EdgeId // 沟通边记录它引用的父图原边 ID
    sourceGraphId?: GraphId // 沟通边记录它引用的父图 ID
}
