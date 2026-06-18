/**
 * sync.test.ts
 *
 * syncReferenceNodeDegree 测试。
 */

import { describe, it, expect } from 'vitest'
import type { GraphId, NodeId, NodeData } from '../../src/types/graph_data'
import { syncReferenceNodeDegree } from '../../src/core/sync'

const G = 'test-sync' as GraphId

describe('syncReferenceNodeDegree', () => {
    it('源节点 degree 变更后同图引用节点跟随', () => {
        const nodes: NodeData[] = [
            { role: 'knowledge' as const, id: 'src' as NodeId, graphId: G, kind: 'real' as const, label: 'src', degree: 3, abstractionLevel: 0, form: 'atomic' },
            { role: 'reference' as const, id: 'ref' as NodeId, graphId: G, referenceKind: 'communication', label: 'ref', degree: 1, abstractionLevel: 0, sourceGraphId: G, sourceNodeId: 'src' as NodeId },
        ]
        const synced = syncReferenceNodeDegree(nodes, G, 'src' as NodeId)
        expect(synced.find(node => node.id === 'ref')!.degree).toBe(3)
    })

    it('跨图引用节点不跟随（sourceGraphId 不等于 graphId）', () => {
        const otherGraph = 'test-other' as GraphId
        const nodes: NodeData[] = [
            { role: 'knowledge' as const, id: 'src' as NodeId, graphId: G, kind: 'real' as const, label: 'src', degree: 3, abstractionLevel: 0, form: 'atomic' },
            { role: 'reference' as const, id: 'ref' as NodeId, graphId: G, referenceKind: 'communication', label: 'ref', degree: 1, abstractionLevel: 0, sourceGraphId: otherGraph, sourceNodeId: 'src' as NodeId },
        ]
        const synced = syncReferenceNodeDegree(nodes, G, 'src' as NodeId)
        expect(synced.find(node => node.id === 'ref')!.degree).toBe(1)
    })

    it('源节点不存在时不修改任何节点', () => {
        const nodes: NodeData[] = [
            { role: 'knowledge' as const, id: 'n0' as NodeId, graphId: G, kind: 'real' as const, label: 'n0', degree: 0, abstractionLevel: 0, form: 'atomic' },
        ]
        const synced = syncReferenceNodeDegree(nodes, G, 'n-x' as NodeId)
        expect(synced).toEqual(nodes)
    })
})
