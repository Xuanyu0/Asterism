/**
 * induce.test.ts
 *
 * 归纳操作测试。
 */

import type { GraphId, NodeId } from '../../../src/types/graph_data'
import { induce } from '../../../src/compose/cognitive/induce'
import {
    createInduceInputGraph,
    createInduceWithHeuristicInputGraph,
    createNode,
    assembleGraph,
} from '../../test_case_factory'

const R = new Map()

describe('induce', () => {
    test('标准归纳（5 节点）', () => {
        const graph = createInduceInputGraph()
        const result = induce({
            nodeIds: ['ind-A', 'ind-B', 'ind-C'] as NodeId[],
            parentGraph: graph,
            registry: new Map(),
            nodeRadiusOverrides: R,
            allEdges: graph.edges,
        })
        expect(
            result.issues.filter((i) => i.severity === 'error'),
        ).toHaveLength(0)
        // 子图 ops 存在
        expect(result.operations.child.length).toBeGreaterThan(0)
        // 父图 ops 存在
        expect(result.operations.parent.length).toBeGreaterThan(0)
        // add_graph 在子图 ops 中
        expect(result.operations.child[0]!.type).toBe('add_graph')
    })

    test('含启发节点参与', () => {
        const graph = createInduceWithHeuristicInputGraph()
        const result = induce({
            nodeIds: ['ih-A', 'ih-H'] as NodeId[],
            parentGraph: graph,
            registry: new Map(),
            nodeRadiusOverrides: R,
            allEdges: graph.edges,
        })
        expect(
            result.issues.filter((i) => i.severity === 'error'),
        ).toHaveLength(0)
    })

    test('沟通节点拒绝', () => {
        const graph = assembleGraph({
            id: 'test-ind-comm' as GraphId,
            nodes: [
                createNode({
                    id: 'k' as NodeId,
                    graphId: 'test-ind-comm' as GraphId,
                }),
                createNode({
                    id: 'c' as NodeId,
                    graphId: 'test-ind-comm' as GraphId,
                    role: 'reference',
                    referenceKind: 'communication',
                    sourceGraphId: 'g' as GraphId,
                    sourceNodeId: 's' as NodeId,
                }),
            ],
            edges: [],
        })
        const result = induce({
            nodeIds: ['k', 'c'] as NodeId[],
            parentGraph: graph,
            registry: new Map(),
            nodeRadiusOverrides: R,
            allEdges: graph.edges,
        })
        expect(result.issues.some((i) => i.message.includes('沟通节点'))).toBe(
            true,
        )
    })

    test('< 2 节点拒绝', () => {
        const graph = createInduceInputGraph()
        const result = induce({
            nodeIds: ['ind-A'] as NodeId[],
            parentGraph: graph,
            registry: new Map(),
            nodeRadiusOverrides: R,
            allEdges: graph.edges,
        })
        expect(
            result.issues.some((i) => i.message.includes('至少需要两个')),
        ).toBe(true)
    })
})
