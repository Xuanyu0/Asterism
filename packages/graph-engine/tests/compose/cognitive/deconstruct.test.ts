/**
 * deconstruct.test.ts
 *
 * 解构操作测试。
 */

import type { GraphId, NodeId } from '../../../src/types/graph_data'
import { deconstruct } from '../../../src/compose/cognitive/deconstruct'
import { createDeconstructInputGraph, createNode, assembleGraph } from '../../test_case_factory'

describe('deconstruct', () => {
    test('正常解构（含邻居）', () => {
        const graph = createDeconstructInputGraph()
        const result = deconstruct({ nodeId: 'decon-A' as NodeId, parentGraph: graph })
        expect(result.issues.filter(i => i.severity === 'error')).toHaveLength(0)
        expect(result.operations).toHaveLength(2) // update_node + add_graph
        expect(result.operations[0]!.type).toBe('update_node')
        // update_node 的 node.form 应改为 abstract
        const updateOp = result.operations[0] as { type: 'update_node'; node: { form: string; childGraphId: string } }
        expect(updateOp.node.form).toBe('abstract')
        expect(updateOp.node.childGraphId).toBeTruthy()
        // add_graph 的 subgraph 含 3 个沟通节点（B/C/D）
        const addGraphOp = result.operations[1] as { type: 'add_graph'; graph: { nodes: unknown[] } }
        expect(addGraphOp.graph.nodes).toHaveLength(3)
    })

    test('虚节点拒绝', () => {
        const graph = assembleGraph({ id: 'test-virt' as GraphId, nodes: [
            createNode({ id: 'v' as NodeId, graphId: 'test-virt' as GraphId, kind: 'virtual' }),
        ], edges: [] })
        const result = deconstruct({ nodeId: 'v' as NodeId, parentGraph: graph })
        expect(result.issues.some(i => i.message.includes('虚节点'))).toBe(true)
        expect(result.operations).toHaveLength(0)
    })

    test('抽象节点拒绝（重复解构）', () => {
        const graph = assembleGraph({ id: 'test-abs' as GraphId, nodes: [
            createNode({ id: 'a' as NodeId, graphId: 'test-abs' as GraphId, form: 'abstract' }),
        ], edges: [] })
        const result = deconstruct({ nodeId: 'a' as NodeId, parentGraph: graph })
        expect(result.issues.some(i => i.message.includes('抽象'))).toBe(true)
    })

    test('非 knowledge 拒绝', () => {
        const graph = assembleGraph({ id: 'test-ref' as GraphId, nodes: [
            createNode({ id: 'r' as NodeId, graphId: 'test-ref' as GraphId, role: 'reference', referenceKind: 'communication', sourceGraphId: 'g' as GraphId, sourceNodeId: 's' as NodeId }),
        ], edges: [] })
        const result = deconstruct({ nodeId: 'r' as NodeId, parentGraph: graph })
        expect(result.issues.some(i => i.message.includes('知识节点'))).toBe(true)
    })

    test('无邻居节点', () => {
        const graph = assembleGraph({ id: 'test-solo' as GraphId, nodes: [
            createNode({ id: 'solo' as NodeId, graphId: 'test-solo' as GraphId }),
        ], edges: [] })
        const result = deconstruct({ nodeId: 'solo' as NodeId, parentGraph: graph })
        expect(result.issues.filter(i => i.severity === 'error')).toHaveLength(0)
        // 子图无沟通节点
        const addGraphOp = result.operations[1] as { type: 'add_graph'; graph: { nodes: unknown[] } }
        expect(addGraphOp.graph.nodes).toHaveLength(0)
    })
})
