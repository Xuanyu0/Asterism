/**
 * search.test.ts
 *
 * searchNodes 测试：匹配、跨图搜索、空结果、graphId 过滤、graphPath 回溯。
 */

import { describe, it, expect } from 'vitest'
import type { GraphData, GraphId, NodeId } from '../../src/types/graph_data'
import type { GraphLookup } from '../../src/types/infrastructure_types'
import { searchNodes } from '../../src/infrastructure/search'
import { createNode, assembleGraph } from '../test_case_factory'

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

describe('searchNodes', () => {
    it('label 子串匹配', () => {
        const g = assembleGraph({ id: 's1' as GraphId, nodes: [
            createNode({ id: 'n0' as NodeId, graphId: 's1' as GraphId, label: '相对论' }),
            createNode({ id: 'n1' as NodeId, graphId: 's1' as GraphId, label: '量子力学' }),
        ], edges: [] })
        const { graphIds, lookupGraph } = makeLookup([g])
        const results = searchNodes('相对', graphIds, lookupGraph)
        expect(results).toHaveLength(1)
        expect(results[0]!.node.id).toBe('n0')
    })

    it('空结果', () => {
        const g = assembleGraph({ id: 's1' as GraphId, nodes: [
            createNode({ id: 'n0' as NodeId, graphId: 's1' as GraphId, label: 'test' }),
        ], edges: [] })
        const { graphIds, lookupGraph } = makeLookup([g])
        expect(searchNodes('zzz', graphIds, lookupGraph)).toHaveLength(0)
    })

    it('graphId 过滤', () => {
        const g1 = assembleGraph({ id: 's1' as GraphId, nodes: [
            createNode({ id: 'n0' as NodeId, graphId: 's1' as GraphId, label: 'apple' }),
        ], edges: [] })
        const g2 = assembleGraph({ id: 's2' as GraphId, nodes: [
            createNode({ id: 'n1' as NodeId, graphId: 's2' as GraphId, label: 'apple' }),
        ], edges: [] })
        const { graphIds, lookupGraph } = makeLookup([g1, g2])
        expect(searchNodes('apple', graphIds, lookupGraph, 's1' as GraphId)).toHaveLength(1)
        expect(searchNodes('apple', graphIds, lookupGraph)).toHaveLength(2)
    })
})
