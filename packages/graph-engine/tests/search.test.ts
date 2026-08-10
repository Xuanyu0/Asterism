/**
 * search.test.ts
 *
 * 测试 searchNodes 单图搜索、全图搜索和 graphPath 路径回溯。
 */

import { searchNodes } from '../src/infrastructure/search'
import type { GraphData, GraphId, NodeData } from '../src/types/graph_data'
import type { GraphLookup } from '../src/types/infrastructure_types'

// helpers

function graph(
    id: string,
    title: string,
    nodes: NodeData[],
    parentGraphId?: string,
): GraphData {
    return {
        id,
        kind: parentGraphId ? 'subgraph' : 'root',
        title,
        nodes,
        edges: [],
        parentGraphId,
    }
}

function kn(id: string, label: string): NodeData {
    return {
        id,
        graphId: '',
        role: 'knowledge',
        kind: 'real',
        label,
        degree: 0,
        abstractionLevel: 0,
    }
}

function refNode(
    id: string,
    label: string,
    sourceGraphId: string,
    sourceNodeId: string,
): NodeData {
    return {
        id,
        graphId: '',
        role: 'reference',
        referenceKind: 'heuristic',
        sourceGraphId,
        sourceNodeId,
        label,
        degree: 0,
        abstractionLevel: 0,
    }
}

/** 构造 lookupGraph + graphIds 辅助。 */
function makeLookup(graphs: GraphData[]): {
    graphIds: GraphId[]
    lookupGraph: GraphLookup
} {
    const map = new Map<GraphId, GraphData>()
    for (const g of graphs) {
        map.set(g.id as GraphId, g)
    }
    return {
        graphIds: Array.from(map.keys()),
        lookupGraph: (id: GraphId) => map.get(id),
    }
}

// ═══════════ searchNodes ═══════════

describe('searchNodes', () => {
    test('returns empty array for empty query', () => {
        const { graphIds, lookupGraph } = makeLookup([])

        const results = searchNodes('', graphIds, lookupGraph)

        expect(results).toEqual([])
    })

    test('matches nodes by label substring', () => {
        const g = graph('g1', 'Test Graph', [
            kn('n1', '递归'),
            kn('n2', '迭代'),
            kn('n3', '尾递归优化'),
        ])
        const { graphIds, lookupGraph } = makeLookup([g])

        const results = searchNodes('递归', graphIds, lookupGraph)

        expect(results).toHaveLength(2)
        expect(results.map((r) => r.nodeId)).toEqual(['n1', 'n3'])
    })

    test('returns empty array when no match', () => {
        const { graphIds, lookupGraph } = makeLookup([
            graph('g1', 'G', [kn('n1', '递归')]),
        ])

        const results = searchNodes('不存在', graphIds, lookupGraph)

        expect(results).toEqual([])
    })

    test('searches single graph when graphId provided', () => {
        const g1 = graph('g1', '图一', [kn('n1', '递归')])
        const g2 = graph('g2', '图二', [kn('n2', '递归函数')])
        const { graphIds, lookupGraph } = makeLookup([g1, g2])

        const results = searchNodes(
            '递归',
            graphIds,
            lookupGraph,
            'g1' as GraphId,
        )

        expect(results).toHaveLength(1)
        expect(results[0]!.graphId).toBe('g1')
    })

    test('searches all graphs when all graphIds provided', () => {
        const g1 = graph('g1', '图一', [kn('n1', '递归')])
        const g2 = graph('g2', '图二', [kn('n2', '递归函数')])
        const { graphIds, lookupGraph } = makeLookup([g1, g2])

        const results = searchNodes('递归', graphIds, lookupGraph)

        expect(results).toHaveLength(2)
    })

    test('returns empty for nonexistent graphId', () => {
        const { graphIds, lookupGraph } = makeLookup([])
        const results = searchNodes(
            '递归',
            graphIds,
            lookupGraph,
            'missing' as GraphId,
        )
        expect(results).toEqual([])
    })

    test('matches reference nodes as well', () => {
        const g = graph('g1', 'G', [
            kn('n1', '递归'),
            refNode('r1', '递归投影', 'g0', 'x'),
        ])
        const { graphIds, lookupGraph } = makeLookup([g])

        const results = searchNodes('递归', graphIds, lookupGraph)

        expect(results).toHaveLength(2)
    })
})

// ═══════════ graphPath backtracking ═══════════

describe('graphPath in search results', () => {
    test('builds root-to-leaf path for nested graphs', () => {
        const g0 = graph('root', '根图', [kn('n0', '根节点')])
        const g1 = graph('child', '子图', [kn('n1', '递归')], 'root')
        const g2 = graph('grandchild', '孙图', [kn('n2', '递归')], 'child')
        const { graphIds, lookupGraph } = makeLookup([g0, g1, g2])

        const results = searchNodes('递归', graphIds, lookupGraph)

        for (const r of results) {
            expect(r.graphPath[0]).toBe('root')
            expect(r.graphPath[r.graphPath.length - 1]).toBe(r.graphId)
        }
    })

    test('single root graph has path of length 1', () => {
        const { graphIds, lookupGraph } = makeLookup([
            graph('root', '根图', [kn('n1', '递归')]),
        ])

        const results = searchNodes('递归', graphIds, lookupGraph)

        expect(results).toHaveLength(1)
        expect(results[0]!.graphPath).toEqual(['root'])
    })
})
