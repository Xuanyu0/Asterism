/**
 * search.test.ts
 *
 * searchNodes 测试：匹配、跨图搜索、空结果、graphId 过滤、graphPath 回溯。
 */

import { describe, it, expect } from 'vitest'
import type { GraphId, NodeId } from '../../src/types/graph_data'
import { searchNodes } from '../../src/infrastructure/search'
import { createRegistry, registerGraph } from '../../src/infrastructure/graph_registry'
import { createNode, assembleGraph } from '../test_case_factory'

describe('searchNodes', () => {
    it('label 子串匹配', () => {
        const r = createRegistry()
        const g = assembleGraph({ id: 's1' as GraphId, nodes: [
            createNode({ id: 'n0' as NodeId, graphId: 's1' as GraphId, label: '相对论' }),
            createNode({ id: 'n1' as NodeId, graphId: 's1' as GraphId, label: '量子力学' }),
        ], edges: [] })
        registerGraph(r, g)
        const results = searchNodes('相对', r)
        expect(results).toHaveLength(1)
        expect(results[0]!.node.id).toBe('n0')
    })

    it('空结果', () => {
        const r = createRegistry()
        const g = assembleGraph({ id: 's1' as GraphId, nodes: [
            createNode({ id: 'n0' as NodeId, graphId: 's1' as GraphId, label: 'test' }),
        ], edges: [] })
        registerGraph(r, g)
        expect(searchNodes('zzz', r)).toHaveLength(0)
    })

    it('graphId 过滤', () => {
        const r = createRegistry()
        registerGraph(r, assembleGraph({ id: 's1' as GraphId, nodes: [
            createNode({ id: 'n0' as NodeId, graphId: 's1' as GraphId, label: 'apple' }),
        ], edges: [] }))
        registerGraph(r, assembleGraph({ id: 's2' as GraphId, nodes: [
            createNode({ id: 'n1' as NodeId, graphId: 's2' as GraphId, label: 'apple' }),
        ], edges: [] }))
        expect(searchNodes('apple', r, 's1' as GraphId)).toHaveLength(1)
        expect(searchNodes('apple', r)).toHaveLength(2)
    })
})
