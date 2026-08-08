/**
 * graph_data.ts
 *
 * 功能：
 *     定义 GraphData 全部数据结构类型。
 *
 * 总体结构：
 *     1. Graph：图数据、图类型、认知状态
 *     2. Node：两级判别（role → kind/form/referenceKind）、通用属性、专有属性
 *     3. Edge：边数据、2×2 矩阵（kind × direction）
 *
 * 外部如何使用：
 *     import type { GraphData, NodeData, EdgeData } from '@my-project/graph-engine'
 */

// Graph═══════════════════════════════════════════════════════

/** 图空间中的二维坐标，不表示 DOM 像素坐标。 */
export interface GraphPosition {
    x: number
    y: number
}

export type GraphId = string
export type NodeId = string
export type EdgeId = string

export type GraphKind = 'root' | 'subgraph' | 'learningBlock' | 'commonLayer'

export interface GraphData {
    readonly id: GraphId
    kind: GraphKind
    title: string
    parentGraphId?: GraphId
    ownerNodeId?: NodeId
    nodes: NodeData[]
    edges: EdgeData[]
    /** 认知状态，和交互模式的认知模式无关 */
    cognitiveState?: GraphCognitiveState
    readonly createdAt?: string
    updatedAt?: string
}

export interface GraphCognitiveState {
    foldedDependencies: FoldedDependencyState[]
}

export interface FoldedDependencyState {
    targetNodeId: NodeId
    foldedNodeIds: NodeId[]
}

// Node════════════════════════════════════════════════════════

// 两级判别───────────────────────────────────────────────

/**
 * 功能：
 *     第一级判别：节点在当前图中的本体身份。
 *
 * 规则：
 *     - 'knowledge'：知识本体属于当前图，修改仅影响当前图。
 *     - 'reference'：源知识节点在其他图中的投影。修改穿透到源节点
 *       （C++ 引用语义：T& r = a，用户交互层不暴露"解引用"）。
 *       sourceGraphId / sourceNodeId 仅用于 operation_executor 内部穿透
 *       和用户主动"定位源节点"。
 */
export type NodeRole = 'knowledge' | 'reference'

// --- 知识节点子类型 (role === 'knowledge') ---

export type KnowledgeNodeKind = 'virtual' | 'real'

export type RealNodeForm = 'atomic' | 'abstract'

// --- 引用节点子类型 (role === 'reference') ---

export type ReferenceNodeKind = 'communication' | 'heuristic'

// 通用属性───────────────────────────────────────────────

export type NodePosition = GraphPosition

/**
 * 功能：
 *     所有节点的共享属性。不依赖 role，无需 narrow 即可安全读取。
 *
 * 规则：
 *     abstractionLevel / childGraphId 放在通用区的原因：
 *     引用节点创建时从源节点复制这两个值（denormalization），
 *     保证交互层透明——用户在任何地方看到引用节点，
 *     都直接支持"展开子图"等操作，不需要先跳转到源节点所在图。
 */
export interface NodeBase {
    readonly id: NodeId
    graphId: GraphId
    role: NodeRole
    label: string
    degree: number
    radius?: number
    position?: NodePosition
    abstractionLevel: number
    childGraphId?: GraphId
    groupId?: string
    createdAt?: string
    updatedAt?: string
}

// 知识节点───────────────────────────────────────────────

export interface KnowledgeNodeData extends NodeBase {
    role: 'knowledge'
    kind: KnowledgeNodeKind
    form?: RealNodeForm
    summary?: string
    noteLink?: string
}

// 引用节点───────────────────────────────────────────────

/**
 * 功能：
 *     原知识节点在其他图中的透明投影。
 *
 * 规则：
 *     1. 修改同时作用于源节点（C++ 引用语义）。
 *     2. label / abstractionLevel / childGraphId 在创建时从源节点复制。
 *     3. sourceGraphId / sourceNodeId 是实现引用语义的底层指针，
 *        仅在 operation_executor 内部穿透和用户"定位源节点"时使用。
 */
export interface ReferenceNodeData extends NodeBase {
    role: 'reference'
    referenceKind: ReferenceNodeKind
    sourceGraphId: GraphId
    sourceNodeId: NodeId
    contextSummary?: string
}

// 联合类型───────────────────────────────────────────────

export type NodeData = KnowledgeNodeData | ReferenceNodeData

// Edge════════════════════════════════════════════════════════

export type EdgeKind = 'real' | 'virtual'

export type EdgeDirection = 'directed' | 'undirected'

/**
 * 功能：
 *     2×2 边矩阵：kind（实/虚）× direction（有向/无向）。
 *
 * 规则：
 *     沟通边的视觉效果（一端半悬空、逐渐淡化）不由边类型决定，
 *     而是渲染层根据端点节点是否为 communication 节点推导得出。
 *     沟通边不是独立的边概念——它属于 2×2 矩阵的某一格，
 *     仅因连接了 communication 节点而获得额外的视觉行为。
 */
export interface EdgeData {
    readonly id: EdgeId
    graphId: GraphId
    source: NodeId
    target: NodeId
    kind: EdgeKind
    direction: EdgeDirection
    label?: string
    createdAt?: string
    updatedAt?: string
}
