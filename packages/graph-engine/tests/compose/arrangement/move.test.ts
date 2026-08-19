/**
 * move.test.ts
 *
 * moveNode 测试。单节点移动、碰撞检测、空节点列表。
 */

import type {
    GraphId,
    NodeId,
} from '../../../src/types/graph_data'
import type { NodeRadiusMap } from '../../../src/types/infrastructure_types'
import { moveNode } from '../../../src/compose/arrangement/move'
import { createNode, createEdge, assembleGraph } from '../../test_case_factory'

const G = 'test-move' as GraphId
const R = new Map() as NodeRadiusMap

describe('moveNode', () => {
    test('无碰撞通过', () => {
        const graph = assembleGraph({
            id: G,
            nodes: [
                createNode({
                    id: 'a' as NodeId,
                    graphId: G,
                    position: { x: 0, y: 0 },
                }),
                createNode({
                    id: 'b' as NodeId,
                    graphId: G,
                    position: { x: 500, y: 0 },
                }),
            ],
            edges: [],
        })
        const result = moveNode({
            nodeId: 'a' as NodeId,
            desiredPosition: { x: 100, y: 100 },
            allNodes: graph.nodes,
            nodeRadiusOverrides: R,
        })
        expect(result.issues).toHaveLength(0)
        expect(result.operations).toHaveLength(1)
        expect(result.operations[0]!.type).toBe('move_node')
    })

    test('碰撞返回 error', () => {
        const graph = assembleGraph({
            id: G,
            nodes: [
                createNode({
                    id: 'a' as NodeId,
                    graphId: G,
                    position: { x: 0, y: 0 },
                }),
                createNode({
                    id: 'b' as NodeId,
                    graphId: G,
                    position: { x: 50, y: 0 },
                }),
            ],
            edges: [],
        })
        // a 要移到 b 的位置 → 碰撞
        const result = moveNode({
            nodeId: 'a' as NodeId,
            desiredPosition: { x: 50, y: 0 },
            allNodes: graph.nodes,
            nodeRadiusOverrides: R,
        })
        expect(result.issues.some((i) => i.severity === 'error')).toBe(true)
    })
})
