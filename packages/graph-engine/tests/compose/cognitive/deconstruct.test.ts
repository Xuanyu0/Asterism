/**
 * deconstruct.test.ts
 *
 * 解构操作测试。
 */

import type { GraphId, NodeId } from '../../../src/types/graph_data'
import { deconstruct } from '../../../src/compose/cognitive/deconstruct'
import {
    createDeconstructInputGraph,
    createNode,
    assembleGraph,
} from '../../test_case_factory'

describe('deconstruct', () => {
    test('正常解构（含邻居）', () => {
        const graph = createDeconstructInputGraph()
        const result = deconstruct({
            nodeId: 'decon-A' as NodeId,
            parentGraph: graph,
        })
        expect(
            result.issues.filter((i) => i.severity === 'error'),
        ).toHaveLength(0)
        // 3 批：graphLevel add_graph（空图）+ inGraph 子图填充 + inGraph 父图 update_node
        expect(result.batches).toHaveLength(3)
        expect(result.batches[0]!.kind).toBe('graphLevel')
        expect(result.batches[2]!.kind).toBe('inGraph')

        // update_node 写入 childGraphId（form 由 deriveNodeForm 派生为 abstract）
        const parentBatch = result.batches[2]!
        expect(parentBatch.kind).toBe('inGraph')
        const updateOp = parentBatch.operations[0] as {
            type: 'update_node'
            node: { childGraphId: string }
        }
        expect(updateOp.type).toBe('update_node')
        expect(updateOp.node.childGraphId).toBeTruthy()

        // add_graph 携带空图（nodes/edges 为空）
        const graphLevelBatch = result.batches[0]!
        expect(graphLevelBatch.kind).toBe('graphLevel')
        const addGraphOp = graphLevelBatch.operations[0] as {
            type: 'add_graph'
            graph: { nodes: unknown[]; edges: unknown[] }
        }
        expect(addGraphOp.type).toBe('add_graph')
        expect(addGraphOp.graph.nodes).toHaveLength(0)
        expect(addGraphOp.graph.edges).toHaveLength(0)

        // 沟通节点经 add_node 填充子图（B/C/D 三个邻居）
        const childBatch = result.batches[1]!
        expect(childBatch.kind).toBe('inGraph')
        const addNodeOps = childBatch.operations.filter(
            (op) => op.type === 'add_node',
        )
        expect(addNodeOps).toHaveLength(3)
    })

    test('虚节点拒绝', () => {
        const graph = assembleGraph({
            id: 'test-virt' as GraphId,
            nodes: [
                createNode({
                    id: 'v' as NodeId,
                    graphId: 'test-virt' as GraphId,
                    kind: 'virtual',
                }),
            ],
            edges: [],
        })
        const result = deconstruct({
            nodeId: 'v' as NodeId,
            parentGraph: graph,
        })
        expect(result.issues.some((i) => i.message.includes('虚节点'))).toBe(
            true,
        )
        expect(result.batches).toHaveLength(0)
    })

    test('抽象节点拒绝（重复解构）', () => {
        const graph = assembleGraph({
            id: 'test-abs' as GraphId,
            nodes: [
                createNode({
                    id: 'a' as NodeId,
                    graphId: 'test-abs' as GraphId,
                    childGraphId: 'sub-abs' as GraphId,
                }),
            ],
            edges: [],
        })
        const result = deconstruct({
            nodeId: 'a' as NodeId,
            parentGraph: graph,
        })
        expect(result.issues.some((i) => i.message.includes('抽象'))).toBe(true)
    })

    test('非 knowledge 拒绝', () => {
        const graph = assembleGraph({
            id: 'test-ref' as GraphId,
            nodes: [
                createNode({
                    id: 'r' as NodeId,
                    graphId: 'test-ref' as GraphId,
                    role: 'reference',
                    referenceKind: 'communication',
                    sourceGraphId: 'g' as GraphId,
                    sourceNodeId: 's' as NodeId,
                }),
            ],
            edges: [],
        })
        const result = deconstruct({
            nodeId: 'r' as NodeId,
            parentGraph: graph,
        })
        expect(result.issues.some((i) => i.message.includes('知识节点'))).toBe(
            true,
        )
    })

    test('无邻居节点', () => {
        const graph = assembleGraph({
            id: 'test-solo' as GraphId,
            nodes: [
                createNode({
                    id: 'solo' as NodeId,
                    graphId: 'test-solo' as GraphId,
                }),
            ],
            edges: [],
        })
        const result = deconstruct({
            nodeId: 'solo' as NodeId,
            parentGraph: graph,
        })
        expect(
            result.issues.filter((i) => i.severity === 'error'),
        ).toHaveLength(0)
        // 子图无沟通节点：add_graph 空图 + 子图填充批无 add_node
        const childBatch = result.batches[1]!
        expect(childBatch.kind).toBe('inGraph')
        expect(
            childBatch.operations.filter((op) => op.type === 'add_node'),
        ).toHaveLength(0)
    })
})
