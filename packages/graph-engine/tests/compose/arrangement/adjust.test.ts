/**
 * adjust.test.ts
 *
 * Adjust Distance 和 Adjust Orbit 测试。
 */

import type { GraphId, NodeId, NodeRadiusMap } from '../../../src/types/graph_data'
import { adjustDistance, adjustOrbit } from '../../../src/compose/arrangement/adjust'
import { createNode, assembleGraph } from '../../test_case_factory'
import { DEFAULT_LAYOUT_RULES } from '../../../src/core/layout_rules'

const G = 'test-adj' as GraphId
const R = new Map() as NodeRadiusMap
const unitDistance = DEFAULT_LAYOUT_RULES.unitDistance

describe('adjustDistance', () => {
    test('连续距离调整', () => {
        const node = createNode({ id: 'a' as NodeId, graphId: G, position: { x: 0, y: 0 } })
        const graph = assembleGraph({ id: G, nodes: [node], edges: [] })

        const result = adjustDistance({
            nodeId: 'a' as NodeId,
            center: { x: 0, y: 0 },
            distance: 100,
            angle: 0,
            allNodes: graph.nodes,
            nodeRadiusOverrides: R,
        })
        expect(result.operations).toHaveLength(1)
        expect(result.operations[0]!.type).toBe('move_node')
    })
})

describe('adjustOrbit', () => {
    test('离散层级吸附', () => {
        const node = createNode({ id: 'a' as NodeId, graphId: G, position: { x: 0, y: 0 } })
        const graph = assembleGraph({ id: G, nodes: [node], edges: [] })

        const result = adjustOrbit({
            nodeId: 'a' as NodeId,
            center: { x: 0, y: 0 },
            cursor: { x: 300, y: 0 },
            D0: unitDistance * 5,
            tierCount: 3,
            allNodes: graph.nodes,
            nodeRadiusOverrides: R,
        })
        expect(result.operations).toHaveLength(1)
        // draft 含 tier 和 angle
        expect(result.drafts).toHaveLength(1)
        const draft = result.drafts![0] as any
        expect(draft.tier).toBeDefined()
    })
})
