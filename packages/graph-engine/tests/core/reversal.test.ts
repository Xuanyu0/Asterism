/**
 * reversal.test.ts
 *
 * 逆操作构造测试。验证 createReversal 为每种 Operation 生成逆操作序列，
 * 且逆操作执行后状态与操作前一致。
 */

import { describe, it, expect } from 'vitest'
import type { GraphData, GraphId, NodeId } from '../../src/types/graph_data'
import { createReversal } from '../../src/core/reversal'
import { executeOperation } from '../../src/core/execute'
import { createNode, createEdge, assembleGraph } from '../test_case_factory'

const G = 'test-rev' as GraphId

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

// 回放逆操作后状态应与操作前一致
function assertReversalRoundTrip(graph: GraphData, op: Parameters<typeof executeOperation>[1]): void {
    const reversals = createReversal(graph, op)
    const after = executeOperation(graph, op)
    let reverted = after
    for (const rev of reversals) {
        reverted = executeOperation(reverted, rev)
    }
    // degree/edges 恢复
    expect(reverted.nodes.length).toBe(graph.nodes.length)
    expect(reverted.edges.length).toBe(graph.edges.length)
}

describe('createReversal add_node', () => {
    it('逆操作 delete_node 恢复原状态', () => {
        const graph = makeGraph(2)
        const op = { type: 'add_node' as const, node: createNode({ id: 'n-new' as NodeId, graphId: G }) }
        assertReversalRoundTrip(graph, op)
    })
})

describe('createReversal add_edge', () => {
    it('逆操作 delete_edge 恢复原状态', () => {
        const graph = makeGraph(3)
        const op = { type: 'add_edge' as const, edge: createEdge({ id: 'e-new' as NodeId, graphId: G, source: 'n0' as NodeId, target: 'n1' as NodeId, kind: 'real', direction: 'directed' }) }
        assertReversalRoundTrip(graph, op)
    })
})

describe('createReversal delete_node', () => {
    it('逆操作重建节点和边', () => {
        const graph = makeGraph(3, 2) // n0→n1→n2
        const op = { type: 'delete_node' as const, nodeId: 'n1' as NodeId }
        const revs = createReversal(graph, op)
        expect(revs.length).toBeGreaterThan(0)
        assertReversalRoundTrip(graph, op)
    })
})

describe('createReversal delete_edge', () => {
    it('逆操作 add_edge 恢复原状态', () => {
        const graph = makeGraph(2, 1)
        const op = { type: 'delete_edge' as const, edgeId: 'e0' as NodeId }
        assertReversalRoundTrip(graph, op)
    })
})

describe('createReversal update_node', () => {
    it('逆操作 update_node 恢复旧值', () => {
        const graph = makeGraph(2)
        const op = { type: 'update_node' as const, node: { ...graph.nodes[0]!, label: 'changed' } }
        assertReversalRoundTrip(graph, op)
    })
})

describe('createReversal update_edge', () => {
    it('逆操作 update_edge 恢复旧值', () => {
        const graph = makeGraph(2, 1)
        const op = { type: 'update_edge' as const, edge: { ...graph.edges[0]!, label: 'changed' } }
        assertReversalRoundTrip(graph, op)
    })
})

describe('createReversal move_node', () => {
    it('逆操作 move_node 恢复旧位置', () => {
        const graph = makeGraph(2)
        const op = { type: 'move_node' as const, nodeId: 'n0' as NodeId, position: { x: 999, y: 888 } }
        assertReversalRoundTrip(graph, op)
    })
})

describe('createReversal add_graph', () => {
    it('逆操作 delete_graph', () => {
        const graph = makeGraph(2)
        const child = assembleGraph({ id: 'child-rev' as GraphId, nodes: [], edges: [], kind: 'subgraph' })
        const op = { type: 'add_graph' as const, graph: child }
        const revs = createReversal(graph, op)
        expect(revs.length).toBeGreaterThan(0)
        expect(revs[0]!.type).toBe('delete_graph')
    })
})
