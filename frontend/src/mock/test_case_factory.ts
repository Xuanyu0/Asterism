/**
 * test_case_factory.ts
 *
 * 功能：
 *     知识图谱测试数据工厂。提供原子构建函数与拓扑生成器，
 *     确保所有产出通过全量 schema 校验（GraphValidator.validateGraph）。
 *     相同参数稳定生成相同数据——无 Date.now() / Math.random() 依赖。
 *
 * 总体结构：
 *     1. 原子构建：createNode / createEdge / assembleGraph
 *     2. 布局辅助：layoutChain / layoutGrid
 *     3. P1 拓扑生成器：chainDAG / edgeMatrix / virtualNode / abstractNode
 *                       communication / deleteUndo / golden
 *     4. P2 拓扑生成器（占位）：subgraph / multiLevelNesting / learningBlock / commonLayer
 *     5. 内部自检：validateOrThrow
 *
 * 前端机制（Vue/Pinia 无关）：
 *     本文件是纯数据生成器，不依赖 Vue、Pinia、Cytoscape。
 *     可在 Node.js 测试框架、浏览器控制台、GraphEngine 后端直接使用。
 *
 * 外部如何使用：
 *     import { createGoldenTestGraph } from '@/mock/test_case_factory'
 *     graphStore.setCurrentGraph(createGoldenTestGraph())
 */

import type {
    EdgeData,
    EdgeDirection,
    EdgeId,
    EdgeKind,
    GraphData,
    GraphId,
    GraphKind,
    KnowledgeNodeKind,
    NodeData,
    NodeId,
    NodePosition,
    NodeRole,
    RealNodeForm,
    ReferenceNodeKind,
} from '@/definitions/types/graph_types'

import {
    GraphValidator,
} from '@/definitions/validators/graph_validator'

import {
    normalizeGraph,
} from '@/graph/utilities/graph_utils'

// 原子构建 ═══════════════════════════════════════════════════════
/**
 * 功能：
 *     创建带默认值的合法节点。只填传入字段，其余使用默认值。
 *
 * 规则：
 *     1. role 默认 'knowledge'（大多数测试节点是知识节点）。
 *     2. degree 默认 0（由 assembleGraph 根据边自动修正）。
 *     3. abstractionLevel 默认 0。
 *     4. form 默认 'atomic'（当 role === 'knowledge' 且 kind === 'real'）。
 */
export function createNode(overrides: {
    id: NodeId
    graphId: GraphId
    role?: NodeRole
    kind: KnowledgeNodeKind
    referenceKind?: ReferenceNodeKind
    label?: string
    summary?: string
    form?: RealNodeForm
    abstractionLevel?: number
    degree?: number
    position?: NodePosition
    childGraphId?: GraphId
    sourceGraphId?: GraphId
    sourceNodeId?: NodeId
    noteLink?: string
}): NodeData {
    const role = overrides.role ?? 'knowledge'

    if (role === 'knowledge') {
        return {
            role: 'knowledge',
            id: overrides.id,
            graphId: overrides.graphId,
            kind: overrides.kind,
            label: overrides.label ?? overrides.id,
            summary: overrides.summary,
            form: overrides.form ?? (overrides.kind === 'real' ? 'atomic' : undefined),
            abstractionLevel: overrides.abstractionLevel ?? 0,
            degree: overrides.degree ?? 0,
            position: overrides.position,
            childGraphId: overrides.childGraphId,
            noteLink: overrides.noteLink,
        }
    }

    return {
        role: 'reference',
        id: overrides.id,
        graphId: overrides.graphId,
        referenceKind: overrides.referenceKind!,
        label: overrides.label ?? overrides.id,
        abstractionLevel: overrides.abstractionLevel ?? 0,
        degree: overrides.degree ?? 0,
        position: overrides.position,
        childGraphId: overrides.childGraphId,
        sourceGraphId: overrides.sourceGraphId!,
        sourceNodeId: overrides.sourceNodeId!,
    }
}

/**
 * 功能：
 *     创建带默认值的合法边。只填传入字段，其余使用默认值。
 *
 * 规则：
 *     1. label 默认空字符串。
 *     2. 沟通边的视觉样式由渲染层根据端点节点类型推导，
 *        不需要边层面的 viewRole / sourceGraphId / sourceEdgeId 字段。
 */
export function createEdge(overrides: {
    id: EdgeId
    graphId: GraphId
    source: NodeId
    target: NodeId
    kind: EdgeKind
    direction: EdgeDirection
    label?: string
}): EdgeData {
    return {
        id: overrides.id,
        graphId: overrides.graphId,
        source: overrides.source,
        target: overrides.target,
        kind: overrides.kind,
        direction: overrides.direction,
        label: overrides.label ?? '',
    }
}

// 原子构建 结束 ═══════════════════════════════════════════════════

// 图组装 ═══════════════════════════════════════════════════════════
/**
 * 功能：
 *     将节点与边组装为合法 GraphData。
 *
 * 规则：
 *     1. 根据边自动计算每个节点的 degree，覆盖节点原有 degree。
 *     2. 补全 cognitiveState 默认值（通过 normalizeGraph）。
 *     3. 自动设置 createdAt / updatedAt。
 *     4. 组装后运行全量 schema 校验（GraphValidator.validateGraph），不合法时抛异常。
 */
export function assembleGraph(params: {
    id: GraphId
    kind?: GraphKind
    title?: string
    nodes: NodeData[]
    edges: EdgeData[]
    parentGraphId?: GraphId
    ownerNodeId?: NodeId
}): GraphData {
    const degreeMap = new Map<NodeId, number>()
    for (const n of params.nodes) {
        degreeMap.set(n.id, 0)
    }
    for (const e of params.edges) {
        degreeMap.set(e.source, (degreeMap.get(e.source) ?? 0) + 1)
        degreeMap.set(e.target, (degreeMap.get(e.target) ?? 0) + 1)
    }

    const nodesWithDegree: NodeData[] = params.nodes.map(n => ({
        ...n,
        degree: degreeMap.get(n.id) ?? 0,
    }))

    const now = new Date().toISOString()

    const graph: GraphData = {
        id: params.id,
        kind: params.kind ?? 'main',
        title: params.title ?? params.id,
        nodes: nodesWithDegree,
        edges: params.edges,
        parentGraphId: params.parentGraphId,
        ownerNodeId: params.ownerNodeId,
        createdAt: now,
        updatedAt: [now],
    }

    const normalized = normalizeGraph(graph)

    validateOrThrow(normalized)

    return normalized
}

// 图组装 结束 ═══════════════════════════════════════════════════════

// 布局辅助 ═════════════════════════════════════════════════════════
/**
 * 功能：
 *     将节点水平排列（从左到右）。
 */
export function layoutChain(nodes: NodeData[], spacing = 300, startX = 50, y = 120): NodeData[] {
    return nodes.map((node, i) => ({
        ...node,
        position: { x: startX + i * spacing, y },
    }))
}

/**
 * 功能：
 *     将节点按网格排列。
 */
export function layoutGrid(nodes: NodeData[], cols = 3, spacingX = 300, spacingY = 400, startX = 50, startY = 120): NodeData[] {
    return nodes.map((node, i) => ({
        ...node,
        position: {
            x: startX + (i % cols) * spacingX,
            y: startY + Math.floor(i / cols) * spacingY,
        },
    }))
}

// 布局辅助 结束 ═════════════════════════════════════════════════════

// P1 拓扑生成器 ═════════════════════════════════════════════════════
const G = 'graph-test' as GraphId

/**
 * 功能：
 *     创建 n 节点有向实边链式 DAG。
 *
 * 拓扑：
 *     node-0 → node-1 → ... → node-(n-1)
 *
 * 用途：
 *     测试依赖折叠/展开（fold/expand）。
 *     对 node-(n-1) 折叠应将 node-0..node-(n-2) 全部隐藏。
 */
export function createChainDAG(n = 3, graphId: GraphId = G): GraphData {
    const nodes: NodeData[] = []
    const edges: EdgeData[] = []

    for (let i = 0; i < n; i++) {
        const id = `chain-${i}` as NodeId
        nodes.push(createNode({
            id,
            graphId,
            kind: 'real',
            label: `节点${i}`,
        }))
    }

    for (let i = 0; i < n - 1; i++) {
        edges.push(createEdge({
            id: `chain-${i}-${i + 1}` as EdgeId,
            graphId,
            source: nodes[i]!.id,
            target: nodes[i + 1]!.id,
            kind: 'real',
            direction: 'directed',
            label: `${i}→${i + 1}`,
        }))
    }

    return assembleGraph({
        id: graphId,
        title: `链式 DAG (${n} 节点)`,
        nodes: layoutChain(nodes),
        edges,
    })
}

/**
 * 功能：
 *     创建 2×2 边矩阵测试图。
 *
 * 拓扑：
 *     4 个实节点，4 条边覆盖全部边类型：
 *       n0 → n1 : 有向实边 (real + directed)
 *       n1 — n2 : 无向实边 (real + undirected)
 *       n2 -·→ n3 : 有向虚边 (virtual + directed)
 *       n0 -·- n3 : 无向虚边 (virtual + undirected)
 *
 * 用途：
 *     测试 operation_validator 对 4 种边类型的校验规则。
 */
export function createEdgeMatrixGraph(graphId: GraphId = G): GraphData {
    const [n0, n1, n2, n3] = [
        createNode({ id: 'mx-0' as NodeId, graphId, kind: 'real', label: '节点0' }),
        createNode({ id: 'mx-1' as NodeId, graphId, kind: 'real', label: '节点1' }),
        createNode({ id: 'mx-2' as NodeId, graphId, kind: 'real', label: '节点2' }),
        createNode({ id: 'mx-3' as NodeId, graphId, kind: 'real', label: '节点3' }),
    ]

    const edges: EdgeData[] = [
        createEdge({ id: 'mx-real-dir' as EdgeId, graphId, source: n0.id, target: n1.id, kind: 'real', direction: 'directed', label: '有向实边' }),
        createEdge({ id: 'mx-real-undir' as EdgeId, graphId, source: n1.id, target: n2.id, kind: 'real', direction: 'undirected', label: '无向实边' }),
        createEdge({ id: 'mx-virt-dir' as EdgeId, graphId, source: n2.id, target: n3.id, kind: 'virtual', direction: 'directed', label: '有向虚边' }),
        createEdge({ id: 'mx-virt-undir' as EdgeId, graphId, source: n0.id, target: n3.id, kind: 'virtual', direction: 'undirected', label: '无向虚边' }),
    ]

    return assembleGraph({
        id: graphId,
        title: '2×2 边矩阵',
        nodes: layoutGrid([n0, n1, n2, n3], 2),
        edges,
    })
}

/**
 * 功能：
 *     创建虚节点连接规则测试图。
 *
 * 拓扑：
 *     1 个虚节点 + 1 个虚节点 + 2 个实节点
 *       virtual-0 -·- real-0  : 合法（虚节点 + 无向虚边 + 实节点）
 *       virtual-0 -·- real-1  : 合法（虚节点可与多个实节点连接）
 *       virtual-1 -·- real-0  : 合法
 *
 * 用途：
 *     测试虚节点只能通过无向虚边连接、虚节点之间最多一条无向虚边的规则。
 */
export function createVirtualNodeTestGraph(graphId: GraphId = G): GraphData {
    const v0 = createNode({ id: 'vrt-0' as NodeId, graphId, kind: 'virtual', label: '虚节点0' })
    const v1 = createNode({ id: 'vrt-1' as NodeId, graphId, kind: 'virtual', label: '虚节点1' })
    const r0 = createNode({ id: 'vrt-r0' as NodeId, graphId, kind: 'real', label: '实节点A' })
    const r1 = createNode({ id: 'vrt-r1' as NodeId, graphId, kind: 'real', label: '实节点B' })

    const nodes = [v0, v1, r0, r1]

    const edges: EdgeData[] = [
        createEdge({ id: 'vrt-0-a' as EdgeId, graphId, source: v0.id, target: r0.id, kind: 'virtual', direction: 'undirected', label: '虚边' }),
        createEdge({ id: 'vrt-0-b' as EdgeId, graphId, source: v0.id, target: r1.id, kind: 'virtual', direction: 'undirected', label: '虚边' }),
        createEdge({ id: 'vrt-1-a' as EdgeId, graphId, source: v1.id, target: r0.id, kind: 'virtual', direction: 'undirected', label: '虚边' }),
    ]

    return assembleGraph({
        id: graphId,
        title: '虚节点连接规则测试',
        nodes: layoutGrid(nodes, 2),
        edges,
    })
}

/**
 * 功能：
 *     创建抽象节点测试图。
 *
 * 拓扑：
 *     abstract (form='abstract', childGraphId) → normal 实节点
 *
 * 用途：
 *     测试抽象节点渲染、childGraphId 引用。
 */
export function createAbstractNodeTestGraph(graphId: GraphId = G): GraphData {
    const abs0 = createNode({ id: 'abs-0' as NodeId, graphId, kind: 'real', form: 'abstract', label: '抽象节点', abstractionLevel: 1, childGraphId: 'sub-abs-0' as GraphId })
    const abs1 = createNode({ id: 'abs-1' as NodeId, graphId, kind: 'real', label: '普通实节点' })

    const nodes = [abs0, abs1]

    const edges: EdgeData[] = [
        createEdge({ id: 'abs-edge' as EdgeId, graphId, source: abs0.id, target: abs1.id, kind: 'real', direction: 'directed', label: '包含' }),
    ]

    return assembleGraph({
        id: graphId,
        title: '抽象节点测试',
        nodes: layoutChain(nodes, 300, 50, 120),
        edges,
    })
}

/**
 * 功能：
 *     创建沟通节点/边测试图。
 *
 * 拓扑：
 *     模拟父图中的一个节点被投影到"子图"中的沟通节点：
 *       comm-0 (communication 节点, sourceGraphId, sourceNodeId) → real-node
 *
 * 用途：
 *     测试沟通节点的渲染（半透明）、沟通边由端点节点类型推导视觉样式
 */
export function createCommunicationTestGraph(graphId: GraphId = G): GraphData {
    const parentGraphId = 'graph-parent' as GraphId

    const nodes: NodeData[] = [
        createNode({ id: 'comm-real' as NodeId, graphId, kind: 'real', label: '实节点' }),
        createNode({
            id: 'comm-node' as NodeId,
            graphId,
            role: 'reference',
            kind: 'real',
            referenceKind: 'communication',
            label: '沟通节点',
            sourceGraphId: parentGraphId,
            sourceNodeId: 'src-node' as NodeId,
        }),
    ]

    const edges: EdgeData[] = [
        // 边连接 communication 节点 → 实节点。
        // 沟通边的视觉样式（半悬空/淡化）由渲染层根据
        // 端点节点是否为 communication 节点推导得出。
        createEdge({
            id: 'comm-edge' as EdgeId,
            graphId,
            source: 'comm-node' as NodeId,
            target: 'comm-real' as NodeId,
            kind: 'real',
            direction: 'directed',
            label: '沟通边',
        }),
    ]

    return assembleGraph({
        id: graphId,
        title: '沟通节点/边测试',
        nodes: layoutChain(nodes),
        edges,
    })
}

/**
 * 功能：
 *     创建删除/撤销测试图。
 *
 * 拓扑：
 *     3 个实节点 + 2 条有向边形成简单 DAG。
 *
 * 用途：
 *     测试 delete_node / delete_edge + Ctrl+Z 撤销流程。
 */
export function createDeleteUndoTestGraph(graphId: GraphId = G): GraphData {
    const d0 = createNode({ id: 'del-0' as NodeId, graphId, kind: 'real', label: '可删节点0' })
    const d1 = createNode({ id: 'del-1' as NodeId, graphId, kind: 'real', label: '可删节点1' })
    const d2 = createNode({ id: 'del-2' as NodeId, graphId, kind: 'real', label: '可删节点2' })

    const nodes = [d0, d1, d2]

    const edges: EdgeData[] = [
        createEdge({ id: 'del-0-1' as EdgeId, graphId, source: d0.id, target: d1.id, kind: 'real', direction: 'directed', label: '边0→1' }),
        createEdge({ id: 'del-1-2' as EdgeId, graphId, source: d1.id, target: d2.id, kind: 'real', direction: 'directed', label: '边1→2' }),
    ]

    return assembleGraph({
        id: graphId,
        title: '删除/撤销测试',
        nodes: layoutChain(nodes),
        edges,
    })
}

/**
 * 功能：
 *     创建综合金牌测试图。
 *
 * 拓扑（6 节点 / 4 边）：
 *     节点：
 *       node-1：普通实节点（degree 1，被有向实边指向 node-2）
 *       node-2：普通实节点（degree 3，DAG 中枢）
 *       node-3：抽象实节点（abstractionLevel=1, childGraphId）
 *       node-4：虚节点（连接无向虚边到 node-6）
 *       node-5：沟通节点（communication）
 *       node-6：普通实节点
 *
 *     边：
 *       edge-1-2：有向实边 (1→2)
 *       edge-2-3：有向实边 (2→3)
 *       edge-4-6：无向虚边 (4-·-6)
 *       edge-5-2：边连接 communication 节点 (5→2)
 *
 * 用途：
 *     冒烟测试，覆盖所有已实现的节点/边类型和交互操作。
 */
export function createGoldenTestGraph(graphId: GraphId = 'graph-golden' as GraphId): GraphData {
    const nodes: NodeData[] = [
        createNode({
            id: 'node-1' as NodeId, graphId, kind: 'real',
            label: '节点1', summary: '普通实节点',
            position: { x: 50, y: 120 },
        }),
        createNode({
            id: 'node-2' as NodeId, graphId, kind: 'real',
            label: '节点2', summary: '普通实节点',
            position: { x: 350, y: 120 },
        }),
        createNode({
            id: 'node-3' as NodeId, graphId, kind: 'real', form: 'abstract',
            label: '抽象节点3', summary: '抽象节点示例',
            abstractionLevel: 1, childGraphId: 'graph-sub-3' as GraphId,
            position: { x: 650, y: 120 },
        }),
        createNode({
            id: 'node-4' as NodeId, graphId, kind: 'virtual',
            label: '虚节点4',
            position: { x: 950, y: 120 },
        }),
        createNode({
            id: 'node-5' as NodeId, graphId, role: 'reference',
            kind: 'real', referenceKind: 'communication',
            label: '沟通节点5',
            sourceGraphId: 'graph-golden' as GraphId, sourceNodeId: 'node-1' as NodeId,
            position: { x: 50, y: 520 },
        }),
        createNode({
            id: 'node-6' as NodeId, graphId, kind: 'real',
            label: '节点6', summary: '普通实节点',
            position: { x: 150, y: 520 },
        }),
    ]

    const edges: EdgeData[] = [
        createEdge({ id: 'edge-1-2' as EdgeId, graphId, source: 'node-1' as NodeId, target: 'node-2' as NodeId, kind: 'real', direction: 'directed', label: '有向边1→2' }),
        createEdge({ id: 'edge-2-3' as EdgeId, graphId, source: 'node-2' as NodeId, target: 'node-3' as NodeId, kind: 'real', direction: 'directed', label: '有向边2→3' }),
        createEdge({ id: 'edge-4-6' as EdgeId, graphId, source: 'node-4' as NodeId, target: 'node-6' as NodeId, kind: 'virtual', direction: 'undirected', label: '虚边4-6' }),
        createEdge({ id: 'edge-5-2' as EdgeId, graphId, source: 'node-5' as NodeId, target: 'node-2' as NodeId, kind: 'real', direction: 'directed', label: '沟通边5→2' }),
    ]

    return assembleGraph({
        id: graphId,
        title: '金牌测试图',
        nodes,
        edges,
    })
}

// P1 拓扑生成器 结束 ═════════════════════════════════════════════════

// P2 拓扑生成器（占位） ═══════════════════════════════════════════════
/**
 * 功能（Phase 2）：
 *     为抽象节点创建子图，自动生成沟通节点及连接边。
 *
 * 规则：
 *     1. 子图必须关联父图的抽象节点（ownerNodeId）。
 *     2. 自动为子图中引用的父图节点创建沟通节点（communication）。
 *     3. 自动为沟通节点创建连接边，连接子图内部节点。
 *        边的视觉样式（半悬空/淡化）由渲染层根据端点节点类型推导。
 *     4. 父图的 parentGraphId 与 ownerNodeId 关联关系由调用方保证。
 */
export function createSubgraphFromAbstract(
    _parentGraph: GraphData,
    _abstractNodeId: NodeId,
    _subNodes: NodeData[],
    _subEdges: EdgeData[],
): { parent: GraphData; child: GraphData } {
    // TODO: Phase 2 — GraphEngine 子图创建
    throw new Error('createSubgraphFromAbstract 在 Phase 2 实现')
}

/**
 * 功能（Phase 2）：
 *     递归创建 depth 层嵌套子图。
 *
 * 规则：
 *     1. 每层一个抽象节点 → 子图。
 *     2. 自动维护父子引用关系。
 *     3. 返回根图到最深层子图的完整数组。
 */
export function createMultiLevelNesting(
    _depth: number,
): GraphData[] {
    // TODO: Phase 2 — GraphEngine 多级嵌套
    throw new Error('createMultiLevelNesting 在 Phase 2 实现')
}

/**
 * 功能（Phase 2）：
 *     创建知识块——单轮 AI 学习的临时产物。
 *
 * 规则：
 *     1. 仅包含节点，无边。
 *     2. kind 为 'learningBlock'。
 *     3. 用户确认后通过 merge 并入主图（而非覆盖）。
 */
export function createLearningBlock(
    _nodeCount: number,
): GraphData {
    // TODO: Phase 2 — AI Runtime 单轮学习
    throw new Error('createLearningBlock 在 Phase 2 实现')
}

/**
 * 功能（Phase 2）：
 *     创建常识层——已内化的知识集合。
 *
 * 规则：
 *     1. 仅包含节点，无边。
 *     2. kind 为 'commonLayer'。
 *     3. 通过"内化"（internalize）操作从其他图转移节点而来。
 */
export function createCommonLayer(
    _nodeIds: NodeId[],
): GraphData {
    // TODO: Phase 2 — GraphEngine 常识化
    throw new Error('createCommonLayer 在 Phase 2 实现')
}

// P2 拓扑生成器 结束 ═══════════════════════════════════════════════════

// 内部自检 ═══════════════════════════════════════════════════════════
/**
 * 功能：
 *     运行全量 schema 校验。不合法时抛出详细错误信息。
 *
 * 规则：
 *     1. 调用 GraphValidator.validateGraph。
 *     2. valid === false 时抛出异常，包含所有 issues 的详细信息。
 *     3. 仅在开发期使用——生产环境不应调用工厂。
 */
function validateOrThrow(graph: GraphData): void {
    const result = GraphValidator.validateGraph(graph)

    if (!result.valid) {
        const details = result.issues
            .map(i => `  [${i.level}] ${i.code}: ${i.message} (target: ${i.targetType} ${i.targetId ?? ''})`)
            .join('\n')

        throw new Error(
            `test_case_factory: 生成的 GraphData 未通过 schema 校验。\n${details}`,
        )
    }
}

// 内部自检 结束 ═══════════════════════════════════════════════════════
