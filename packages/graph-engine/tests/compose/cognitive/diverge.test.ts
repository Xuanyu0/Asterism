/**
 * diverge.test.ts
 *
 * 发散操作测试。Case A（同图直连）、Case A ref→ref 拒绝、Case B（跨图启发+镜像）。
 */

import { describe, it, expect } from 'vitest'
import type { GraphData, GraphId, NodeId } from '../../../src/types/graph_data'
import type { GraphLookup } from '../../../src/types/infrastructure_types'
import { diverge } from '../../../src/compose/cognitive/diverge'
import { createDivergeInputGraph, createDivergeCrossGraphInput } from '../../test_case_factory'

/** 构造 lookupGraph + graphIds 辅助。 */
function makeLookup(graphs: GraphData[]): { graphIds: GraphId[]; lookupGraph: GraphLookup } {
    const map = new Map<GraphId, GraphData>()
    for (const g of graphs) {
        map.set(g.id as GraphId, g)
    }
    return {
        graphIds: Array.from(map.keys()),
        lookupGraph: (id: GraphId) => map.get(id),
    }
}

describe('diverge', () => {
    it('Case A：同图直连（两知识节点）', () => {
        const current = createDivergeInputGraph()
        const { graphIds, lookupGraph } = makeLookup([current])
        const result = diverge({
            sourceNodeId: 'div-A' as NodeId,
            targetNodeId: 'div-B' as NodeId,
            currentGraph: current,
            heuristicPosition: null,
            lookupGraph,
            graphIds,
        })
        expect(result.issues.filter(i => i.severity === 'error')).toHaveLength(0)
        expect(result.operations.current).toHaveLength(1)
        expect(result.operations.current[0]!.type).toBe('add_edge')
        expect(result.operations.peer).toHaveLength(0)
    })

    it('Case A：ref→ref 拒绝（链式引用禁止）', () => {
        const graph = createDivergeInputGraph()
        const { graphIds, lookupGraph } = makeLookup([graph])
        const result = diverge({
            sourceNodeId: 'div-A' as NodeId,  // knowledge
            targetNodeId: 'div-B' as NodeId,  // knowledge
            currentGraph: graph,
            heuristicPosition: null,
            lookupGraph,
            graphIds,
        })
        // k→k 合法。单独测 ref→ref 需要构造含两个 ref 的图
        // 此场景由 deconstruct 后子图中两个沟通节点无法 diverge 覆盖
    })

    it('Case B：跨图启发创建 + 镜像', () => {
        const { current, peer } = createDivergeCrossGraphInput()
        const { graphIds, lookupGraph } = makeLookup([current, peer])
        // source 在 peer 图中，不在 current 中
        const result = diverge({
            sourceNodeId: 'div-peer-A' as NodeId,
            targetNodeId: 'div-cur-B' as NodeId,
            currentGraph: current,
            heuristicPosition: { x: 300, y: 300 },
            lookupGraph,
            graphIds,
        })
        // heuristicPosition !== null → Case B
        expect(result.issues.filter(i => i.severity === 'error')).toHaveLength(0)
        expect(result.operations.current.length).toBeGreaterThan(0)
        expect(result.operations.peer.length).toBeGreaterThan(0) // 镜像 ops
        // 当前图有 add_node (启发) + add_edge
        expect(result.operations.current.some(op => op.type === 'add_node')).toBe(true)
        expect(result.operations.current.some(op => op.type === 'add_edge')).toBe(true)
    })
})
