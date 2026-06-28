/**
 * pipeline.test.ts
 *
 * applyBatch 事务语义测试。
 */

import { describe, it, expect } from 'vitest'
import type { GraphData, GraphId, NodeId } from '../../src/types/graph_data'
import { applyBatch } from '../../src/compose/pipeline'
import { createNode, createEdge, assembleGraph } from '../test_case_factory'

const G = 'test-pl' as GraphId

function makeBase(): GraphData {
    return assembleGraph({ id: G, nodes: [
        createNode({ id: 'n0' as NodeId, graphId: G }),
        createNode({ id: 'n1' as NodeId, graphId: G }),
    ], edges: [] })
}

describe('applyBatch', () => {
    it('全通过时全部执行', () => {
        const graph = makeBase()
        const ops = [
            { type: 'add_edge' as const, edge: createEdge({ id: 'e0' as NodeId, graphId: G, source: 'n0' as NodeId, target: 'n1' as NodeId, kind: 'real', direction: 'directed' }) },
        ]
        const result = applyBatch(graph, ops)
        expect(result.validation.valid).toBe(true)
        expect(result.graph.edges.length).toBe(1)
    })

    it('任一失败则整批丢弃', () => {
        const graph = makeBase()
        const ops = [
            { type: 'add_edge' as const, edge: createEdge({ id: 'e0' as NodeId, graphId: G, source: 'n0' as NodeId, target: 'n1' as NodeId, kind: 'real', direction: 'directed' }) },
            { type: 'add_edge' as const, edge: createEdge({ id: 'e1' as NodeId, graphId: G, source: 'n-x' as NodeId, target: 'n1' as NodeId, kind: 'real', direction: 'directed' }) }, // 失败
        ]
        const result = applyBatch(graph, ops)
        expect(result.validation.valid).toBe(false)
        expect(result.graph.edges.length).toBe(0) // 全丢
    })

    it('dryRun 模式：校验但不执行', () => {
        const graph = makeBase()
        const ops = [
            { type: 'add_edge' as const, edge: createEdge({ id: 'e0' as NodeId, graphId: G, source: 'n0' as NodeId, target: 'n1' as NodeId, kind: 'real', direction: 'directed' }) },
        ]
        const result = applyBatch(graph, ops, { dryRun: true })
        expect(result.validation.valid).toBe(true)
        expect(result.graph.edges.length).toBe(0) // 没执行
    })

    it('stopOnFirst：遇第一个失败即停', () => {
        const graph = makeBase()
        const ops = [
            { type: 'add_edge' as const, edge: createEdge({ id: 'e-bad' as NodeId, graphId: G, source: 'n-x' as NodeId, target: 'n0' as NodeId, kind: 'real', direction: 'directed' }) },
            createNode({ id: 'n2' as NodeId, graphId: G }), // not a valid op for add_edge, 会被后续 validate 拦截——但 stopOnFirst 会让它不被校验
        ]
        const result = applyBatch(graph, ops, { stopOnFirst: true })
        expect(result.validation.valid).toBe(false)
        expect(result.results.length).toBe(1) // 第一个失败后停
    })

    it('add_graph 校验通过并返回原图不变', () => {
        const graph = makeBase()
        const child = assembleGraph({ id: 'child-pl' as GraphId, nodes: [], edges: [], kind: 'subgraph' })
        const ops = [
            { type: 'add_graph' as const, graph: child },
        ]
        const result = applyBatch(graph, ops)
        expect(result.validation.valid).toBe(true)
        // 当前图不变——add_graph 只声明子图的存在，registry 写操作由 Runtime 处理
        expect(result.graph).toBe(graph)
    })
})
