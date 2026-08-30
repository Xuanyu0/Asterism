/**
 * induce.test.ts
 *
 * 归纳操作测试。
 */

import type {
    GraphId,
    GraphRegistry,
    NodeId,
} from '../../../src/types/graph_data'
import { induce } from '../../../src/compose/cognitive/induce'
import { applyBatches } from '../../../src/core/apply_batches'
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
        // 6 批：graphLevel add_graph（空图）+ 子图 add_node / add_edge + 父图 delete_node / add_node / add_edge
        expect(result.batches).toHaveLength(6)
        expect(result.batches[0]!.kind).toBe('graphLevel')
        expect(result.batches[1]!.kind).toBe('inGraph')
        expect(result.batches[2]!.kind).toBe('inGraph')
        expect(result.batches[3]!.kind).toBe('inGraph')
        expect(result.batches[4]!.kind).toBe('inGraph')
        expect(result.batches[5]!.kind).toBe('inGraph')

        // add_graph 独立成 graphLevel 批且携带空图
        const graphLevelBatch = result.batches[0]!
        const addGraphOp = graphLevelBatch.operations[0] as {
            type: 'add_graph'
            graph: { nodes: unknown[]; edges: unknown[] }
        }
        expect(addGraphOp.type).toBe('add_graph')
        expect(addGraphOp.graph.nodes).toHaveLength(0)
        expect(addGraphOp.graph.edges).toHaveLength(0)

        // 批1/批2 为子图批：先 add_node 后 add_edge
        const childNodeBatch = result.batches[1]!
        const childEdgeBatch = result.batches[2]!
        expect(
            childNodeBatch.operations.every((op) => op.type === 'add_node'),
        ).toBe(true)
        expect(
            childEdgeBatch.operations.every((op) => op.type === 'add_edge'),
        ).toBe(true)

        // 批3/批4/批5 为父图批：delete_node → add_node（抽象）→ add_edge
        const parentDeleteBatch = result.batches[3]!
        const parentAddNodeBatch = result.batches[4]!
        const parentAddEdgeBatch = result.batches[5]!
        expect(
            parentDeleteBatch.operations.every(
                (op) => op.type === 'delete_node',
            ),
        ).toBe(true)
        expect(
            parentAddNodeBatch.operations.every((op) => op.type === 'add_node'),
        ).toBe(true)
        expect(
            parentAddEdgeBatch.operations.every((op) => op.type === 'add_edge'),
        ).toBe(true)
    })

    test('集成：compose → applyBatches 完整执行（A-1 回归防护）', () => {
        const graph = createInduceInputGraph()
        const registry: GraphRegistry = new Map([[graph.id, graph]])
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

        const applied = applyBatches(registry, result.batches)
        expect(applied.validation.valid).toBe(true)

        // 父图：被选节点已删除，未选邻居保留
        const parent = applied.registry.get(graph.id)!
        expect(parent.nodes.some((n) => n.id === 'ind-A')).toBe(false)
        expect(parent.nodes.some((n) => n.id === 'ind-B')).toBe(false)
        expect(parent.nodes.some((n) => n.id === 'ind-C')).toBe(false)
        expect(parent.nodes.some((n) => n.id === 'ind-X')).toBe(true)
        expect(parent.nodes.some((n) => n.id === 'ind-Y')).toBe(true)

        // 抽象节点：knowledge + childGraphId 指向子图，label 已截断 ≤ 8
        const abstractNode = parent.nodes.find(
            (n) => n.childGraphId !== undefined,
        )
        expect(abstractNode).toBeDefined()
        expect(abstractNode!.role).toBe('knowledge')
        expect(abstractNode!.label.length).toBeLessThanOrEqual(8)

        // 抽象节点连接两个未选邻居
        expect(
            parent.edges.filter(
                (e) =>
                    e.source === abstractNode!.id ||
                    e.target === abstractNode!.id,
            ),
        ).toHaveLength(2)

        // 子图：3 被选节点 + 2 沟通节点 + 7 条边（3 内部 + 4 外部投影）
        const child = applied.registry.get(abstractNode!.childGraphId!)!
        expect(child.nodes).toHaveLength(5)
        expect(
            child.nodes.filter(
                (n) =>
                    n.role === 'reference' &&
                    n.referenceKind === 'communication',
            ),
        ).toHaveLength(2)
        expect(child.edges).toHaveLength(7)
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
