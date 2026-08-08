/**
 * replay.test.ts
 *
 * 操作序列回放测试。验证 replayGraph / replayToStep 从基线图 + 操作序列恢复状态。
 */

import type { GraphData, GraphId, NodeId } from '../../src/types/graph_data'
import { replayGraph, replayToStep } from '../../src/core/replay'
import { createNode, createEdge, assembleGraph } from '../test_case_factory'

const G = 'test-replay' as GraphId

function makeGraph(nodes = 3, edges = 2): GraphData {
    const n: GraphData['nodes'] = []
    for (let i = 0; i < nodes; i++) {
        n.push(createNode({ id: `n${i}` as NodeId, graphId: G }))
    }
    const e: GraphData['edges'] = []
    for (let i = 0; i < edges && i < nodes - 1; i++) {
        e.push(createEdge({ id: `e${i}` as NodeId, graphId: G, source: `n${i}` as NodeId, target: `n${i + 1}` as NodeId, kind: 'real', direction: 'directed' }))
    }
    return assembleGraph({ id: G, nodes: n, edges: e })
}

describe('replay', () => {
    test('replayGraph 全量回放到末尾', () => {
        const base = makeGraph(3, 0)
        const ops = [
            { type: 'add_edge' as const, edge: createEdge({ id: 'e0' as NodeId, graphId: G, source: 'n0' as NodeId, target: 'n1' as NodeId, kind: 'real', direction: 'directed' }) },
            { type: 'add_edge' as const, edge: createEdge({ id: 'e1' as NodeId, graphId: G, source: 'n1' as NodeId, target: 'n2' as NodeId, kind: 'real', direction: 'directed' }) },
        ]
        const result = replayGraph(base, ops)
        expect(result.edges.length).toBe(2)
    })

    test('replayToStep 部分回放', () => {
        const base = makeGraph(3, 0)
        const ops = [
            { type: 'add_edge' as const, edge: createEdge({ id: 'e0' as NodeId, graphId: G, source: 'n0' as NodeId, target: 'n1' as NodeId, kind: 'real', direction: 'directed' }) },
            { type: 'add_edge' as const, edge: createEdge({ id: 'e1' as NodeId, graphId: G, source: 'n1' as NodeId, target: 'n2' as NodeId, kind: 'real', direction: 'directed' }) },
        ]
        const r0 = replayToStep(base, ops, 0)
        expect(r0.edges.length).toBe(0)
        const r1 = replayToStep(base, ops, 1)
        expect(r1.edges.length).toBe(1)
        const r2 = replayToStep(base, ops, 2)
        expect(r2.edges.length).toBe(2)
    })

    test('replayToStep step 超出范围时截断', () => {
        const base = makeGraph(3, 0)
        const ops = [{ type: 'add_edge' as const, edge: createEdge({ id: 'e0' as NodeId, graphId: G, source: 'n0' as NodeId, target: 'n1' as NodeId, kind: 'real', direction: 'directed' }) }]
        const r = replayToStep(base, ops, 99)
        expect(r.edges.length).toBe(1)
    })
})
