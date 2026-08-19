/**
 * pipeline.test.ts
 *
 * applyBatch 事务语义测试。
 */

import type { GraphData, GraphId, NodeId } from '../../src/types/graph_data'
import type { GraphOperation } from '../../src/types/atomic_operations'
import { applyBatch } from '../../src/compose/pipeline'
import { createNode, createEdge, assembleGraph } from '../test_case_factory'

const G = 'test-pl' as GraphId

function makeBase(): GraphData {
    return assembleGraph({
        id: G,
        nodes: [
            createNode({ id: 'n0' as NodeId, graphId: G }),
            createNode({ id: 'n1' as NodeId, graphId: G }),
        ],
        edges: [],
    })
}

describe('applyBatch', () => {
    test('全通过时全部执行', () => {
        const graph = makeBase()
        const ops = [
            {
                type: 'add_edge' as const,
                edge: createEdge({
                    id: 'e0' as NodeId,
                    graphId: G,
                    source: 'n0' as NodeId,
                    target: 'n1' as NodeId,
                    kind: 'real',
                    direction: 'directed',
                }),
            },
        ]
        const result = applyBatch(graph, ops)
        expect(result.validation.valid).toBe(true)
        expect(result.graph.edges.length).toBe(1)
    })

    test('任一失败则整批丢弃', () => {
        const graph = makeBase()
        const ops = [
            {
                type: 'add_edge' as const,
                edge: createEdge({
                    id: 'e0' as NodeId,
                    graphId: G,
                    source: 'n0' as NodeId,
                    target: 'n1' as NodeId,
                    kind: 'real',
                    direction: 'directed',
                }),
            },
            {
                type: 'add_edge' as const,
                edge: createEdge({
                    id: 'e1' as NodeId,
                    graphId: G,
                    source: 'n-x' as NodeId,
                    target: 'n1' as NodeId,
                    kind: 'real',
                    direction: 'directed',
                }),
            }, // 失败
        ]
        const result = applyBatch(graph, ops)
        expect(result.validation.valid).toBe(false)
        expect(result.graph.edges.length).toBe(0) // 全丢
    })

    test('dryRun 模式：校验但不执行', () => {
        const graph = makeBase()
        const ops = [
            {
                type: 'add_edge' as const,
                edge: createEdge({
                    id: 'e0' as NodeId,
                    graphId: G,
                    source: 'n0' as NodeId,
                    target: 'n1' as NodeId,
                    kind: 'real',
                    direction: 'directed',
                }),
            },
        ]
        const result = applyBatch(graph, ops, { dryRun: true })
        expect(result.validation.valid).toBe(true)
        expect(result.graph.edges.length).toBe(0) // 没执行
    })

    test('stopOnFirst：遇第一个失败即停', () => {
        const graph = makeBase()
        const ops = [
            {
                type: 'add_edge' as const,
                edge: createEdge({
                    id: 'e-bad' as NodeId,
                    graphId: G,
                    source: 'n-x' as NodeId,
                    target: 'n0' as NodeId,
                    kind: 'real',
                    direction: 'directed',
                }),
            },
            {
                type: 'add_node' as const,
                node: createNode({ id: 'n2' as NodeId, graphId: G }),
            }, // 第二个操作：stopOnFirst 让第一个失败后停，此操作不被校验
        ]
        const result = applyBatch(graph, ops, { stopOnFirst: true })
        expect(result.validation.valid).toBe(false)
        expect(result.results.length).toBe(1) // 第一个失败后停
    })

    test('add_graph 校验通过并返回原图不变', () => {
        const graph = makeBase()
        const child = assembleGraph({
            id: 'child-pl' as GraphId,
            nodes: [],
            edges: [],
            kind: 'subgraph',
        })
        const ops = [{ type: 'add_graph' as const, graph: child }]
        const result = applyBatch(graph, ops)
        expect(result.validation.valid).toBe(true)
        // 当前图不变——add_graph 只声明子图的存在，registry 写操作由 Runtime 处理
        expect(result.graph).toBe(graph)
    })

    test('全局规则在 Phase 3 生效：自环被拦截', () => {
        const graph = makeBase()
        const ops = [
            {
                type: 'add_edge' as const,
                edge: createEdge({
                    id: 'e-self' as NodeId,
                    graphId: G,
                    source: 'n0' as NodeId,
                    target: 'n0' as NodeId,
                    kind: 'real',
                    direction: 'directed',
                }),
            },
        ]
        const result = applyBatch(graph, ops)
        expect(result.validation.valid).toBe(false)
        expect(
            result.validation.issues.some(
                (i) => i.code === 'SELF_LOOP_FORBIDDEN',
            ),
        ).toBe(true)
        expect(result.graph.edges.length).toBe(0)
    })

    test('全局规则在 Phase 3 生效：重边被拦截', () => {
        const graph = makeBase()
        const ops = [
            {
                type: 'add_edge' as const,
                edge: createEdge({
                    id: 'e0' as NodeId,
                    graphId: G,
                    source: 'n0' as NodeId,
                    target: 'n1' as NodeId,
                    kind: 'real',
                    direction: 'directed',
                }),
            },
            {
                type: 'add_edge' as const,
                edge: createEdge({
                    id: 'e-dup' as NodeId,
                    graphId: G,
                    source: 'n0' as NodeId,
                    target: 'n1' as NodeId,
                    kind: 'real',
                    direction: 'directed',
                }),
            },
        ]
        const result = applyBatch(graph, ops)
        expect(result.validation.valid).toBe(false)
        expect(
            result.validation.issues.some(
                (i) => i.code === 'DUPLICATE_EDGE_FORBIDDEN',
            ),
        ).toBe(true)
        expect(result.graph.edges.length).toBe(0)
    })

    test('globalRulesTable 可关闭指定规则', () => {
        const graph = makeBase()
        const ops = [
            {
                type: 'add_edge' as const,
                edge: createEdge({
                    id: 'e-self' as NodeId,
                    graphId: G,
                    source: 'n0' as NodeId,
                    target: 'n0' as NodeId,
                    kind: 'real',
                    direction: 'directed',
                }),
            },
        ]
        const result = applyBatch(graph, ops, {
            globalRulesTable: {
                SELF_LOOP_FORBIDDEN: false,
                REAL_DIRECTED_CYCLE_FORBIDDEN: false,
            },
        })
        expect(result.validation.valid).toBe(true)
        expect(result.graph.edges.length).toBe(1)
    })

    // ═══════════ onBeforeEachOperation 回调 ═══════════

    test('onBeforeEachOperation：传回调时每个原子操作触发一次', () => {
        const graph = makeBase()
        const ops = [
            {
                type: 'add_node' as const,
                node: createNode({ id: 'n2' as NodeId, graphId: G }),
            },
            {
                type: 'add_node' as const,
                node: createNode({ id: 'n3' as NodeId, graphId: G }),
            },
        ]
        const callback = vi.fn()

        const result = applyBatch(graph, ops, {
            onBeforeEachOperation: callback,
        })

        expect(callback).toHaveBeenCalledTimes(ops.length) // 2 个原子操作 → 2 次
        expect(result.validation.valid).toBe(true)
    })

    test('onBeforeEachOperation：graphBeforeOp 为逐操作执行前的中间态', () => {
        const graph = makeBase() // n0, n1
        const ops = [
            {
                type: 'add_node' as const,
                node: createNode({ id: 'n2' as NodeId, graphId: G }),
            },
            {
                type: 'add_node' as const,
                node: createNode({ id: 'n3' as NodeId, graphId: G }),
            },
        ]
        const seenOps: GraphOperation[] = []
        const snapshots: string[][] = []

        applyBatch(graph, ops, {
            onBeforeEachOperation: (op, graphBeforeOp) => {
                seenOps.push(op)
                snapshots.push(graphBeforeOp.nodes.map((n) => n.id))
            },
        })

        // 回调入参 op 与入队顺序一致
        expect(seenOps).toEqual(ops)
        // 第 k 次回调的图 = 前 k-1 个操作执行后的状态
        expect(snapshots).toEqual([
            ['n0', 'n1'], // 第 1 次：基图（无操作执行）
            ['n0', 'n1', 'n2'], // 第 2 次：n2 已入图，n3 尚未执行
        ])
    })

    test('onBeforeEachOperation：未传时零行为变化（不触发）', () => {
        const graph = makeBase()
        const ops = [
            {
                type: 'add_node' as const,
                node: createNode({ id: 'n2' as NodeId, graphId: G }),
            },
            {
                type: 'add_node' as const,
                node: createNode({ id: 'n3' as NodeId, graphId: G }),
            },
        ]

        // 未传回调无可观测的"调用"；可观测契约 = 零行为变化。
        // 显式传入 undefined 走 options?.onBeforeEachOperation?.() 短路分支。
        const baseline = applyBatch(graph, ops)
        const explicitUndefined = applyBatch(graph, ops, {
            onBeforeEachOperation: undefined,
        })

        expect(explicitUndefined.graph).toEqual(baseline.graph)
        expect(explicitUndefined.validation).toEqual(baseline.validation)
        expect(explicitUndefined.results).toEqual(baseline.results)
    })

    test('onBeforeEachOperation：dryRun 模式同样触发', () => {
        const graph = makeBase()
        const ops = [
            {
                type: 'add_node' as const,
                node: createNode({ id: 'n2' as NodeId, graphId: G }),
            },
            {
                type: 'add_node' as const,
                node: createNode({ id: 'n3' as NodeId, graphId: G }),
            },
        ]
        const callback = vi.fn()

        const result = applyBatch(graph, ops, {
            dryRun: true,
            onBeforeEachOperation: callback,
        })

        // Phase 2 dry-run 循环在 dryRun 下同样执行 → 回调触发
        expect(callback).toHaveBeenCalledTimes(2)
        // dryRun：结果图原样返回（未真正执行）
        expect(result.graph).toBe(graph)
        expect(result.graph.nodes).toHaveLength(2)
    })
})
