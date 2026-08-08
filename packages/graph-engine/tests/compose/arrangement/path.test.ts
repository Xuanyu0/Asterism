/**
 * path.test.ts
 *
 * Path 布局测试。直线排列 + 碰撞检测触发 + 无边 error。
 */

import type { GraphId, NodeId, NodeRadiusMap } from '../../../src/types/graph_data'
import { pathLayout } from '../../../src/compose/arrangement/path'
import { createNode, createEdge, assembleGraph } from '../../test_case_factory'

const G = 'test-path' as GraphId
const R = new Map() as NodeRadiusMap

describe('pathLayout', () => {
    test('直线排列', () => {
        const axis = createNode({ id: 'axis' as NodeId, graphId: G, position: { x: 0, y: 0 } })
        const p1 = createNode({ id: 'p1' as NodeId, graphId: G, position: { x: 100, y: 0 } })
        const p2 = createNode({ id: 'p2' as NodeId, graphId: G, position: { x: 200, y: 0 } })
        const graph = assembleGraph({ id: G, nodes: [axis, p1, p2], edges: [
            createEdge({ id: 'a1' as NodeId, graphId: G, source: 'axis' as NodeId, target: 'p1' as NodeId, kind: 'real', direction: 'directed' }),
            createEdge({ id: 'a2' as NodeId, graphId: G, source: 'axis' as NodeId, target: 'p2' as NodeId, kind: 'real', direction: 'directed' }),
        ] })

        const result = pathLayout({
            axis: { id: 'axis' as NodeId, position: { x: 0, y: 0 } },
            pathNodes: [{ id: 'p1' as NodeId, radius: 10 }, { id: 'p2' as NodeId, radius: 10 }],
            direction: 0,
            spacing: 1000,
            allNodes: graph.nodes,
            allEdges: graph.edges,
            nodeRadiusOverrides: R,
        })
        expect(result.issues.filter(i => i.severity === 'error')).toHaveLength(0)
        expect(result.operations).toHaveLength(2)
    })

    test('无边 error', () => {
        const axis = createNode({ id: 'axis' as NodeId, graphId: G, position: { x: 0, y: 0 } })
        const p1 = createNode({ id: 'p1' as NodeId, graphId: G, position: { x: 100, y: 0 } })
        const graph = assembleGraph({ id: G, nodes: [axis, p1], edges: [] })

        const result = pathLayout({
            axis: { id: 'axis' as NodeId, position: { x: 0, y: 0 } },
            pathNodes: [{ id: 'p1' as NodeId, radius: 10 }],
            direction: 0,
            spacing: 1000,
            allNodes: graph.nodes,
            allEdges: graph.edges,
            nodeRadiusOverrides: R,
        })
        expect(result.issues.some(i => i.message.includes('有向实边'))).toBe(true)
    })
})
