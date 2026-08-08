/**
 * execute.test.ts
 *
 * 核心层执行路径测试。覆盖 add_node / add_edge / delete_node（含级联）/
 * delete_edge / update_node（含 label 穿透）/ update_edge / move_node /
 * collapse_dependency / expand_dependency / add_graph / delete_graph。
 */

import type { GraphData, GraphId, NodeId } from '../../src/types/graph_data'
import { executeOperation } from '../../src/core/execute'
import { createNode, createEdge, assembleGraph } from '../test_case_factory'

const G = 'test-exec' as GraphId

function makeGraph(nodes = 2, edges = 0): GraphData {
    const n: GraphData['nodes'] = []
    for (let i = 0; i < nodes; i++) {
        n.push(createNode({ id: `n${i}` as NodeId, graphId: G }))
    }
    const e: GraphData['edges'] = []
    for (let i = 0; i < edges; i++) {
        e.push(createEdge({ id: `e${i}` as NodeId, graphId: G, source: `n${i}` as NodeId, target: `n${i + 1}` as NodeId, kind: 'real', direction: 'directed' }))
    }
    return assembleGraph({ id: G, nodes: n, edges: e })
}

describe('execute add_node', () => {
    test('node 数量 +1', () => {
        const graph = makeGraph(2)
        const next = executeOperation(graph, {
            type: 'add_node',
            node: createNode({ id: 'n-new' as NodeId, graphId: G }),
        })
        expect(next.nodes.length).toBe(3)
        expect(next.nodes.some(node => node.id === 'n-new')).toBe(true)
    })

    test('入参不变', () => {
        const graph = makeGraph(2)
        executeOperation(graph, {
            type: 'add_node',
            node: createNode({ id: 'n-new' as NodeId, graphId: G }),
        })
        expect(graph.nodes.length).toBe(2)
    })
})

describe('execute add_edge', () => {
    test('edge 数量 +1，端点 degree +1', () => {
        const graph = makeGraph(3)
        const next = executeOperation(graph, {
            type: 'add_edge',
            edge: createEdge({ id: 'e-new' as NodeId, graphId: G, source: 'n0' as NodeId, target: 'n1' as NodeId, kind: 'real', direction: 'directed' }),
        })
        expect(next.edges.length).toBe(graph.edges.length + 1)
        const src = next.nodes.find(node => node.id === 'n0')!
        const tgt = next.nodes.find(node => node.id === 'n1')!
        expect(src.degree).toBe(1)
        expect(tgt.degree).toBe(1)
    })
})

describe('execute delete_node', () => {
    test('node 消失，关联边消失', () => {
        const graph = makeGraph(3, 2) // e0: n0→n1, e1: n1→n2
        const next = executeOperation(graph, { type: 'delete_node', nodeId: 'n1' as NodeId })
        expect(next.nodes.length).toBe(2)
        expect(next.edges.length).toBe(0) // both edges involved n1
    })

    test('级联删除同图引用节点', () => {
        const refNode = createNode({
            id: 'ref-0' as NodeId, graphId: G,
            role: 'reference', referenceKind: 'communication',
            sourceGraphId: G, sourceNodeId: 'n0' as NodeId,
        })
        const graph = assembleGraph({ id: G, nodes: [createNode({ id: 'n0' as NodeId, graphId: G }), refNode], edges: [] })
        const next = executeOperation(graph, { type: 'delete_node', nodeId: 'n0' as NodeId })
        expect(next.nodes.length).toBe(0) // 引用节点也删了
    })
})

describe('execute delete_edge', () => {
    test('edge 消失，端点 degree -1', () => {
        const graph = makeGraph(2, 1) // e0: n0→n1
        const srcBefore = graph.nodes.find(node => node.id === 'n0')!.degree
        const next = executeOperation(graph, { type: 'delete_edge', edgeId: 'e0' as NodeId })
        expect(next.edges.length).toBe(0)
        expect(next.nodes.find(node => node.id === 'n0')!.degree).toBe(srcBefore - 1)
    })
})

describe('execute update_node', () => {
    test('label 更新', () => {
        const graph = makeGraph(2)
        const next = executeOperation(graph, {
            type: 'update_node',
            node: { ...graph.nodes[0]!, label: 'updated' },
        })
        expect(next.nodes.find(node => node.id === 'n0')!.label).toBe('updated')
    })

    test('label 穿透到同图引用节点', () => {
        const refNode = createNode({
            id: 'ref-0' as NodeId, graphId: G,
            role: 'reference', referenceKind: 'communication',
            sourceGraphId: G, sourceNodeId: 'n0' as NodeId,
            label: 'old',
        })
        const graph = assembleGraph({ id: G, nodes: [createNode({ id: 'n0' as NodeId, graphId: G, label: 'src' }), refNode], edges: [] })
        const next = executeOperation(graph, {
            type: 'update_node',
            node: { ...refNode, label: 'updated' },
        })
        expect(next.nodes.find(node => node.id === 'n0')!.label).toBe('updated')
    })
})

describe('execute move_node', () => {
    test('position 变更', () => {
        const graph = makeGraph(2)
        const next = executeOperation(graph, { type: 'move_node', nodeId: 'n0' as NodeId, position: { x: 100, y: 200 } })
        expect(next.nodes.find(node => node.id === 'n0')!.position).toEqual({ x: 100, y: 200 })
    })
})

describe('execute collapse / expand', () => {
    test('collapse_dependency 写入 cognitiveState', () => {
        const graph = makeGraph(3, 2) // n0→n1→n2
        const next = executeOperation(graph, { type: 'collapse_dependency', targetNodeId: 'n2' as NodeId })
        expect(next.cognitiveState?.foldedDependencies.length).toBeGreaterThan(0)
    })

    test('expand_dependency 清除折叠', () => {
        const graph = makeGraph(3, 2)
        const collapsed = executeOperation(graph, { type: 'collapse_dependency', targetNodeId: 'n2' as NodeId })
        const expanded = executeOperation(collapsed, { type: 'expand_dependency', targetNodeId: 'n2' as NodeId })
        expect(expanded.cognitiveState?.foldedDependencies.length).toBe(0)
    })
})

describe('execute add_graph / delete_graph', () => {
    test('add_graph 落到 default 分支，返回原图不变', () => {
        const graph = makeGraph(2)
        const result = executeOperation(graph, {
            type: 'add_graph',
            graph: assembleGraph({ id: 'child-1' as GraphId, nodes: [], edges: [], kind: 'subgraph' }),
        })
        expect(result).toBe(graph)
    })

    test('delete_graph 落到 default 分支，返回原图不变', () => {
        const graph = makeGraph(2)
        const result = executeOperation(graph, { type: 'delete_graph', graphId: 'child-1' as GraphId })
        expect(result).toBe(graph)
    })
})
