/**
 * pipeline.test.ts
 *
 * applyBatch 事务语义测试。
 */

import type { GraphData, GraphId, NodeId } from '../../src/types/graph_data'
import type { GraphOperation } from '../../src/types/atomic_operations'
import { applyBatch } from '../../src/core/apply_batch'
import { createNode, createEdge, assembleGraph } from '../test_case_factory'

const G = 'test-pl' as GraphId
const TEST_NOW = '2026-01-01T00:00:00.000Z'

function makeBase(): GraphData {
    return assembleGraph({
        id: G,
        nodes: [createNode({ id: 'n0' as NodeId, graphId: G }), createNode({ id: 'n1' as NodeId, graphId: G })],
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
        const result = applyBatch(graph, ops, { executedAt: TEST_NOW })
        expect(result.validation.valid).toBe(true)
        expect(result.graph.edges.length).toBe(1)
    })

    test('任一失败则整批丢弃（悬空边端点由 Phase 3 拦截）', () => {
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
            }, // 悬空端点：Phase 1 不再拦（端点检查迁 Phase 3），dry-run 后由悬空边规则拦截
        ]
        const result = applyBatch(graph, ops, { executedAt: TEST_NOW })
        expect(result.validation.valid).toBe(false)
        // Phase 3 悬空边规则拦截：EDGE_SOURCE_NOT_FOUND 由 invariants/structural 检出
        expect(result.validation.issues.some((i) => i.code === 'EDGE_SOURCE_NOT_FOUND')).toBe(true)
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
        const result = applyBatch(graph, ops, {
            executedAt: TEST_NOW,
            dryRun: true,
        })
        expect(result.validation.valid).toBe(true)
        expect(result.graph.edges.length).toBe(0) // 没执行
    })

    test('stopOnFirst：遇第一个失败即停', () => {
        const graph = makeBase()
        const ops = [
            {
                type: 'add_node' as const,
                node: createNode({ id: 'n0' as NodeId, graphId: G }),
            }, // 第一个操作：id 重复（Phase 1 NODE_ID_DUPLICATED）失败后停
            {
                type: 'add_node' as const,
                node: createNode({ id: 'n2' as NodeId, graphId: G }),
            }, // 第二个操作：stopOnFirst 让第一个失败后停，此操作不被校验
        ]
        const result = applyBatch(graph, ops, {
            executedAt: TEST_NOW,
            stopOnFirst: true,
        })
        expect(result.validation.valid).toBe(false)
        expect(result.results.length).toBe(1) // 第一个失败后停
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
        const result = applyBatch(graph, ops, { executedAt: TEST_NOW })
        expect(result.validation.valid).toBe(false)
        expect(result.validation.issues.some((i) => i.code === 'SELF_LOOP_FORBIDDEN')).toBe(true)
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
        const result = applyBatch(graph, ops, { executedAt: TEST_NOW })
        expect(result.validation.valid).toBe(false)
        expect(result.validation.issues.some((i) => i.code === 'DUPLICATE_EDGE_FORBIDDEN')).toBe(true)
        expect(result.graph.edges.length).toBe(0)
    })

    test('preferenceRulesTable 可关闭偏好规则（标签过长放行）', () => {
        const graph = makeBase()
        const ops = [
            {
                type: 'add_node' as const,
                node: createNode({
                    id: 'n-long' as NodeId,
                    graphId: G,
                    label: 'x'.repeat(21), // 超过 NODE_LABEL_MAX_LENGTH(20)
                }),
            },
        ]

        // 默认：偏好规则 NODE_LABEL_TOO_LONG 拦截
        const blocked = applyBatch(graph, ops, { executedAt: TEST_NOW })
        expect(blocked.validation.valid).toBe(false)
        expect(blocked.validation.issues.some((i) => i.code === 'NODE_LABEL_TOO_LONG')).toBe(true)
        expect(blocked.graph.nodes.length).toBe(2)

        // 关闭偏好规则 → 放行
        const result = applyBatch(graph, ops, {
            executedAt: TEST_NOW,
            preferenceRulesTable: {
                NODE_LABEL_TOO_LONG: false,
            },
        })
        expect(result.validation.valid).toBe(true)
        expect(result.graph.nodes.length).toBe(3)
    })

    test('preferenceRulesTable 关闭硬性规则不生效（自环仍被拦截）', () => {
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
            executedAt: TEST_NOW,
            preferenceRulesTable: {
                SELF_LOOP_FORBIDDEN: false,
                REAL_DIRECTED_CYCLE_FORBIDDEN: false,
            },
        })
        expect(result.validation.valid).toBe(false)
        expect(result.validation.issues.some((i) => i.code === 'SELF_LOOP_FORBIDDEN')).toBe(true)
        expect(result.graph.edges.length).toBe(0)
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
            executedAt: TEST_NOW,
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
            executedAt: TEST_NOW,
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
        const baseline = applyBatch(graph, ops, { executedAt: TEST_NOW })
        const explicitUndefined = applyBatch(graph, ops, {
            executedAt: TEST_NOW,
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
            executedAt: TEST_NOW,
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
