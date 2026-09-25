/**
 * 注册表级（森林级）不变量测试：引用不得跨树 + 作用域 + 口径边界。
 *
 * 全程经 applyBatches 黑盒校验（规则本体未从 index 导出）：
 * 跨树 → 整批丢弃且注册表不变；同树 → 通过；不可解析 → 不判定。
 */

import type { GraphData, GraphId, GraphRegistry, NodeId } from '../../../src/types/graph_data'
import type { AtomicOperationInGraph } from '../../../src/types/atomic_operations'

import { applyBatches } from '../../../src/core/apply_batches'
import { createNode, assembleGraph } from '../../test_case_factory'

const TEST_NOW = '2026-01-01T00:00:00.000Z'

const CROSS_TREE = 'CROSS_TREE_REFERENCE_FORBIDDEN'

function makeRegistry(...graphs: GraphData[]): GraphRegistry {
    return new Map(graphs.map((g) => [g.id, g]))
}

function addNodeOp(id: string, graphId: GraphId): AtomicOperationInGraph {
    return { type: 'add_node', node: createNode({ id: id as NodeId, graphId }) }
}

/** rootA 的引用节点指向另一棵树的 rootB。 */
function makeCrossTreePair(): { rootA: GraphData; rootB: GraphData } {
    const rootA = assembleGraph({
        id: 'root-a' as GraphId,
        nodes: [
            createNode({ id: 'a1' as NodeId, graphId: 'root-a' as GraphId }),
            createNode({
                id: 'a-ref' as NodeId,
                graphId: 'root-a' as GraphId,
                role: 'reference',
                referenceKind: 'heuristic',
                sourceGraphId: 'root-b' as GraphId,
                sourceNodeId: 'b1' as NodeId,
            }),
        ],
        edges: [],
    })

    const rootB = assembleGraph({
        id: 'root-b' as GraphId,
        nodes: [createNode({ id: 'b1' as NodeId, graphId: 'root-b' as GraphId })],
        edges: [],
    })

    return { rootA, rootB }
}

// ═══════════ 跨树引用被拒（两条路径） ═══════════

describe('森林级不变量：跨树引用整批丢弃', () => {
    test('跨树 sourceGraphId：校验失败、注册表与入参同一引用、逆元清空', () => {
        const { rootA, rootB } = makeCrossTreePair()
        const registry = makeRegistry(rootA, rootB)

        const result = applyBatches(
            registry,
            [{ kind: 'inGraph', graph: rootA, operations: [addNodeOp('a2', rootA.id)] }],
            {
                executedAt: TEST_NOW,
            },
        )

        expect(result.validation.valid).toBe(false)
        expect(result.registry).toBe(registry) // 整批丢弃：与入参同一引用
        expect(result.reversalBatches).toHaveLength(0)

        const issue = result.validation.issues.find((i) => i.code === CROSS_TREE)
        // issue 指明肇事对象：源图 id / 肇事节点 id / 目标图 id
        expect(issue).toMatchObject({ severity: 'error', targetType: 'graph', targetId: 'root-a' })
        expect(issue!.message).toContain('a-ref')
        expect(issue!.message).toContain('root-b')
    })

    test('跨树 childGraphId：校验失败、注册表不变', () => {
        const rootA = assembleGraph({
            id: 'root-a' as GraphId,
            nodes: [
                createNode({ id: 'abs-a' as NodeId, graphId: 'root-a' as GraphId, childGraphId: 'root-b' as GraphId }),
            ],
            edges: [],
        })
        const rootB = assembleGraph({
            id: 'root-b' as GraphId,
            nodes: [createNode({ id: 'b1' as NodeId, graphId: 'root-b' as GraphId })],
            edges: [],
        })
        const registry = makeRegistry(rootA, rootB)

        const result = applyBatches(
            registry,
            [{ kind: 'inGraph', graph: rootA, operations: [addNodeOp('a2', rootA.id)] }],
            {
                executedAt: TEST_NOW,
            },
        )

        expect(result.validation.valid).toBe(false)
        expect(result.registry).toBe(registry)
        const issue = result.validation.issues.find((i) => i.code === CROSS_TREE)
        expect(issue).toMatchObject({ targetId: 'root-a' })
        expect(issue!.message).toContain('abs-a')
        expect(issue!.message).toContain('root-b')
    })

    test('graphLevel 批作用域：add_graph 引入的图被后续图内批写入跨树引用 → 被拒', () => {
        const rootB = assembleGraph({
            id: 'root-b' as GraphId,
            nodes: [createNode({ id: 'b1' as NodeId, graphId: 'root-b' as GraphId })],
            edges: [],
        })
        const otherRoot = assembleGraph({
            id: 'other-root' as GraphId,
            nodes: [createNode({ id: 'o1' as NodeId, graphId: 'other-root' as GraphId })],
            edges: [],
        })

        // 新建子图挂在 rootB 树下（add_graph 只收空图）
        const emptyChild = assembleGraph({
            id: 'new-child' as GraphId,
            kind: 'subgraph',
            parentGraphId: rootB.id,
            nodes: [],
            edges: [],
        })

        const registry = makeRegistry(rootB, otherRoot)

        // 图内批向新子图写入引用另一棵树 other-root 的节点
        const result = applyBatches(
            registry,
            [
                { kind: 'graphLevel', operations: [{ type: 'add_graph', graph: emptyChild }] },
                {
                    kind: 'inGraph',
                    graph: emptyChild,
                    operations: [
                        {
                            type: 'add_node',
                            node: createNode({
                                id: 'nc-ref' as NodeId,
                                graphId: 'new-child' as GraphId,
                                role: 'reference',
                                referenceKind: 'heuristic',
                                sourceGraphId: 'other-root' as GraphId,
                                sourceNodeId: 'o1' as NodeId,
                            }),
                        },
                    ],
                },
            ],
            { executedAt: TEST_NOW },
        )

        expect(result.validation.valid).toBe(false)
        expect(result.registry).toBe(registry)
        const issue = result.validation.issues.find((i) => i.code === CROSS_TREE)
        expect(issue).toMatchObject({ targetId: 'new-child' })
        expect(issue!.message).toContain('nc-ref')
        expect(issue!.message).toContain('other-root')
    })
})

// ═══════════ 同树跨子图引用放行 ═══════════

describe('森林级不变量：同树不误报', () => {
    test('同一根下两个子图互相引用：通过', () => {
        const root = assembleGraph({ id: 'tree-root' as GraphId, nodes: [], edges: [] })

        const sub1 = assembleGraph({
            id: 'sub-1' as GraphId,
            kind: 'subgraph',
            parentGraphId: root.id,
            nodes: [
                createNode({ id: 's1-know' as NodeId, graphId: 'sub-1' as GraphId }),
                // sourceGraphId 路径：引用兄弟子图 sub-2 的节点
                createNode({
                    id: 's1-ref' as NodeId,
                    graphId: 'sub-1' as GraphId,
                    role: 'reference',
                    referenceKind: 'heuristic',
                    sourceGraphId: 'sub-2' as GraphId,
                    sourceNodeId: 's2-know' as NodeId,
                }),
                // childGraphId 路径：抽象节点指向自己的子图 sub-2
                createNode({ id: 's1-abs' as NodeId, graphId: 'sub-1' as GraphId, childGraphId: 'sub-2' as GraphId }),
            ],
            edges: [],
        })

        const sub2 = assembleGraph({
            id: 'sub-2' as GraphId,
            kind: 'subgraph',
            parentGraphId: 'sub-1' as GraphId,
            nodes: [createNode({ id: 's2-know' as NodeId, graphId: 'sub-2' as GraphId })],
            edges: [],
        })

        const registry = makeRegistry(root, sub1, sub2)

        const result = applyBatches(
            registry,
            [{ kind: 'inGraph', graph: sub1, operations: [addNodeOp('s1-new', sub1.id)] }],
            {
                executedAt: TEST_NOW,
            },
        )

        expect(result.validation.valid).toBe(true)
        expect(result.validation.issues.some((i) => i.code === CROSS_TREE)).toBe(false)
    })
})

// ═══════════ 作用域：未触碰的坏图不影响 ═══════════

describe('森林级不变量：作用域 = 本批涉及的图', () => {
    test('registry 中预先存在的跨树坏图未被本批触碰：照常通过', () => {
        const { rootA, rootB } = makeCrossTreePair()
        const good = assembleGraph({
            id: 'good-root' as GraphId,
            nodes: [createNode({ id: 'g1' as NodeId, graphId: 'good-root' as GraphId })],
            edges: [],
        })
        const registry = makeRegistry(rootA, rootB, good)

        const result = applyBatches(
            registry,
            [{ kind: 'inGraph', graph: good, operations: [addNodeOp('g2', good.id)] }],
            {
                executedAt: TEST_NOW,
            },
        )

        expect(result.validation.valid).toBe(true)
    })
})

// ═══════════ 恒跑：不受 skipValidate 影响 ═══════════

describe('森林级不变量：恒跑', () => {
    test('skipValidate: true 时跨树引用仍被拒', () => {
        const { rootA, rootB } = makeCrossTreePair()
        const registry = makeRegistry(rootA, rootB)

        const result = applyBatches(
            registry,
            [{ kind: 'inGraph', graph: rootA, operations: [addNodeOp('a2', rootA.id)] }],
            {
                executedAt: TEST_NOW,
                skipValidate: true,
            },
        )

        expect(result.validation.valid).toBe(false)
        expect(result.validation.issues.some((i) => i.code === CROSS_TREE)).toBe(true)
    })
})

// ═══════════ 口径边界：不可解析不判定 ═══════════

describe('森林级不变量：链 / 目标不可解析不误报', () => {
    test('祖先图不在 registry：不判定', () => {
        const orphan = assembleGraph({
            id: 'orphan' as GraphId,
            kind: 'subgraph',
            parentGraphId: 'ghost-parent' as GraphId, // 祖先缺失 → 根不可解析
            nodes: [
                createNode({
                    id: 'o-ref' as NodeId,
                    graphId: 'orphan' as GraphId,
                    role: 'reference',
                    referenceKind: 'heuristic',
                    sourceGraphId: 'other-root' as GraphId,
                    sourceNodeId: 'x' as NodeId,
                }),
            ],
            edges: [],
        })
        const otherRoot = assembleGraph({
            id: 'other-root' as GraphId,
            nodes: [createNode({ id: 'x' as NodeId, graphId: 'other-root' as GraphId })],
            edges: [],
        })
        const registry = makeRegistry(orphan, otherRoot)

        const result = applyBatches(
            registry,
            [{ kind: 'inGraph', graph: orphan, operations: [addNodeOp('o2', orphan.id)] }],
            {
                executedAt: TEST_NOW,
            },
        )

        expect(result.validation.valid).toBe(true)
        expect(result.validation.issues.some((i) => i.code === CROSS_TREE)).toBe(false)
    })

    test('引用目标图不在 registry：不判定', () => {
        const rootA = assembleGraph({
            id: 'root-a' as GraphId,
            nodes: [
                createNode({
                    id: 'a-ref' as NodeId,
                    graphId: 'root-a' as GraphId,
                    role: 'reference',
                    referenceKind: 'heuristic',
                    sourceGraphId: 'missing-root' as GraphId, // 目标不在 registry
                    sourceNodeId: 'm1' as NodeId,
                }),
            ],
            edges: [],
        })
        const registry = makeRegistry(rootA)

        const result = applyBatches(
            registry,
            [{ kind: 'inGraph', graph: rootA, operations: [addNodeOp('a2', rootA.id)] }],
            {
                executedAt: TEST_NOW,
            },
        )

        expect(result.validation.valid).toBe(true)
        expect(result.validation.issues.some((i) => i.code === CROSS_TREE)).toBe(false)
    })
})
