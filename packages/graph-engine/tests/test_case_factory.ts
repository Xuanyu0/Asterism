/**
 * test_case_factory.ts
 *
 * 功能：
 *
 *     知识图谱测试数据工厂。提供原子构建函数与拓扑生成器，
 *     确保所有产出通过全量 schema 校验（validateGraph）。
 *     相同参数稳定生成相同数据——无 Date.now() / Math.random() 依赖。
 *
 * 总体结构：
 *
 *     1. 原子构建：createNode / createEdge / assembleGraph
 *     2. 布局辅助：layoutChain / layoutGrid
 *     3. 基础拓扑生成器：chainDAG / edgeMatrix / virtualNode / abstractNode
 *                          communication / heuristic / deleteUndo / golden
 *     4. compose 输入图（Step 8 测试基床）：
 *        deconstructInput / induceInput / internalizeInput / divergeInput /
 *        commonLayer
 *     5. 内部自检：validateOrThrow
 *
 * 外部如何使用：
 *
 *     import { createNode, createEdge, assembleGraph } from './test_case_factory'
 */

import type {
    EdgeData,
    EdgeDirection,
    EdgeId,
    EdgeKind,
    GraphData,
    GraphId,
    GraphKind,
    NodeData,
    NodeId,
    NodePosition,
    NodeRole,
    RealNodeForm,
    ReferenceNodeKind,
} from '../src/types/graph_data'

import { normalizeGraph } from '../src/core/normalize'
import { validateGraph } from '../src/core/validators/whole_graph_validator'

// ═══════════ 类型工具 ═══════════

type NodeOverrides = {
    id: NodeId
    graphId: GraphId
    role?: NodeRole
    kind?: 'real' | 'virtual'
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
}

type EdgeOverrides = {
    id: EdgeId
    graphId: GraphId
    source: NodeId
    target: NodeId
    kind: EdgeKind
    direction: EdgeDirection
    label?: string
}

// ═══════════ 原子构建 ═══════════

/**
 * 功能：
 *
 *     创建带默认值的合法节点。
 *
 * 规则：
 *
 *     1. role 默认 'knowledge'。kind 默认 'real'（仅 knowledge 节点有意义）。
 *     2. degree 默认 0（由 assembleGraph 根据边自动修正）。
 *     3. form 默认 'atomic'（kind=real 且 role=knowledge 时）。
 */
export function createNode(overrides: NodeOverrides): NodeData {
    const role = overrides.role ?? 'knowledge'

    if (role === 'knowledge') {
        const kind = overrides.kind ?? 'real'

        return {
            role: 'knowledge',
            id: overrides.id,
            graphId: overrides.graphId,
            kind,
            label: overrides.label ?? overrides.id,
            summary: overrides.summary,
            form: overrides.form ?? (kind === 'real' ? 'atomic' : undefined),
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
 *
 *     创建带默认值的合法边。
 */
export function createEdge(overrides: EdgeOverrides): EdgeData {
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

// ═══════════ 图组装 ═══════════

/**
 * 功能：
 *
 *     将节点与边组装为合法 GraphData。
 *
 * 规则：
 *
 *     1. 根据边自动计算每个节点的 degree。
 *     2. 补全 cognitiveState 默认值（通过 normalizeGraph）。
 *     3. 组装后运行全量 schema 校验，不合法时抛异常。
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
    for (const node of params.nodes) {
        degreeMap.set(node.id, 0)
    }
    for (const edge of params.edges) {
        degreeMap.set(edge.source, (degreeMap.get(edge.source) ?? 0) + 1)
        degreeMap.set(edge.target, (degreeMap.get(edge.target) ?? 0) + 1)
    }

    const nodesWithDegree: NodeData[] = params.nodes.map(node => ({
        ...node,
        degree: degreeMap.get(node.id) ?? 0,
    }))

    const now = new Date().toISOString()

    const graph: GraphData = {
        id: params.id,
        kind: params.kind ?? 'root',
        title: params.title ?? params.id,
        nodes: nodesWithDegree,
        edges: params.edges,
        parentGraphId: params.parentGraphId,
        ownerNodeId: params.ownerNodeId,
        createdAt: now,
        updatedAt: now,
    }

    const normalized = normalizeGraph(graph)

    validateOrThrow(normalized)

    return normalized
}

// ═══════════ 布局辅助 ═══════════

export function layoutChain(nodes: NodeData[], spacing = 300, startX = 50, y = 120): NodeData[] {
    return nodes.map((node, i) => ({
        ...node,
        position: { x: startX + i * spacing, y },
    }))
}

export function layoutGrid(nodes: NodeData[], cols = 3, spacingX = 300, spacingY = 400, startX = 50, startY = 120): NodeData[] {
    return nodes.map((node, i) => ({
        ...node,
        position: {
            x: startX + (i % cols) * spacingX,
            y: startY + Math.floor(i / cols) * spacingY,
        },
    }))
}

// ═══════════════════════════════════════════════════════════════════
// 基础拓扑生成器（P1 遗留）
// ═══════════════════════════════════════════════════════════════════

const G = 'graph-test' as GraphId

export function createChainDAG(n = 3, graphId: GraphId = G): GraphData {
    const nodes: NodeData[] = []
    const edges: EdgeData[] = []

    for (let i = 0; i < n; i++) {
        const id = `chain-${i}` as NodeId
        nodes.push(createNode({ id, graphId }))
    }

    for (let i = 0; i < n - 1; i++) {
        edges.push(createEdge({
            id: `chain-${i}-${i + 1}` as EdgeId, graphId,
            source: nodes[i]!.id, target: nodes[i + 1]!.id,
            kind: 'real', direction: 'directed',
        }))
    }

    return assembleGraph({ id: graphId, title: `链式 DAG (${n} 节点)`, nodes: layoutChain(nodes), edges })
}

export function createEdgeMatrixGraph(graphId: GraphId = G): GraphData {
    const [n0, n1, n2, n3] = [
        createNode({ id: 'mx-0' as NodeId, graphId }),
        createNode({ id: 'mx-1' as NodeId, graphId }),
        createNode({ id: 'mx-2' as NodeId, graphId }),
        createNode({ id: 'mx-3' as NodeId, graphId }),
    ]

    const edges: EdgeData[] = [
        createEdge({ id: 'mx-real-dir' as EdgeId, graphId, source: n0.id, target: n1.id, kind: 'real', direction: 'directed' }),
        createEdge({ id: 'mx-real-undir' as EdgeId, graphId, source: n1.id, target: n2.id, kind: 'real', direction: 'undirected' }),
        createEdge({ id: 'mx-virt-dir' as EdgeId, graphId, source: n2.id, target: n3.id, kind: 'virtual', direction: 'directed' }),
        createEdge({ id: 'mx-virt-undir' as EdgeId, graphId, source: n0.id, target: n3.id, kind: 'virtual', direction: 'undirected' }),
    ]

    return assembleGraph({ id: graphId, title: '2×2 边矩阵', nodes: layoutGrid([n0, n1, n2, n3], 2), edges })
}

export function createVirtualNodeTestGraph(graphId: GraphId = G): GraphData {
    const v0 = createNode({ id: 'vrt-0' as NodeId, graphId, kind: 'virtual' })
    const v1 = createNode({ id: 'vrt-1' as NodeId, graphId, kind: 'virtual' })
    const r0 = createNode({ id: 'vrt-r0' as NodeId, graphId })
    const r1 = createNode({ id: 'vrt-r1' as NodeId, graphId })

    const edges: EdgeData[] = [
        createEdge({ id: 'vrt-0-a' as EdgeId, graphId, source: v0.id, target: r0.id, kind: 'virtual', direction: 'undirected' }),
        createEdge({ id: 'vrt-0-b' as EdgeId, graphId, source: v0.id, target: r1.id, kind: 'virtual', direction: 'undirected' }),
        createEdge({ id: 'vrt-1-a' as EdgeId, graphId, source: v1.id, target: r0.id, kind: 'virtual', direction: 'undirected' }),
    ]

    return assembleGraph({ id: graphId, title: '虚节点连接规则测试', nodes: layoutGrid([v0, v1, r0, r1], 2), edges })
}

export function createAbstractNodeTestGraph(graphId: GraphId = G): GraphData {
    const abs = createNode({ id: 'abs-0' as NodeId, graphId, form: 'abstract', childGraphId: 'sub-abs-0' as GraphId })
    const real = createNode({ id: 'abs-1' as NodeId, graphId })

    const edges: EdgeData[] = [
        createEdge({ id: 'abs-edge' as EdgeId, graphId, source: abs.id, target: real.id, kind: 'real', direction: 'directed' }),
    ]

    return assembleGraph({ id: graphId, title: '抽象节点测试', nodes: layoutChain([abs, real], 300), edges })
}

export function createCommunicationTestGraph(graphId: GraphId = G): GraphData {
    const parentGraphId = 'graph-parent' as GraphId

    const nodes: NodeData[] = [
        createNode({ id: 'comm-real' as NodeId, graphId }),
        createNode({
            id: 'comm-node' as NodeId, graphId,
            role: 'reference', referenceKind: 'communication',
            sourceGraphId: parentGraphId, sourceNodeId: 'src-node' as NodeId,
        }),
    ]

    const edges: EdgeData[] = [
        createEdge({ id: 'comm-edge' as EdgeId, graphId, source: 'comm-node' as NodeId, target: 'comm-real' as NodeId, kind: 'real', direction: 'directed' }),
    ]

    return assembleGraph({ id: graphId, title: '沟通节点/边测试', nodes: layoutChain(nodes), edges })
}

/**
 * 功能：
 *
 *     创建启发节点测试图。一个知识节点 + 一个指向外部知识节点的启发引用节点。
 *
 * 用途：
 *
 *     测试启发节点边约束（只能通过有向虚边连接）。
 */
export function createHeuristicTestGraph(graphId: GraphId = G): GraphData {
    const peerGraphId = 'graph-peer' as GraphId

    const real = createNode({ id: 'heur-real' as NodeId, graphId })
    const heuristic = createNode({
        id: 'heur-node' as NodeId, graphId,
        role: 'reference', referenceKind: 'heuristic',
        sourceGraphId: peerGraphId, sourceNodeId: 'peer-node' as NodeId,
    })

    const edges: EdgeData[] = [
        createEdge({ id: 'heur-edge' as EdgeId, graphId, source: 'heur-real' as NodeId, target: 'heur-node' as NodeId, kind: 'virtual', direction: 'directed' }),
    ]

    return assembleGraph({ id: graphId, title: '启发节点测试', nodes: layoutChain([real, heuristic]), edges })
}

export function createDeleteUndoTestGraph(graphId: GraphId = G): GraphData {
    const d0 = createNode({ id: 'del-0' as NodeId, graphId })
    const d1 = createNode({ id: 'del-1' as NodeId, graphId })
    const d2 = createNode({ id: 'del-2' as NodeId, graphId })

    const edges: EdgeData[] = [
        createEdge({ id: 'del-0-1' as EdgeId, graphId, source: d0.id, target: d1.id, kind: 'real', direction: 'directed' }),
        createEdge({ id: 'del-1-2' as EdgeId, graphId, source: d1.id, target: d2.id, kind: 'real', direction: 'directed' }),
    ]

    return assembleGraph({ id: graphId, title: '删除/撤销测试', nodes: layoutChain([d0, d1, d2]), edges })
}

export function createGoldenTestGraph(graphId: GraphId = 'graph-golden' as GraphId): GraphData {
    const nodes: NodeData[] = [
        createNode({ id: 'node-1' as NodeId, graphId, label: '节点1', summary: '普通实节点', position: { x: 50, y: 120 } }),
        createNode({ id: 'node-2' as NodeId, graphId, label: '节点2', position: { x: 350, y: 120 } }),
        createNode({ id: 'node-3' as NodeId, graphId, label: '抽象节点3', form: 'abstract', childGraphId: 'graph-sub-3' as GraphId, position: { x: 650, y: 120 } }),
        createNode({ id: 'node-4' as NodeId, graphId, kind: 'virtual', label: '虚节点4', position: { x: 950, y: 120 } }),
        createNode({ id: 'node-5' as NodeId, graphId, role: 'reference', referenceKind: 'communication', label: '沟通节点5', sourceGraphId: 'graph-golden' as GraphId, sourceNodeId: 'node-1' as NodeId, position: { x: 50, y: 520 } }),
        createNode({ id: 'node-6' as NodeId, graphId, label: '节点6', position: { x: 150, y: 520 } }),
    ]

    const edges: EdgeData[] = [
        createEdge({ id: 'edge-1-2' as EdgeId, graphId, source: 'node-1' as NodeId, target: 'node-2' as NodeId, kind: 'real', direction: 'directed' }),
        createEdge({ id: 'edge-2-3' as EdgeId, graphId, source: 'node-2' as NodeId, target: 'node-3' as NodeId, kind: 'real', direction: 'directed' }),
        createEdge({ id: 'edge-4-6' as EdgeId, graphId, source: 'node-4' as NodeId, target: 'node-6' as NodeId, kind: 'virtual', direction: 'undirected' }),
        createEdge({ id: 'edge-5-2' as EdgeId, graphId, source: 'node-5' as NodeId, target: 'node-2' as NodeId, kind: 'real', direction: 'directed' }),
    ]

    return assembleGraph({ id: graphId, title: '金牌测试图', nodes, edges })
}

// ═══════════════════════════════════════════════════════════════════
// compose 输入图（Step 8 测试基床）
// ═══════════════════════════════════════════════════════════════════

/**
 * 功能：
 *
 *     deconstruct 操作输入图。一个原子实节点 + 若干邻居。
 *
 * 拓扑：
 *
 *     [B] ── [A(atomic)] ── [C]
 *               │
 *              [D]
 *
 * 用途：
 *
 *     测试解构的正常路径和非正常路径（修改 A 的 role/kind/form 即可覆盖全部前置校验）。
 */
export function createDeconstructInputGraph(graphId: GraphId = 'graph-decon' as GraphId): GraphData {
    const a = createNode({ id: 'decon-A' as NodeId, graphId, label: '目标原子节点' })
    const b = createNode({ id: 'decon-B' as NodeId, graphId, label: '邻居B' })
    const c = createNode({ id: 'decon-C' as NodeId, graphId, label: '邻居C' })
    const d = createNode({ id: 'decon-D' as NodeId, graphId, label: '邻居D' })

    const edges: EdgeData[] = [
        createEdge({ id: 'decon-AB' as EdgeId, graphId, source: a.id, target: b.id, kind: 'real', direction: 'undirected' }),
        createEdge({ id: 'decon-AC' as EdgeId, graphId, source: a.id, target: c.id, kind: 'real', direction: 'directed' }),
        createEdge({ id: 'decon-AD' as EdgeId, graphId, source: a.id, target: d.id, kind: 'real', direction: 'undirected' }),
    ]

    return assembleGraph({
        id: graphId, title: '解构输入',
        nodes: layoutGrid([a, b, c, d], 2, 300, 300),
        edges,
    })
}

/**
 * 功能：
 *
 *     induce 操作标准输入图。3 个被选节点 + 2 个未选邻居。
 *
 * 拓扑：
 *
 *               [未选X]
 *               ↗   ↖
 *     [被选A] ── [被选B] ── [被选C]
 *        ↖                    ↗
 *          ──── [未选Y] ─────        ← Y 同时连接 A 和 C（共享沟通节点）
 *
 * 用途：
 *
 *     测试归纳的正常路径。
 */
export function createInduceInputGraph(graphId: GraphId = 'graph-induce' as GraphId): GraphData {
    const a = createNode({ id: 'ind-A' as NodeId, graphId, label: '被选A' })
    const b = createNode({ id: 'ind-B' as NodeId, graphId, label: '被选B' })
    const c = createNode({ id: 'ind-C' as NodeId, graphId, label: '被选C' })
    const x = createNode({ id: 'ind-X' as NodeId, graphId, label: '未选X' })
    const y = createNode({ id: 'ind-Y' as NodeId, graphId, label: '未选Y' })

    const edges: EdgeData[] = [
        createEdge({ id: 'ind-AB' as EdgeId, graphId, source: a.id, target: b.id, kind: 'real', direction: 'undirected' }),
        createEdge({ id: 'ind-BC' as EdgeId, graphId, source: b.id, target: c.id, kind: 'real', direction: 'undirected' }),
        createEdge({ id: 'ind-AX' as EdgeId, graphId, source: a.id, target: x.id, kind: 'real', direction: 'undirected' }),
        createEdge({ id: 'ind-BX' as EdgeId, graphId, source: b.id, target: x.id, kind: 'real', direction: 'undirected' }),
        createEdge({ id: 'ind-AY' as EdgeId, graphId, source: a.id, target: y.id, kind: 'real', direction: 'directed' }),
        createEdge({ id: 'ind-CY' as EdgeId, graphId, source: c.id, target: y.id, kind: 'real', direction: 'directed' }),
        createEdge({ id: 'ind-AC' as EdgeId, graphId, source: a.id, target: c.id, kind: 'real', direction: 'undirected' }),
    ]

    return assembleGraph({
        id: graphId, title: '归纳输入',
        nodes: layoutGrid([a, b, c, x, y], 3, 300, 300),
        edges,
    })
}

/**
 * 功能：
 *
 *     induce 含启发节点的输入图。一个启发引用节点参与归纳。
 */
export function createInduceWithHeuristicInputGraph(graphId: GraphId = 'graph-ind-heur' as GraphId): GraphData {
    const a = createNode({ id: 'ih-A' as NodeId, graphId, label: '被选A' })
    const h = createNode({
        id: 'ih-H' as NodeId, graphId, label: '被选启发节点',
        role: 'reference', referenceKind: 'heuristic',
        sourceGraphId: 'graph-other' as GraphId, sourceNodeId: 'other-node' as NodeId,
    })
    const x = createNode({ id: 'ih-X' as NodeId, graphId, label: '未选X' })

    const edges: EdgeData[] = [
        createEdge({ id: 'ih-AX' as EdgeId, graphId, source: a.id, target: x.id, kind: 'real', direction: 'undirected' }),
        createEdge({ id: 'ih-HX' as EdgeId, graphId, source: h.id, target: x.id, kind: 'virtual', direction: 'directed' }),
    ]

    return assembleGraph({
        id: graphId, title: '归纳含启发节点',
        nodes: layoutChain([a, h, x]),
        edges,
    })
}

/**
 * 功能：
 *
 *     internalize 操作混合输入图。知识节点 + 引用节点混合。
 *
 * 用途：
 *
 *     测试内化时引用节点自动删除、知识节点正常迁入常识层。
 */
export function createInternalizeInputGraph(graphId: GraphId = 'graph-intern' as GraphId): GraphData {
    const k1 = createNode({ id: 'int-K1' as NodeId, graphId, label: '知识节点1' })
    const k2 = createNode({ id: 'int-K2' as NodeId, graphId, label: '知识节点2' })
    const ref = createNode({
        id: 'int-Ref' as NodeId, graphId, label: '沟通节点',
        role: 'reference', referenceKind: 'communication',
        sourceGraphId: 'graph-parent' as GraphId, sourceNodeId: 'parent-node' as NodeId,
    })

    const edges: EdgeData[] = [
        createEdge({ id: 'int-K1K2' as EdgeId, graphId, source: k1.id, target: k2.id, kind: 'real', direction: 'undirected' }),
        createEdge({ id: 'int-K1Ref' as EdgeId, graphId, source: k1.id, target: ref.id, kind: 'real', direction: 'directed' }),
    ]

    return assembleGraph({
        id: graphId, title: '内化输入',
        nodes: layoutChain([k1, k2, ref]),
        edges,
    })
}

/**
 * 功能：
 *
 *     内化操作抽象节点输入图。一个抽象节点 + 子图含沟通节点。
 *
 * 用法：
 *     测试前先调 deconstruct 创建子图，再用本图验证 internalize 递归清理行为。
 */
export function createInternalizeAbstractInputGraph(
    abstractNodeId: NodeId = 'int-abs' as NodeId,
    graphId: GraphId = 'graph-int-abs' as GraphId,
): GraphData {
    const abs = createNode({
        id: abstractNodeId, graphId, label: '抽象节点',
        form: 'abstract', childGraphId: 'child-int-abs' as GraphId,
    })
    const ext = createNode({ id: 'int-ext' as NodeId, graphId, label: '外部节点' })

    const edges: EdgeData[] = [
        createEdge({ id: 'int-abs-ext' as EdgeId, graphId, source: abs.id, target: ext.id, kind: 'real', direction: 'undirected' }),
    ]

    return assembleGraph({
        id: graphId, title: '内化抽象节点输入',
        nodes: layoutChain([abs, ext]),
        edges,
    })
}

/**
 * 功能：
 *
 *     diverge Case A 标准输入图。两个知识节点在同一图中。
 */
export function createDivergeInputGraph(graphId: GraphId = 'graph-div' as GraphId): GraphData {
    const a = createNode({ id: 'div-A' as NodeId, graphId, label: '源节点' })
    const b = createNode({ id: 'div-B' as NodeId, graphId, label: '目标节点' })

    return assembleGraph({
        id: graphId, title: '发散输入（同图）',
        nodes: layoutChain([a, b]),
        edges: [],
    })
}

/**
 * 功能：
 *
 *     diverge 跨图输入——当前图只有目标节点，源节点在对端图中。
 */
export function createDivergeCrossGraphInput(graphId: GraphId = 'graph-div-cur' as GraphId): {
    current: GraphData
    peer: GraphData
} {
    const peerId = 'graph-div-peer' as GraphId
    const peerNode = createNode({ id: 'div-peer-A' as NodeId, graphId: peerId, label: '对端源节点' })
    const curNode = createNode({ id: 'div-cur-B' as NodeId, graphId, label: '当前目标节点' })

    const current = assembleGraph({
        id: graphId, title: '发散跨图-当前',
        nodes: [curNode],
        edges: [],
    })

    const peer = assembleGraph({
        id: peerId, title: '发散跨图-对端',
        nodes: [peerNode],
        edges: [],
    })

    return { current, peer }
}

/**
 * 功能：
 *
 *     创建空常识层图。
 */
export function createCommonLayerGraph(graphId: GraphId = 'graph-common' as GraphId): GraphData {
    return assembleGraph({
        id: graphId,
        kind: 'commonLayer',
        title: '常识层',
        nodes: [],
        edges: [],
    })
}

// ═══════════ 内部自检 ═══════════

function validateOrThrow(graph: GraphData): void {
    const result = validateGraph(graph)

    if (!result.valid) {
        const details = result.issues
            .map(issue => `  [${issue.severity}] ${issue.code}: ${issue.message} (target: ${issue.targetType} ${issue.targetId ?? ''})`)
            .join('\n')

        throw new Error(
            `test_case_factory: 生成的 GraphData 未通过 schema 校验。\n${details}`,
        )
    }
}
