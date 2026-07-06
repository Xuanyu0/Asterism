/**
 * test_case_factory.ts
 *
 * 功能：
 *     知识图谱测试数据工厂（前端副本）。与 engine __tests__ 版 API 一致。
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

// ═══════════ 原子构建 ═══════════

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
        id: params.id, kind: params.kind ?? 'main', title: params.title ?? params.id,
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

// compose 输入图
export function createDeconstructInputGraph(graphId: GraphId = 'graph-decon' as GraphId): GraphData {
    const a = createNode({ id: 'decon-A' as NodeId, graphId, label: '目标原子节点' })
    const b = createNode({ id: 'decon-B' as NodeId, graphId }), c = createNode({ id: 'decon-C' as NodeId, graphId }), d = createNode({ id: 'decon-D' as NodeId, graphId })
    const edges: EdgeData[] = [
        createEdge({ id: 'decon-AB' as EdgeId, graphId, source: a.id, target: b.id, kind: 'real', direction: 'undirected' }),
        createEdge({ id: 'decon-AC' as EdgeId, graphId, source: a.id, target: c.id, kind: 'real', direction: 'directed' }),
        createEdge({ id: 'decon-AD' as EdgeId, graphId, source: a.id, target: d.id, kind: 'real', direction: 'undirected' }),
    ]
    return assembleGraph({ id: graphId, title: '解构输入', nodes: layoutGrid([a, b, c, d], 2, 300, 300), edges })
}

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
    return assembleGraph({ id: graphId, title: '归纳输入', nodes: layoutGrid([a, b, c, x, y], 3, 300, 300), edges })
}

export function createCommonLayerGraph(graphId: GraphId = 'graph-common' as GraphId): GraphData {
    return assembleGraph({ id: graphId, kind: 'commonLayer', title: '常识层', nodes: [], edges: [] })
}

// 内部自检
function validateOrThrow(graph: GraphData): void {
    const result = validateGraph(graph)
    if (!result.valid) {
        const details = result.issues.map(i => `  [${i.severity}] ${i.code}: ${i.message} (target: ${i.targetType} ${i.targetId ?? ''})`).join('\n')
        throw new Error(`test_case_factory: 生成的 GraphData 未通过 schema 校验。\n${details}`)
    }
}
