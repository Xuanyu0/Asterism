/**
 * 功能：
 *
 *     知识图谱测试数据工厂。构造 V2 金牌/银牌图供 Vitest 集成测试使用。
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

// ═══════════ 金牌/银牌测试图对 ═══════════

/**
 * 功能：
 *
 *     创建银牌测试图及其子图，持久化子图到 localStorage。
 *
 * 图结构：
 *
 *     银牌根图 (id="graph-silver") + 银牌子图 (id="sub-silver")
 *     覆盖 real / abstract / reference（communication）节点和 directed 边。
 *
 * 规则：
 *
 *     1. 子图通过 saveGraph 持久化，根图由调用方自行 persist。
 *     2. 本函数不校验银牌图中 reference 节点指向的金牌图是否存在；
 *        调用方（如 createGoldenTestGraphV2）应确保金牌图已持久化。
 *     3. 返回的银牌根图引用 sv-node-4 (reference) 指向金牌图节点 node-g1。
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
 *
 *     创建金牌测试图及其子图，side-effect：持久化子图 + 确保持久化银牌测试图。
 *
 * 图结构：
 *
 *     金牌根图 (id="graph-golden") + 金牌子图 (id="sub-golden")
 *     覆盖 real / abstract / virtual / reference（communication）节点和 directed / undirected 边。
 *
 * 规则：
 *
 *     1. 调用前金牌子图和银牌图可能不存在，本函数内部确保它们被创建并持久化。
 *     2. 本函数先检查银牌测试图是否已持久化，若不存在则调用 createSilverTestGraph
 *        创建并持久化（含银牌子图）。
 *     3. 然后创建金牌子图并持久化。
 *     4. 返回金牌父图 GraphData，调用方只需 persist 父图并 loadGraphToView。
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
