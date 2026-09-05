/**
 * 抽象节点递归删除的集成测试：compose 输出批序断言 + applyBatches 完整执行。
 */

import type {
    EdgeId,
    GraphData,
    GraphId,
    GraphRegistry,
    NodeId,
} from '../../../src/types/graph_data'

import type { OperationBatch } from '../../../src/types/compose_types'

import { deleteAbstractNode } from '../../../src/compose/cognitive/delete_abstract_node'
import { applyBatches } from '../../../src/core/apply_batches'
import { createNode, createEdge, assembleGraph } from '../../test_case_factory'

const G0 = 'g0' as GraphId
const G1 = 'g1' as GraphId
const G2 = 'g2' as GraphId
const TEST_NOW = '2026-01-01T00:00:00.000Z'

/** 判别联合收窄辅助：断言为图内批后取 graph 字段。 */
function asInGraph(
    batch: OperationBatch,
): Extract<OperationBatch, { kind: 'inGraph' }> {
    return batch as Extract<OperationBatch, { kind: 'inGraph' }>
}

/**
 * 主场景注册表：G0=[A(abstract→G1), F(atomic)] 含边 A-F；
 * G1=[B(abstract→G2), D(atomic), E(atomic), 沟通节点(引用→G0)]；
 * G2=[C(atomic)]。
 */
function makeThreeLevelRegistry(): GraphRegistry {
    const g0 = assembleGraph({
        id: G0,
        title: '根图',
        nodes: [
            createNode({ id: 'A' as NodeId, graphId: G0, childGraphId: G1 }),
            createNode({ id: 'F' as NodeId, graphId: G0 }),
        ],
        edges: [
            createEdge({
                id: 'e-AF' as EdgeId,
                graphId: G0,
                source: 'A' as NodeId,
                target: 'F' as NodeId,
                kind: 'real',
                direction: 'undirected',
            }),
        ],
    })

    const g1 = assembleGraph({
        id: G1,
        kind: 'subgraph',
        title: 'A 的子图',
        parentGraphId: G0,
        ownerNodeId: 'A' as NodeId,
        nodes: [
            createNode({ id: 'B' as NodeId, graphId: G1, childGraphId: G2 }),
            createNode({ id: 'D' as NodeId, graphId: G1 }),
            createNode({ id: 'E' as NodeId, graphId: G1 }),
            createNode({
                id: 'comm' as NodeId,
                graphId: G1,
                role: 'reference',
                referenceKind: 'communication',
                sourceGraphId: G0,
                sourceNodeId: 'A' as NodeId,
            }),
        ],
        edges: [
            createEdge({
                id: 'e-BD' as EdgeId,
                graphId: G1,
                source: 'B' as NodeId,
                target: 'D' as NodeId,
                kind: 'real',
                direction: 'directed',
            }),
            createEdge({
                id: 'e-DE' as EdgeId,
                graphId: G1,
                source: 'D' as NodeId,
                target: 'E' as NodeId,
                kind: 'real',
                direction: 'directed',
            }),
            createEdge({
                id: 'e-commE' as EdgeId,
                graphId: G1,
                source: 'comm' as NodeId,
                target: 'E' as NodeId,
                kind: 'real',
                direction: 'directed',
            }),
        ],
    })

    const g2 = assembleGraph({
        id: G2,
        kind: 'subgraph',
        title: 'B 的子图',
        parentGraphId: G1,
        ownerNodeId: 'B' as NodeId,
        nodes: [createNode({ id: 'C' as NodeId, graphId: G2 })],
        edges: [],
    })

    return new Map<GraphId, GraphData>([
        [G0, g0],
        [G1, g1],
        [G2, g2],
    ])
}

describe('deleteAbstractNode', () => {
    test('三层嵌套 + 沟通节点 + 原子混层：批序与职责归属', () => {
        const registry = makeThreeLevelRegistry()
        const result = deleteAbstractNode({ nodeId: 'A' as NodeId, registry })

        expect(
            result.issues.filter((i) => i.severity === 'error'),
        ).toHaveLength(0)
        // 5 批：G2 清空 → G2 注销 → G1 清空 → G1 注销 → G0 清空
        expect(result.batches).toHaveLength(5)

        // 批 0：G2 清空批（最深子图）
        const clearG2 = result.batches[0]!
        expect(clearG2.kind).toBe('inGraph')
        expect(asInGraph(clearG2).graph.id).toBe(G2)
        expect(clearG2.operations).toEqual([
            { type: 'delete_node', nodeId: 'C' },
        ])

        // 批 1：G2 注销批——delete_graph 携带空图骨架（元数据保留，nodes/edges 空）
        const unregisterG2 = result.batches[1]!
        expect(unregisterG2.kind).toBe('graphLevel')
        const delG2 = unregisterG2.operations[0] as {
            type: 'delete_graph'
            graph: GraphData
        }
        expect(delG2.type).toBe('delete_graph')
        expect(delG2.graph.id).toBe(G2)
        expect(delG2.graph.kind).toBe('subgraph')
        expect(delG2.graph.parentGraphId).toBe(G1)
        expect(delG2.graph.ownerNodeId).toBe('B')
        expect(delG2.graph.nodes).toHaveLength(0)
        expect(delG2.graph.edges).toHaveLength(0)

        // 批 2：G1 清空批——抽象 + 原子 + 沟通节点同批（4 个 delete_node）
        const clearG1 = result.batches[2]!
        expect(clearG1.kind).toBe('inGraph')
        expect(asInGraph(clearG1).graph.id).toBe(G1)
        const deleteIds = clearG1.operations.map(
            (op) => (op as { type: 'delete_node'; nodeId: NodeId }).nodeId,
        )
        expect(deleteIds.sort()).toEqual(['B', 'D', 'E', 'comm'].sort())

        // 批 3：G1 注销批
        const unregisterG1 = result.batches[3]!
        expect(unregisterG1.kind).toBe('graphLevel')
        const delG1 = unregisterG1.operations[0] as {
            type: 'delete_graph'
            graph: { id: GraphId }
        }
        expect(delG1.type).toBe('delete_graph')
        expect(delG1.graph.id).toBe(G1)

        // 批 4：G0 清空批（顶层目标节点归父图）
        const clearG0 = result.batches[4]!
        expect(clearG0.kind).toBe('inGraph')
        expect(asInGraph(clearG0).graph.id).toBe(G0)
        expect(clearG0.operations).toEqual([
            { type: 'delete_node', nodeId: 'A' },
        ])
    })

    test('集成：applyBatches 完整执行后无死图残留', () => {
        const registry = makeThreeLevelRegistry()
        const result = deleteAbstractNode({ nodeId: 'A' as NodeId, registry })

        const applied = applyBatches(registry, result.batches, {
            executedAt: TEST_NOW,
        })
        expect(applied.validation.valid).toBe(true)

        // G1 / G2 已注销，注册表仅剩 G0
        expect(applied.registry.has(G1)).toBe(false)
        expect(applied.registry.has(G2)).toBe(false)
        expect(applied.registry.size).toBe(1)

        // G0：保留 F，无 A，A-F 边随 delete_node 级联删除
        const g0 = applied.registry.get(G0)!
        expect(g0.nodes.map((n) => n.id)).toEqual(['F'])
        expect(g0.edges).toHaveLength(0)
    })

    test('单层抽象：G1 清空 + G1 注销 + G0 清空', () => {
        const g0 = assembleGraph({
            id: G0,
            nodes: [
                createNode({
                    id: 'A' as NodeId,
                    graphId: G0,
                    childGraphId: G1,
                }),
            ],
            edges: [],
        })
        const g1 = assembleGraph({
            id: G1,
            kind: 'subgraph',
            parentGraphId: G0,
            ownerNodeId: 'A' as NodeId,
            nodes: [
                createNode({ id: 'D' as NodeId, graphId: G1 }),
                createNode({ id: 'E' as NodeId, graphId: G1 }),
            ],
            edges: [],
        })
        const registry = new Map<GraphId, GraphData>([
            [G0, g0],
            [G1, g1],
        ])

        const result = deleteAbstractNode({ nodeId: 'A' as NodeId, registry })

        expect(
            result.issues.filter((i) => i.severity === 'error'),
        ).toHaveLength(0)
        expect(result.batches).toHaveLength(3)

        // G1 清空批（D/E 同批）
        const clearG1 = result.batches[0]!
        expect(clearG1.kind).toBe('inGraph')
        expect(asInGraph(clearG1).graph.id).toBe(G1)
        const deleteIds = clearG1.operations.map(
            (op) => (op as { type: 'delete_node'; nodeId: NodeId }).nodeId,
        )
        expect(deleteIds.sort()).toEqual(['D', 'E'])

        // G1 注销批
        expect(result.batches[1]!.kind).toBe('graphLevel')

        // G0 清空批
        const clearG0 = result.batches[2]!
        expect(clearG0.kind).toBe('inGraph')
        expect(asInGraph(clearG0).graph.id).toBe(G0)
        expect(clearG0.operations).toEqual([
            { type: 'delete_node', nodeId: 'A' },
        ])
    })

    test('空子图：不发清空批，仅注销批 + 父图清空批', () => {
        const g0 = assembleGraph({
            id: G0,
            nodes: [
                createNode({
                    id: 'A' as NodeId,
                    graphId: G0,
                    childGraphId: G1,
                }),
            ],
            edges: [],
        })
        const g1 = assembleGraph({
            id: G1,
            kind: 'subgraph',
            parentGraphId: G0,
            ownerNodeId: 'A' as NodeId,
            nodes: [],
            edges: [],
        })
        const registry = new Map<GraphId, GraphData>([
            [G0, g0],
            [G1, g1],
        ])

        const result = deleteAbstractNode({ nodeId: 'A' as NodeId, registry })

        expect(
            result.issues.filter((i) => i.severity === 'error'),
        ).toHaveLength(0)
        // 无 G1 清空批：仅 G1 注销 + G0 清空
        expect(result.batches).toHaveLength(2)
        expect(result.batches[0]!.kind).toBe('graphLevel')
        expect(result.batches[1]!.kind).toBe('inGraph')

        // delete_graph 空图校验直接通过（空子图本来就空）
        const applied = applyBatches(registry, result.batches, {
            executedAt: TEST_NOW,
        })
        expect(applied.validation.valid).toBe(true)
        expect(applied.registry.has(G1)).toBe(false)
    })

    test('原子节点传入 → DELETE_ABSTRACT_TARGET_NOT_ABSTRACT', () => {
        const g0 = assembleGraph({
            id: G0,
            nodes: [
                createNode({ id: 'A' as NodeId, graphId: G0 }),
                createNode({ id: 'F' as NodeId, graphId: G0 }),
            ],
            edges: [],
        })
        const registry = new Map<GraphId, GraphData>([[G0, g0]])

        const result = deleteAbstractNode({ nodeId: 'A' as NodeId, registry })

        expect(result.batches).toHaveLength(0)
        expect(result.issues[0]?.severity).toBe('error')
        expect(result.issues[0]?.code).toBe(
            'DELETE_ABSTRACT_TARGET_NOT_ABSTRACT',
        )
    })

    test('引用节点传入 → DELETE_ABSTRACT_TARGET_NOT_ABSTRACT（不进本 compose）', () => {
        const g0 = assembleGraph({
            id: G0,
            nodes: [
                createNode({
                    id: 'ref' as NodeId,
                    graphId: G0,
                    role: 'reference',
                    referenceKind: 'communication',
                    sourceGraphId: 'peer' as GraphId,
                    sourceNodeId: 's' as NodeId,
                }),
            ],
            edges: [],
        })
        const registry = new Map<GraphId, GraphData>([[G0, g0]])

        const result = deleteAbstractNode({ nodeId: 'ref' as NodeId, registry })

        expect(result.batches).toHaveLength(0)
        expect(result.issues[0]?.code).toBe(
            'DELETE_ABSTRACT_TARGET_NOT_ABSTRACT',
        )
    })

    test('不存在的节点 → DELETE_ABSTRACT_TARGET_NOT_FOUND', () => {
        const g0 = assembleGraph({
            id: G0,
            nodes: [createNode({ id: 'F' as NodeId, graphId: G0 })],
            edges: [],
        })
        const registry = new Map<GraphId, GraphData>([[G0, g0]])

        const result = deleteAbstractNode({ nodeId: 'ZZZ' as NodeId, registry })

        expect(result.batches).toHaveLength(0)
        expect(result.issues[0]?.severity).toBe('error')
        expect(result.issues[0]?.code).toBe('DELETE_ABSTRACT_TARGET_NOT_FOUND')
    })
})
