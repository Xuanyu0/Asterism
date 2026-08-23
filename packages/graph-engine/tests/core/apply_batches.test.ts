/**
 * apply_batches.test.ts
 *
 * 测试 applyBatches 多图批处理（批次判别联合分派：inGraph 委托 applyBatch + graphLevel 路由兑现 + 路由逆元构造）。
 */

import { applyBatches } from '../../src/core/apply_batches'
import type {
    GraphData,
    GraphId,
    GraphRegistry,
    NodeId,
} from '../../src/types/graph_data'
import type { OperationBatch } from '../../src/types/compose_types'
import type {
    AtomicGraphOperation,
    AtomicOperationInGraph,
} from '../../src/types/atomic_operations'
import { createNode, assembleGraph } from '../test_case_factory'

const G = 'parent' as GraphId
const CHILD = 'child' as GraphId

function makeParentGraph(): GraphData {
    return assembleGraph({
        id: G,
        nodes: [
            createNode({ id: 'n0' as NodeId, graphId: G }),
            createNode({ id: 'n1' as NodeId, graphId: G }),
        ],
        edges: [],
    })
}

function makeEmptyChildGraph(): GraphData {
    return assembleGraph({
        id: CHILD,
        kind: 'subgraph',
        nodes: [],
        edges: [],
    })
}

function makeRegistry(...graphs: GraphData[]): GraphRegistry {
    return new Map(graphs.map((g) => [g.id, g]))
}

function addNodeOp(id: string, graphId: GraphId): AtomicOperationInGraph {
    return {
        type: 'add_node',
        node: createNode({ id: id as NodeId, graphId }),
    }
}

// ═══════════ 批次判别分派：inGraph 委托 applyBatch ═══════════

describe('applyBatches 图内批（inGraph 委托）', () => {
    test('图内批委托 applyBatch 执行', () => {
        const parent = makeParentGraph()
        const registry = makeRegistry(parent)

        const result = applyBatches(registry, [
            {
                kind: 'inGraph',
                graph: parent,
                operations: [addNodeOp('n2', G)],
            },
        ])

        expect(result.validation.valid).toBe(true)
        const newParent = result.registry.get(G)!
        expect(newParent.nodes).toHaveLength(3)
        expect(newParent).not.toBe(parent) // 变化图是新引用
    })

    test('图内批操作不存在的图：校验失败整批丢弃（显式错误）', () => {
        const parent = makeParentGraph()
        const registry = makeRegistry() // 空注册表，无任何图

        const result = applyBatches(registry, [
            {
                kind: 'inGraph',
                graph: parent, // parent 不在注册表
                operations: [addNodeOp('n2', G)],
            },
        ])

        expect(result.validation.valid).toBe(false)
        expect(result.registry).toBe(registry) // 原样返回，不隐式创建
        expect(result.validation.issues[0]?.code).toBe('BATCH_GRAPH_NOT_FOUND')
    })

    test('inGraph 批混入图级操作：批级契约校验失败整批丢弃', () => {
        const parent = makeParentGraph()
        const child = makeEmptyChildGraph()
        const registry = makeRegistry(parent)

        const result = applyBatches(registry, [
            {
                kind: 'inGraph',
                graph: parent,
                // 混入 add_graph（图级操作）——类型层面 as 断言绕过，运行时须捕获
                operations: [
                    addNodeOp('n2', G),
                    {
                        type: 'add_graph',
                        graph: child,
                    } as unknown as AtomicOperationInGraph,
                ],
            },
        ])

        expect(result.validation.valid).toBe(false)
        expect(result.registry).toBe(registry) // 原样返回
        expect(result.validation.issues[0]?.code).toBe('BATCH_KIND_MISMATCH')
    })

    test('图内逆元经 createReversal 构造', () => {
        const parent = makeParentGraph()
        const registry = makeRegistry(parent)

        const result = applyBatches(registry, [
            {
                kind: 'inGraph',
                graph: parent,
                operations: [addNodeOp('n2', G)],
            },
        ])

        const reversal = result.reversalOperations.flatMap((r) => r.operations)
        expect(reversal).toEqual([{ type: 'delete_node', nodeId: 'n2' }])
    })

    test('同一图跨批修改，后续基于前一批结果', () => {
        const parent = makeParentGraph()
        const registry = makeRegistry(parent)

        const result = applyBatches(registry, [
            {
                kind: 'inGraph',
                graph: parent,
                operations: [addNodeOp('n2', G)],
            },
            {
                kind: 'inGraph',
                graph: parent,
                operations: [addNodeOp('n3', G)],
            },
        ])

        expect(result.validation.valid).toBe(true)
        expect(result.registry.get(G)!.nodes).toHaveLength(4)
    })
})

// ═══════════ 批次判别分派：graphLevel 路由兑现 ═══════════

describe('applyBatches 图级批（graphLevel 路由兑现）', () => {
    test('路由函数：add_graph 空图 + 批内图内操作填充', () => {
        const parent = makeParentGraph()
        const registry = makeRegistry(parent)
        const emptyChild = makeEmptyChildGraph()

        const batches: OperationBatch[] = [
            // add_graph 批在子图填充批之前
            {
                kind: 'graphLevel',
                operations: [{ type: 'add_graph', graph: emptyChild }],
            },
            {
                kind: 'inGraph',
                graph: emptyChild,
                operations: [addNodeOp('c0', CHILD), addNodeOp('c1', CHILD)],
            },
        ]

        const result = applyBatches(registry, batches)

        expect(result.validation.valid).toBe(true)
        const child = result.registry.get(CHILD)!
        expect(child.nodes).toHaveLength(2) // 后续图内批覆盖 add_graph 注册的空图（顺序由操作构造方保证）
        expect(result.graphSignals.added).toEqual([CHILD])
    })

    test('路由函数：add_graph 用操作自带图注册（未被批内构造）', () => {
        const parent = makeParentGraph()
        const registry = makeRegistry(parent)
        const child = assembleGraph({
            id: CHILD,
            kind: 'subgraph',
            parentGraphId: G,
            nodes: [],
            edges: [],
        })

        const result = applyBatches(registry, [
            {
                kind: 'graphLevel',
                operations: [{ type: 'add_graph', graph: child }],
            },
        ])

        expect(result.validation.valid).toBe(true)
        expect(result.registry.get(CHILD)).toBe(child) // 直接用操作自带图引用
    })

    test('路由函数：delete_graph 注销', () => {
        const parent = makeParentGraph()
        const child = makeEmptyChildGraph()
        const registry = makeRegistry(parent, child)

        const result = applyBatches(registry, [
            {
                kind: 'graphLevel',
                operations: [{ type: 'delete_graph', graph: child }],
            },
        ])

        expect(result.validation.valid).toBe(true)
        expect(result.registry.has(CHILD)).toBe(false)
        expect(result.graphSignals.deleted).toEqual([CHILD])
    })

    test('delete_graph 非空目标图：图级校验失败整批丢弃', () => {
        const parent = makeParentGraph() // parent 有节点（非空）
        const registry = makeRegistry(parent)

        const result = applyBatches(registry, [
            {
                kind: 'graphLevel',
                operations: [{ type: 'delete_graph', graph: parent }],
            },
        ])

        expect(result.validation.valid).toBe(false)
        expect(result.registry).toBe(registry) // 原样返回，注册表不变
        expect(result.registry.has(G)).toBe(true)
    })

    test('graphLevel 批混入图内操作：批级契约校验失败整批丢弃', () => {
        const parent = makeParentGraph()
        const child = makeEmptyChildGraph()
        const registry = makeRegistry(parent)

        const result = applyBatches(registry, [
            {
                kind: 'graphLevel',
                // 混入 add_node（图内操作）——类型层面 as 断言绕过，运行时须捕获
                operations: [
                    { type: 'add_graph', graph: child },
                    addNodeOp('n2', G) as unknown as AtomicGraphOperation,
                ],
            },
        ])

        expect(result.validation.valid).toBe(false)
        expect(result.registry).toBe(registry) // 原样返回
        expect(result.validation.issues[0]?.code).toBe('BATCH_KIND_MISMATCH')
    })
})

// ═══════════ 路由逆元构造函数：add ↔ delete 互逆 ═══════════

describe('applyBatches 图级逆元（路由逆元构造函数）', () => {
    test('add_graph 逆元 = delete_graph', () => {
        const parent = makeParentGraph()
        const registry = makeRegistry(parent)
        const child = makeEmptyChildGraph()

        const result = applyBatches(registry, [
            {
                kind: 'graphLevel',
                operations: [{ type: 'add_graph', graph: child }],
            },
        ])

        const reversal = result.reversalOperations.flatMap((r) => r.operations)
        expect(reversal).toEqual([{ type: 'delete_graph', graph: child }])
    })

    test('delete_graph 逆元 = add_graph（携带被删空图骨架）', () => {
        const parent = makeParentGraph()
        const child = makeEmptyChildGraph()
        const registry = makeRegistry(parent, child)

        const result = applyBatches(registry, [
            {
                kind: 'graphLevel',
                operations: [{ type: 'delete_graph', graph: child }],
            },
        ])

        const reversal = result.reversalOperations.flatMap((r) => r.operations)
        expect(reversal).toHaveLength(1)
        expect(reversal[0]).toMatchObject({ type: 'add_graph' })

        const addGraphOp = reversal[0] as {
            type: 'add_graph'
            graph: GraphData
        }
        expect(addGraphOp.graph.id).toBe(CHILD)
        expect(addGraphOp.graph.nodes).toEqual(child.nodes) // 携带被删空图骨架
    })
})

// ═══════════ 事务性与纯函数 ═══════════

describe('applyBatches 事务性与纯函数', () => {
    test('事务失败整批丢弃，注册表不变', () => {
        const parent = makeParentGraph()
        const registry = makeRegistry(parent)

        // n0 已存在 → add_node 校验失败
        const result = applyBatches(registry, [
            {
                kind: 'inGraph',
                graph: parent,
                operations: [addNodeOp('n0', G)],
            },
        ])

        expect(result.validation.valid).toBe(false)
        expect(result.registry).toBe(registry) // 原样返回
        expect(result.registry.get(G)).toBe(parent)
    })

    test('纯函数：不修改入参注册表，复用未变化图引用', () => {
        const parent = makeParentGraph()
        const child = makeEmptyChildGraph()
        const registry = makeRegistry(parent, child)

        const result = applyBatches(registry, [
            {
                kind: 'inGraph',
                graph: parent,
                operations: [addNodeOp('n2', G)],
            },
        ])

        // 入参注册表不变
        expect(registry.get(G)).toBe(parent)
        expect(registry.get(CHILD)).toBe(child)
        // 未变化图复用引用
        expect(result.registry.get(CHILD)).toBe(child)
        // 变化图是新引用
        expect(result.registry.get(G)).not.toBe(parent)
    })
})
