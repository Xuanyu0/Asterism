/**
 * orbit.test.ts
 *
 * 环绕布局测试。初始吸附 + 碰撞检测 + 无边 error。
 */

import { describe, it, expect } from 'vitest'
import type { GraphId, NodeId, NodeRadiusMap } from '../../../src/types/graph_data'
import { orbit } from '../../../src/compose/arrangement/orbit'
import { createNode, createEdge, assembleGraph } from '../../test_case_factory'

const G = 'test-orbit' as GraphId
const R = new Map() as NodeRadiusMap

describe('orbit', () => {
    it('合法环绕布局：卫星吸附至轨道', () => {
        const center = createNode({ id: 'center' as NodeId, graphId: G, position: { x: 0, y: 0 } })
        const a = createNode({ id: 'a' as NodeId, graphId: G, position: { x: 2000, y: 0 } })
        const b = createNode({ id: 'b' as NodeId, graphId: G, position: { x: 0, y: 2000 } })
        const graph = assembleGraph({ id: G, nodes: [center, a, b], edges: [
            createEdge({ id: 'ca' as NodeId, graphId: G, source: 'center' as NodeId, target: 'a' as NodeId, kind: 'real', direction: 'undirected' }),
            createEdge({ id: 'cb' as NodeId, graphId: G, source: 'center' as NodeId, target: 'b' as NodeId, kind: 'real', direction: 'undirected' }),
        ] })

        const result = orbit({
            center: { id: 'center' as NodeId, position: { x: 0, y: 0 }, radius: 10 },
            satellites: [{ id: 'a' as NodeId, radius: 10 }, { id: 'b' as NodeId, radius: 10 }],
            tierCount: 3,
            allNodes: graph.nodes,
            allEdges: graph.edges,
            nodeRadiusOverrides: R,
        })
        expect(result.issues.filter(i => i.severity === 'error')).toHaveLength(0)
        expect(result.operations).toHaveLength(2)
        for (const op of result.operations) {
            expect(op.type).toBe('move_node')
        }
    })

    it('无边 error', () => {
        const center = createNode({ id: 'center' as NodeId, graphId: G, position: { x: 0, y: 0 } })
        const a = createNode({ id: 'a' as NodeId, graphId: G, position: { x: 200, y: 0 } })
        const graph = assembleGraph({ id: G, nodes: [center, a], edges: [] })

        const result = orbit({
            center: { id: 'center' as NodeId, position: { x: 0, y: 0 }, radius: 10 },
            satellites: [{ id: 'a' as NodeId, radius: 10 }],
            tierCount: 3,
            allNodes: graph.nodes,
            allEdges: graph.edges,
            nodeRadiusOverrides: R,
        })
        expect(result.issues.some(i => i.severity === 'error' && i.message.includes('实边'))).toBe(true)
    })
})
