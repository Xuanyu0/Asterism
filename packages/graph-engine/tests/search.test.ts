/**
 * search.test.ts
 *
 * 测试 searchNodes 单图搜索、全图搜索和 graphPath 路径回溯。
 */

import { describe, it, expect } from 'vitest'
import { searchNodes } from '../src/infrastructure/search'
import { createRegistry, registerGraph } from '../src/infrastructure/graph_registry'
import type { GraphData, NodeData, GraphRegistry } from '../src/types/graph_data'

// helpers

function graph(id: string, title: string, nodes: NodeData[], parentGraphId?: string): GraphData {
    return {
        id,
        kind: parentGraphId ? 'subgraph' : 'main',
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

function refNode(id: string, label: string, sourceGraphId: string, sourceNodeId: string): NodeData {
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

// ═══════════ searchNodes ═══════════

describe('searchNodes', () => {
    it('returns empty array for empty query', () => {
        const registry = createRegistry()

        const results = searchNodes('', registry)

        expect(results).toEqual([])
    })

    it('matches nodes by label substring', () => {
        const registry = createRegistry()
        const g = graph('g1', 'Test Graph', [
            kn('n1', '递归'),
            kn('n2', '迭代'),
            kn('n3', '尾递归优化'),
        ])
        registerGraph(registry, g)

        const results = searchNodes('递归', registry)

        expect(results).toHaveLength(2)
        expect(results.map(r => r.nodeId)).toEqual(['n1', 'n3'])
    })

    it('returns empty array when no match', () => {
        const registry = createRegistry()

        registerGraph(registry, graph('g1', 'G', [kn('n1', '递归')]))
        const results = searchNodes('不存在', registry)

        expect(results).toEqual([])
    })

    it('searches single graph when graphId provided', () => {
        const registry = createRegistry()

        registerGraph(registry, graph('g1', '图一', [kn('n1', '递归')]))
        registerGraph(registry, graph('g2', '图二', [kn('n2', '递归函数')]))
        const results = searchNodes('递归', registry, 'g1')

        expect(results).toHaveLength(1)
        expect(results[0]!.graphId).toBe('g1')
    })

    it('searches all graphs when graphId omitted', () => {
        const registry = createRegistry()

        registerGraph(registry, graph('g1', '图一', [kn('n1', '递归')]))
        registerGraph(registry, graph('g2', '图二', [kn('n2', '递归函数')]))
        const results = searchNodes('递归', registry)

        expect(results).toHaveLength(2)
    })

    it('returns empty for nonexistent graphId', () => {
        const results = searchNodes('递归', createRegistry(), 'missing')
        expect(results).toEqual([])
    })

    it('matches reference nodes as well', () => {
        const registry = createRegistry()
        const g = graph('g1', 'G', [
            kn('n1', '递归'),
            refNode('r1', '递归投影', 'g0', 'x'),
        ])
        registerGraph(registry, g)

        const results = searchNodes('递归', registry)

        expect(results).toHaveLength(2)
    })
})

// ═══════════ graphPath backtracking ═══════════

describe('graphPath in search results', () => {
    it('builds root-to-leaf path for nested graphs', () => {
        const registry = createRegistry()

        const g0 = graph('root', '根图', [kn('n0', '根节点')])
        const g1 = graph('child', '子图', [kn('n1', '递归')], 'root')
        const g2 = graph('grandchild', '孙图', [kn('n2', '递归')], 'child')

        registerGraph(registry, g0)
        registerGraph(registry, g1)
        registerGraph(registry, g2)

        const results = searchNodes('递归', registry)

        for (const r of results) {
            expect(r.graphPath[0]).toBe('root')
            expect(r.graphPath[r.graphPath.length - 1]).toBe(r.graphId)
        }
    })

    it('single root graph has path of length 1', () => {
        const registry = createRegistry()

        registerGraph(registry, graph('root', '根图', [kn('n1', '递归')]))
        const results = searchNodes('递归', registry)

        expect(results).toHaveLength(1)
        expect(results[0]!.graphPath).toEqual(['root'])
    })
})
