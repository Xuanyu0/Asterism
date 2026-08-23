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
            lookupGraph: () => undefined,
            nodeRadiusOverrides: R,
            allEdges: graph.edges,
        })
        expect(
            result.issues.filter((i) => i.severity === 'error'),
        ).toHaveLength(0)
        // 3 批：graphLevel add_graph（空图）+ inGraph 子图填充 + inGraph 父图
        expect(result.batches).toHaveLength(3)
        expect(result.batches[0]!.kind).toBe('graphLevel')
        expect(result.batches[1]!.kind).toBe('inGraph')
        expect(result.batches[2]!.kind).toBe('inGraph')

        // add_graph 独立成 graphLevel 批且携带空图
        const graphLevelBatch = result.batches[0]!
        const addGraphOp = graphLevelBatch.operations[0] as {
            type: 'add_graph'
            graph: { nodes: unknown[]; edges: unknown[] }
        }
        expect(addGraphOp.type).toBe('add_graph')
        expect(addGraphOp.graph.nodes).toHaveLength(0)
        expect(addGraphOp.graph.edges).toHaveLength(0)

        // 子图填充批含 add_node
        const childBatch = result.batches[1]!
        expect(childBatch.operations.some((op) => op.type === 'add_node')).toBe(
            true,
        )
        // 父图批含 add_node（抽象节点）
        const parentBatch = result.batches[2]!
        expect(
            parentBatch.operations.some((op) => op.type === 'add_node'),
        ).toBe(true)
    })

    test('含启发节点参与', () => {
        const graph = createInduceWithHeuristicInputGraph()
        const result = induce({
            nodeIds: ['ih-A', 'ih-H'] as NodeId[],
            parentGraph: graph,
            lookupGraph: () => undefined,
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
            lookupGraph: () => undefined,
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
            lookupGraph: () => undefined,
            nodeRadiusOverrides: R,
            allEdges: graph.edges,
        })
        expect(
            result.issues.some((i) => i.message.includes('至少需要两个')),
        ).toBe(true)
    })
})
