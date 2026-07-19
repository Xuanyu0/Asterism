/**
 * test_case_factory.ts
 *
 * 功能：
 *     知识图谱测试数据工厂。与 engine __tests__ 版 API 一致。
 *     用来构造测试数据集
 *
 * 外部如何使用：
 *     import { createGoldenTestGraph } from '@/mock/test_case_factory'
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
} from '@my-project/graph-engine'

import { validateGraph } from '@my-project/graph-engine'
import { normalizeGraph } from '@my-project/graph-engine'
import { loadGraph, saveGraph } from '@/graph/graph_persistence'

// ═══════════ 构造节点/边 ═══════════

export function createNode(overrides: {
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
}): NodeData {
    const role = overrides.role ?? 'knowledge'

    if (role === 'knowledge') {
        const kind = overrides.kind ?? 'real'
        return {
            role: 'knowledge', id: overrides.id, graphId: overrides.graphId, kind,
            label: overrides.label ?? overrides.id, summary: overrides.summary,
            form: overrides.form ?? (kind === 'real' ? 'atomic' : undefined),
            abstractionLevel: overrides.abstractionLevel ?? 0, degree: overrides.degree ?? 0,
            position: overrides.position, childGraphId: overrides.childGraphId,
            noteLink: overrides.noteLink,
        }
    }

    return {
        role: 'reference', id: overrides.id, graphId: overrides.graphId,
        referenceKind: overrides.referenceKind!,
        label: overrides.label ?? overrides.id,
        abstractionLevel: overrides.abstractionLevel ?? 0, degree: overrides.degree ?? 0,
        position: overrides.position, childGraphId: overrides.childGraphId,
        sourceGraphId: overrides.sourceGraphId!, sourceNodeId: overrides.sourceNodeId!,
    }
}

export function createEdge(overrides: {
    id: EdgeId; graphId: GraphId; source: NodeId; target: NodeId
    kind: EdgeKind; direction: EdgeDirection; label?: string
}): EdgeData {
    return { id: overrides.id, graphId: overrides.graphId, source: overrides.source,
             target: overrides.target, kind: overrides.kind, direction: overrides.direction,
             label: overrides.label ?? '' }
}

// ═══════════ 图组装 ═══════════

export function assembleGraph(params: {
    id: GraphId; kind?: GraphKind; title?: string; nodes: NodeData[]; edges: EdgeData[]
    parentGraphId?: GraphId; ownerNodeId?: NodeId
}): GraphData {
    const degreeMap = new Map<NodeId, number>()
    for (const node of params.nodes) degreeMap.set(node.id, 0)
    for (const edge of params.edges) {
        degreeMap.set(edge.source, (degreeMap.get(edge.source) ?? 0) + 1)
        degreeMap.set(edge.target, (degreeMap.get(edge.target) ?? 0) + 1)
    }

    const now = new Date().toISOString()
    const graph: GraphData = {
        id: params.id, kind: params.kind ?? 'root', title: params.title ?? params.id,
        nodes: params.nodes.map(node => ({ ...node, degree: degreeMap.get(node.id) ?? 0 })),
        edges: params.edges, parentGraphId: params.parentGraphId,
        ownerNodeId: params.ownerNodeId, createdAt: now, updatedAt: now,
    }

    const normalized = normalizeGraph(graph)
    validateOrThrow(normalized)
    return normalized
}

// ═══════════ 布局辅助 ═══════════

export function layoutChain(nodes: NodeData[], spacing = 300, startX = 50, y = 120): NodeData[] {
    return nodes.map((node, i) => ({ ...node, position: { x: startX + i * spacing, y } }))
}

export function layoutGrid(nodes: NodeData[], cols = 3, spacingX = 300, spacingY = 400, startX = 50, startY = 120): NodeData[] {
    return nodes.map((node, i) => ({ ...node, position: { x: startX + (i % cols) * spacingX, y: startY + Math.floor(i / cols) * spacingY } }))
}

// ═══════════ 基础拓扑生成器 ═══════════

const G = 'graph-test' as GraphId

export function createChainDAG(n = 3, graphId: GraphId = G): GraphData {
    const nodes: NodeData[] = []
    for (let i = 0; i < n; i++) nodes.push(createNode({ id: `chain-${i}` as NodeId, graphId }))
    const edges: EdgeData[] = []
    for (let i = 0; i < n - 1; i++) edges.push(createEdge({ id: `chain-${i}-${i + 1}` as EdgeId, graphId, source: nodes[i]!.id, target: nodes[i + 1]!.id, kind: 'real', direction: 'directed' }))
    return assembleGraph({ id: graphId, title: `链式 DAG (${n} 节点)`, nodes: layoutChain(nodes), edges })
}

export function createEdgeMatrixGraph(graphId: GraphId = G): GraphData {
    const [n0, n1, n2, n3] = [createNode({ id: 'mx-0' as NodeId, graphId }), createNode({ id: 'mx-1' as NodeId, graphId }), createNode({ id: 'mx-2' as NodeId, graphId }), createNode({ id: 'mx-3' as NodeId, graphId })]
    const edges: EdgeData[] = [
        createEdge({ id: 'mx-real-dir' as EdgeId, graphId, source: n0.id, target: n1.id, kind: 'real', direction: 'directed' }),
        createEdge({ id: 'mx-real-undir' as EdgeId, graphId, source: n1.id, target: n2.id, kind: 'real', direction: 'undirected' }),
        createEdge({ id: 'mx-virt-dir' as EdgeId, graphId, source: n2.id, target: n3.id, kind: 'virtual', direction: 'directed' }),
        createEdge({ id: 'mx-virt-undir' as EdgeId, graphId, source: n0.id, target: n3.id, kind: 'virtual', direction: 'undirected' }),
    ]
    return assembleGraph({ id: graphId, title: '2×2 边矩阵', nodes: layoutGrid([n0, n1, n2, n3], 2), edges })
}

export function createVirtualNodeTestGraph(graphId: GraphId = G): GraphData {
    const v0 = createNode({ id: 'vrt-0' as NodeId, graphId, kind: 'virtual' }), v1 = createNode({ id: 'vrt-1' as NodeId, graphId, kind: 'virtual' })
    const r0 = createNode({ id: 'vrt-r0' as NodeId, graphId }), r1 = createNode({ id: 'vrt-r1' as NodeId, graphId })
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
    return assembleGraph({ id: graphId, title: '抽象节点测试', nodes: layoutChain([abs, real], 300), edges: [createEdge({ id: 'abs-edge' as EdgeId, graphId, source: abs.id, target: real.id, kind: 'real', direction: 'directed' })] })
}

export function createCommunicationTestGraph(graphId: GraphId = G): GraphData {
    const real = createNode({ id: 'comm-real' as NodeId, graphId })
    const comm = createNode({ id: 'comm-node' as NodeId, graphId, role: 'reference', referenceKind: 'communication', sourceGraphId: 'graph-parent' as GraphId, sourceNodeId: 'src-node' as NodeId })
    return assembleGraph({ id: graphId, title: '沟通节点/边测试', nodes: layoutChain([real, comm]), edges: [createEdge({ id: 'comm-edge' as EdgeId, graphId, source: comm.id, target: real.id, kind: 'real', direction: 'directed' })] })
}

export function createDeleteUndoTestGraph(graphId: GraphId = G): GraphData {
    const [d0, d1, d2] = [createNode({ id: 'del-0' as NodeId, graphId }), createNode({ id: 'del-1' as NodeId, graphId }), createNode({ id: 'del-2' as NodeId, graphId })]
    return assembleGraph({ id: graphId, title: '删除/撤销测试', nodes: layoutChain([d0, d1, d2]), edges: [
        createEdge({ id: 'del-0-1' as EdgeId, graphId, source: d0.id, target: d1.id, kind: 'real', direction: 'directed' }),
        createEdge({ id: 'del-1-2' as EdgeId, graphId, source: d1.id, target: d2.id, kind: 'real', direction: 'directed' }),
    ]})
}

export function createGoldenTestGraph(graphId: GraphId = 'graph-golden' as GraphId): GraphData {
    const nodes: NodeData[] = [
        createNode({ id: 'node-1' as NodeId, graphId, label: '节点1', position: { x: 50, y: 120 } }),
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

// ═══════════ 金牌/银牌测试图对 ═══════════

/**
 * 功能：
 *     创建银牌测试图及其子图，持久化子图到 localStorage。
 *
 * 图结构：
 *     银牌根图 (id="graph-silver") + 银牌子图 (id="sub-silver")
 *     覆盖 real / abstract / reference（communication）节点和 directed 边。
 *
 * 规则：
 *     1. 子图通过 saveGraph 持久化，根图由调用方自行 persist。
 *     2. 本函数不校验银牌图中 reference 节点指向的金牌图是否存在；
 *        调用方（如 createGoldenTestGraphV2）应确保金牌图已持久化。
 *     3. 返回的银牌根图引用 sv-node-4 (reference) 指向金牌图节点 node-g1。
 *
 * 使用：
 *     const silver = createSilverTestGraph()
 *     saveGraph(silver)
 */
export function createSilverTestGraph(graphId?: GraphId): GraphData {
    const gId = graphId ?? ('graph-silver' as GraphId)

    // — 银牌父图 —
    const nodes: NodeData[] = [
        createNode({ id: 'sv-node-1' as NodeId, graphId: gId, label: '跳转目标', position: { x: 50, y: 200 } }),
        createNode({ id: 'sv-node-2' as NodeId, graphId: gId, label: '银牌节点B', position: { x: 350, y: 200 } }),
        createNode({ id: 'sv-node-3' as NodeId, graphId: gId, label: '抽象节点', form: 'abstract', childGraphId: 'sub-silver' as GraphId, position: { x: 650, y: 200 } }),
        createNode({ id: 'sv-node-4' as NodeId, graphId: gId, role: 'reference', referenceKind: 'communication', label: '回金牌', sourceGraphId: 'graph-golden' as GraphId, sourceNodeId: 'node-g1' as NodeId, position: { x: 50, y: 500 } }),
        createNode({ id: 'sv-node-5' as NodeId, graphId: gId, label: '银牌节点E', position: { x: 350, y: 500 } }),
    ]
    const edges: EdgeData[] = [
        createEdge({ id: 'edge-sv12' as EdgeId, graphId: gId, source: 'sv-node-1' as NodeId, target: 'sv-node-2' as NodeId, kind: 'real', direction: 'directed' }),
        createEdge({ id: 'edge-sv23' as EdgeId, graphId: gId, source: 'sv-node-2' as NodeId, target: 'sv-node-3' as NodeId, kind: 'real', direction: 'directed' }),
        createEdge({ id: 'edge-sv45' as EdgeId, graphId: gId, source: 'sv-node-4' as NodeId, target: 'sv-node-5' as NodeId, kind: 'real', direction: 'directed' }),
    ]
    const parentGraph = assembleGraph({ id: gId, title: '银牌测试图', nodes, edges })

    // — 银牌子图 —
    const subNodes: NodeData[] = [
        createNode({ id: 'sv-sub-1' as NodeId, graphId: 'sub-silver' as GraphId, label: '银牌子节点A', position: { x: 200, y: 200 } }),
        createNode({ id: 'sv-sub-2' as NodeId, graphId: 'sub-silver' as GraphId, label: '银牌子节点B', position: { x: 500, y: 200 } }),
    ]
    const subEdges: EdgeData[] = [
        createEdge({ id: 'edge-ss12' as EdgeId, graphId: 'sub-silver' as GraphId, source: 'sv-sub-1' as NodeId, target: 'sv-sub-2' as NodeId, kind: 'real', direction: 'directed' }),
    ]
    const subGraph = assembleGraph({
        id: 'sub-silver' as GraphId, kind: 'subgraph', title: '银牌子图',
        parentGraphId: gId, ownerNodeId: 'sv-node-3' as NodeId,
        nodes: subNodes, edges: subEdges,
    })
    saveGraph(subGraph)

    return parentGraph
}

/**
 * 功能：
 *     创建金牌测试图及其子图，side-effect：持久化子图 + 确保持久化银牌测试图。
 *
 * 规则：
 *     1. 调用前金牌子图和银牌图可能不存在，本函数内部确保它们被创建并持久化。
 *     2. 本函数先检查银牌测试图是否已持久化，若不存在则调用 createSilverTestGraph
 *        创建并持久化（含银牌子图）。
 *     3. 然后创建金牌子图并持久化。
 *     4. 返回金牌父图 GraphData，调用方只需 persist 父图并 loadGraphToView。
 *
 * 图结构：
 *     金牌根图 (id="graph-golden") + 金牌子图 (id="sub-golden")
 *     覆盖 real / abstract / virtual / reference（communication）节点和 directed / undirected 边。
 *
 * 使用：
 *     const golden = createGoldenTestGraphV2()
 *     saveGraph(golden)
 *     graphStore.loadGraphToView(golden.id)
 */
export function createGoldenTestGraphV2(graphId?: GraphId): GraphData {
    const gId = graphId ?? ('graph-golden' as GraphId)

    // 确保银牌测试图已存在（金牌引用节点指向它）
    if (!loadGraph('graph-silver' as GraphId)) {
        const silverGraph = createSilverTestGraph()
        saveGraph(silverGraph)
    }

    // — 金牌父图 —
    const nodes: NodeData[] = [
        createNode({ id: 'node-g1' as NodeId, graphId: gId, label: '知识节点A', position: { x: 50, y: 200 } }),
        createNode({ id: 'node-g2' as NodeId, graphId: gId, label: '知识节点B', position: { x: 350, y: 200 } }),
        createNode({ id: 'node-g3' as NodeId, graphId: gId, label: '抽象节点', form: 'abstract', childGraphId: 'sub-golden' as GraphId, position: { x: 650, y: 200 } }),
        createNode({ id: 'node-g4' as NodeId, graphId: gId, kind: 'virtual', label: '虚节点', position: { x: 950, y: 200 } }),
        createNode({ id: 'node-g5' as NodeId, graphId: gId, role: 'reference', referenceKind: 'communication', label: '跳转银牌', sourceGraphId: 'graph-silver' as GraphId, sourceNodeId: 'sv-node-1' as NodeId, position: { x: 50, y: 500 } }),
        createNode({ id: 'node-g6' as NodeId, graphId: gId, label: '知识节点C', position: { x: 350, y: 500 } }),
    ]
    const edges: EdgeData[] = [
        createEdge({ id: 'edge-g12' as EdgeId, graphId: gId, source: 'node-g1' as NodeId, target: 'node-g2' as NodeId, kind: 'real', direction: 'directed' }),
        createEdge({ id: 'edge-g23' as EdgeId, graphId: gId, source: 'node-g2' as NodeId, target: 'node-g3' as NodeId, kind: 'real', direction: 'directed' }),
        createEdge({ id: 'edge-g46' as EdgeId, graphId: gId, source: 'node-g4' as NodeId, target: 'node-g6' as NodeId, kind: 'virtual', direction: 'undirected' }),
        createEdge({ id: 'edge-g51' as EdgeId, graphId: gId, source: 'node-g5' as NodeId, target: 'node-g1' as NodeId, kind: 'real', direction: 'directed' }),
    ]
    const parentGraph = assembleGraph({ id: gId, title: '金牌测试图', nodes, edges })

    // — 金牌子图 —
    const subNodes: NodeData[] = [
        createNode({ id: 'sub-g1' as NodeId, graphId: 'sub-golden' as GraphId, label: '子图节点A', position: { x: 200, y: 200 } }),
        createNode({ id: 'sub-g2' as NodeId, graphId: 'sub-golden' as GraphId, label: '子图节点B', position: { x: 500, y: 200 } }),
    ]
    const subEdges: EdgeData[] = [
        createEdge({ id: 'edge-sg12' as EdgeId, graphId: 'sub-golden' as GraphId, source: 'sub-g1' as NodeId, target: 'sub-g2' as NodeId, kind: 'real', direction: 'directed' }),
    ]
    const subGraph = assembleGraph({
        id: 'sub-golden' as GraphId, kind: 'subgraph', title: '金牌子图',
        parentGraphId: gId, ownerNodeId: 'node-g3' as NodeId,
        nodes: subNodes, edges: subEdges,
    })
    saveGraph(subGraph)

    return parentGraph
}

// 内部自检
function validateOrThrow(graph: GraphData): void {
    const result = validateGraph(graph)
    if (!result.valid) {
        const details = result.issues.map(i => `  [${i.severity}] ${i.code}: ${i.message} (target: ${i.targetType} ${i.targetId ?? ''})`).join('\n')
        throw new Error(`test_case_factory: 生成的 GraphData 未通过 schema 校验。\n${details}`)
    }
}
