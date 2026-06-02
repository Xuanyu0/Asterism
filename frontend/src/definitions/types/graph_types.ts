/**
 * graph_types.ts
 *
 * 功能：
 * 定义知识图谱 GraphData、NodeData、EdgeData 以及 Cytoscape 渲染转换类型。
 *
 * 总体结构：
 * 1. Graph：图数据、图类型、认知状态
 * 2. Node：节点数据、节点位置、节点显示身份
 * 3. Edge：边数据、边方向、边显示身份
 *
 * 外部如何使用：
 * import type { GraphData, NodeData, EdgeData } from '@/definations/types/graph_types'
 */

// --- Graph ---

/**
 * 功能：
 *     图空间中的二维坐标。
 *
 * 规则：
 *     1. 表示 Cytoscape model position。
 *     2. 不表示 DOM 像素坐标。
 *     3. 可用于节点位置、画布点击位置、拖拽结束位置。
 */
export interface GraphPosition {
    x: number
    y: number
}

export type GraphId = string // 图 ID：主图、子图、知识块都用它区分作用域
export type NodeId = string // 节点 ID：节点在整个系统中的唯一标识
export type EdgeId = string // 边 ID：边在整个系统中的唯一标识

export type GraphKind = 'main' | 'subgraph' | 'learningBlock' | 'commonLayer' // 图类型：主图 / 子图 / 学习知识块 / 常识层

export interface GraphData {
    id: GraphId // 图唯一 ID，Supabase、AI、前端切换图都靠它定位
    kind: GraphKind // 图类型，用来区分主图、子图、单轮学习知识块、常识层
    title: string // 图标题，用于页面显示和 AI 理解上下文
    parentGraphId?: GraphId // 父图 ID，只有子图通常需要
    ownerNodeId?: NodeId // 拥有该子图的抽象节点 ID，只有 subgraph 通常需要
    nodes: NodeData[] // 当前图中的节点数据
    edges: EdgeData[] // 当前图中的边数据
    cognitiveState?: GraphCognitiveState // 当前图的认知显示状态，会随 GraphData 一起持久化
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

// --- Node ---

export type NodeKind = 'virtual' | 'real' // 节点本体类型：虚节点 / 实节点

export type RealNodeForm = 'normal' | 'abstract' // 实节点形态：普通实节点 / 抽象实节点

export type NodeViewRole = 'normal' | 'communication' // 节点在当前图中的显示身份：普通显示 / 沟通显示


export type NodePosition = GraphPosition


export interface NodeData {
    id: NodeId // 节点唯一 ID，Cytoscape、Supabase、AI 都靠它定位节点
    graphId: GraphId // 当前节点所在图 ID，表示它属于主图、子图还是知识块
    kind: NodeKind // 节点本体类型，virtual 表示虚节点，real 表示实节点
    form?: RealNodeForm // 实节点形态，只有 kind 为 real 时才使用
    viewRole: NodeViewRole // 当前图中的显示身份，communication 只表示它在当前子图中作为沟通节点显示
    label: string // 节点标签，直接显示在图上，限制不超过 20 个中文字符
    summary?: string // 节点摘要，主要用于实节点，限制不超过 80 字
    noteLink?: string // 笔记跳转链接，主要用于实节点
    abstractionLevel: number // 认知抽象等级，由系统计算，用户不能直接修改
    degree: number // 度数，表示连接边数量，可用于控制节点大小
    position?: NodePosition // 节点在图空间中的持久化位置，拖动结束后写回 GraphData
    childGraphId?: GraphId // 抽象节点对应的子图 ID，只有抽象实节点需要
    sourceGraphId?: GraphId // 沟通节点引用的来源图 ID，通常是父图
    sourceNodeId?: NodeId // 沟通节点引用的原节点 ID
}

// --- Edge ---

export type EdgeKind = 'real' | 'virtual' // 边本体类型：实边 / 虚边

export type EdgeDirection = 'directed' | 'undirected' // 边方向：有向 / 无向

export type EdgeViewRole = 'normal' | 'communication' // 边在当前图中的显示身份：普通边 / 沟通边

export interface EdgeData {
    id: EdgeId // 边唯一 ID，Cytoscape、Supabase、AI 都靠它定位边
    graphId: GraphId // 当前边所在图 ID，表示它属于主图、子图还是知识块
    source: NodeId // 起点节点 ID，Cytoscape 必需字段
    target: NodeId // 终点节点 ID，Cytoscape 必需字段
    kind: EdgeKind // 边本体类型，real 表示实边，virtual 表示虚边
    direction: EdgeDirection // 边方向，directed 表示有向边，undirected 表示无向边
    viewRole: EdgeViewRole // 当前图中的显示身份，communication 只表示它在子图中作为沟通边显示
    label?: string // 边标签，用户自定义，可为空，限制不超过 10 个中文字符
    sourceEdgeId?: EdgeId // 如果是沟通边，记录它引用的父图原边 ID
    sourceGraphId?: GraphId // 如果是沟通边，记录它引用的父图 ID
}

