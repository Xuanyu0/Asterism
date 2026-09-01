/**
 * GraphData 全部数据结构类型定义。
 *
 * @remarks
 * 总体结构：
 * 1. Graph：图数据、图类型、认知状态
 * 2. Node：两级判别（role → kind/referenceKind）、通用属性、专有属性
 * 3. Edge：边数据、2×2 矩阵（kind × direction）
 * 4. 派生契约：form / abstractionLevel 的派生函数签名（实现见 core/derive.ts）
 *
 * @example
 * ```ts
 * import type { GraphData, NodeData, EdgeData } from '@my-project/graph-engine'
 * ```
 */

// ——————Graph——————

/** 图空间中的二维坐标，不表示 DOM 像素坐标。 */
export interface GraphPosition {
    x: number
    y: number
}

export type GraphId = string
export type NodeId = string
export type EdgeId = string

export type GraphKind = 'root' | 'subgraph' | 'learningBlock' | 'commonLayer'

/**
 * 多图注册表：GraphId → GraphData 的映射。
 *
 * @remarks
 * 供多图管理层（applyBatches）作为参数使用。引擎是纯函数，不持有注册表状态，
 * 由调用方（前端 Runtime）持有并传入。前端 graph_registry.ts 的对接在 06.3。
 */
export type GraphRegistry = Map<GraphId, GraphData>

export interface GraphData {
    readonly id: GraphId
    kind: GraphKind
    title: string
    parentGraphId?: GraphId
    ownerNodeId?: NodeId
    nodes: NodeData[]
    edges: EdgeData[]
    /** 认知状态（数据层折叠信息），与交互层的认知模式无关 */
    cognitiveState: GraphCognitiveState
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

// ——————Node——————

/**
 * 节点在当前图中的本体身份（两级判别中的第一级）。
 *
 * @remarks
 * - `'knowledge'`：知识本体属于当前图，修改仅影响当前图。
 * - `'reference'`：源知识节点在其他图中的投影，修改穿透到源节点
 *   （C++ 引用语义：`T& r = a`，交互层不暴露解引用）。
 *   `sourceGraphId` / `sourceNodeId` 仅用于 operation_executor 内部穿透
 *   和用户主动"定位源节点"。
 */
export type NodeKind = 'knowledge' | 'reference'

// --- 知识节点子类型 (role === 'knowledge') ---

export type KnowledgeState = 'virtual' | 'real'

export type RealNodeForm = 'atomic' | 'abstract'

// --- 引用节点子类型 (role === 'reference') ---

export type ReferenceNodeKind = 'communication' | 'heuristic'

// ——————通用属性——————

export type NodePosition = GraphPosition

/**
 * 所有节点的共享属性：不依赖 role，无需 narrow 即可安全读取。
 */
export interface NodeBase {
    readonly id: NodeId
    graphId: GraphId
    role: NodeKind
    label: string
    degree: number
    radius?: number
    position?: NodePosition
    groupId?: string
    createdAt?: string
    updatedAt?: string
}

// ——————知识节点——————

export interface KnowledgeNodeData extends NodeBase {
    role: 'knowledge'
    kind: KnowledgeState
    /** 抽象节点指向的子图 id；undefined 表示原子节点。 */
    childGraphId?: GraphId
    summary?: string
    noteLink?: string
}

// ——————引用节点——————

/**
 * 原知识节点在其他图中的透明投影。
 *
 * @remarks
 * 1. 修改同时作用于源节点（C++ 引用语义）。
 * 2. `childGraphId` 不再从源节点复制
 *    其 abstractionLevel 由 deriveAbstractionLevel 解引用源节点推导。
 * 3. `sourceGraphId` / `sourceNodeId` 是实现引用语义的底层指针，
 *    仅在 operation_executor 内部穿透和用户"定位源节点"时使用。
 */
export interface ReferenceNodeData extends NodeBase {
    role: 'reference'
    referenceKind: ReferenceNodeKind
    sourceGraphId: GraphId
    sourceNodeId: NodeId
    contextSummary?: string
}

// ——————联合类型——————

export type NodeData = KnowledgeNodeData | ReferenceNodeData

// ——————Edge——————

export type EdgeKind = 'real' | 'virtual'

export type EdgeDirection = 'directed' | 'undirected'

/**
 * 边数据：kind（实 / 虚）× direction（有向 / 无向）的 2×2 矩阵。
 *
 * @remarks
 * 沟通边的视觉效果（一端半悬空、逐渐淡化）不由边类型决定，
 * 由渲染层根据端点节点是否为 `communication` 节点推导得出。
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

// ——————派生契约——————

/**
 * 推导知识节点 form（原子 / 抽象）的契约签名。
 *
 * @remarks
 * 实现见 core/derive.ts 的 deriveNodeForm。
 */
export type DeriveNodeForm = (node: KnowledgeNodeData) => RealNodeForm

/**
 * 推导节点 abstractionLevel 的契约签名。
 *
 * @remarks
 * 顶层可传知识节点或引用节点——引用节点经解引用源节点推导。
 * 实现见 core/derive.ts 的 deriveAbstractionLevel。
 */
export type DeriveAbstractionLevel = (
    lookupGraph: (graphId: GraphId) => GraphData | undefined,
    node: NodeData,
) => number
