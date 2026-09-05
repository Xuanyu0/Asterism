/**
 * undo_redo.test.ts
 *
 * 功能：
 *     前端回溯链路（store.commitBatchToGraphs → operationLog → undo / redo）的
 *     Runtime 集成测试（010.2）。覆盖双存接线、undo 链、redo 链、图级操作
 *     （add_graph / delete_graph）、视图一致性与边界。不重复引擎侧
 *     reversal / pipeline 单测（引擎已有 coverage）。
 *
 * 规则：
 *     1. 图数据经 test_case_factory.assembleGraph 构造（含 schema 校验 + 认知状态补全），
 *        以 OperationBatch[]（判别联合）直传 commitBatchToGraphs；图内批目标图须先注册
 *        （applyBatches 校验 BATCH_GRAPH_NOT_FOUND），测试经 registerGraph 预置。
 *     2. 多操作批遵守引擎 pipeline 语义：Phase 1 逐操作校验基于输入图（validate-all-first），
 *        后置操作不得依赖前置操作新创建的对象（如 add_edge 端点必须是输入图中已存在的节点）。
 *     3. 图级操作（add_graph / delete_graph）独立成 graphLevel 批；add_graph 只建空图、
 *        delete_graph 只删空图（引擎 06.1 语义），内容经图内批填充。
 * 3. 每用例独立环境：resetGraphStoreForTests() + localStorage.clear() + vi.restoreAllMocks()。
 * 4. 010.1 缺陷 #1（删除带关联边节点的撤销失败）与缺陷 #2（多级 undo 链 DataCloneError）
 *    已由 010.1 回流修复（D1 操作级逆序 + skipValidate、D2 状态去 proxy 化），原「已知缺陷暴露」
 *    describe 的两条测试现为回归保护，不再预期失败。
 */

import { useGraphStore, resetGraphStoreForTests } from '@/graph/graph_store'
import { lookupGraph, registerGraph } from '@/graph/graph_registry'
import { loadGraph, saveGraph } from '@/graph/graph_persistence'
import { assembleGraph, createNode, createEdge } from '@/dev/test_case_factory'

import type {
    EdgeData,
    EdgeId,
    GraphData,
    GraphId,
    GraphKind,
    KnowledgeNodeData,
    NodeData,
    NodeId,
} from '@my-project/graph-engine'

import { deleteAbstractNode } from '@my-project/graph-engine'

const ROOT = 'graph-root' as GraphId

// ── 测试图构造辅助 ──

function makeGraph(
    id: GraphId,
    nodes: NodeData[] = [],
    edges: EdgeData[] = [],
    opts?: { kind?: GraphKind; parentGraphId?: GraphId; ownerNodeId?: NodeId },
): GraphData {
    return assembleGraph({
        id,
        kind: opts?.kind ?? 'root',
        title: `${id} 测试图`,
        nodes,
        edges,
        parentGraphId: opts?.parentGraphId,
        ownerNodeId: opts?.ownerNodeId,
    })
}

function knowledgeNode(
    id: NodeId,
    label: string,
    x: number,
    y: number,
): NodeData {
    return createNode({ id, graphId: ROOT, label, position: { x, y } })
}

// 预置注册：applyBatches 要求图内批目标图已在注册表中（BATCH_GRAPH_NOT_FOUND 校验）
function registerGraphs(
    store: ReturnType<typeof useGraphStore>,
    ...graphs: GraphData[]
): void {
    for (const graph of graphs) {
        registerGraph(store.graphRegistry, graph)
    }
}

describe('双存接线（commitBatchToGraphs → CommitLog）', () => {
    beforeEach(() => {
        resetGraphStoreForTests()
        localStorage.clear()
        vi.restoreAllMocks()
    })

    afterAll(() => {
        localStorage.clear()
        vi.restoreAllMocks()
    })

    test('单图多操作提交 → 组装一条 entry（batch 正向 / reversalBatch item 内逆序 / parentIndex -1）', () => {
        const store = useGraphStore()
        const graph = makeGraph(ROOT, [
            knowledgeNode('node-a', '节点A', 0, 0),
            knowledgeNode('node-x', '节点X', 200, 0),
        ])
        registerGraphs(store, graph)
        const nodeB = knowledgeNode('node-b', '节点B', 5000, 5000)
        const ops = [
            { type: 'add_node' as const, node: nodeB },
            {
                type: 'add_edge' as const,
                edge: createEdge({
                    id: 'edge-ax' as EdgeId,
                    graphId: ROOT,
                    source: 'node-a' as NodeId,
                    target: 'node-x' as NodeId,
                    kind: 'real' as const,
                    direction: 'directed' as const,
                }),
            },
            {
                type: 'move_node' as const,
                nodeId: 'node-a' as NodeId,
                position: { x: 9000, y: 9000 },
            },
        ]

        const { validation } = store.commitBatchToGraphs([
            { kind: 'inGraph', graph, operations: ops },
        ])

        expect(validation.valid).toBe(true)
        expect(store.operationLog.entries).toHaveLength(1)
        expect(store.operationLog.cursor).toBe(0)

        const entry = store.operationLog.entries[0]!
        expect(entry.parentIndex).toBe(-1)

        // operation：按图分组、正向顺序
        expect(entry.batches).toEqual([
            {
                graphId: ROOT,
                operations: [
                    { type: 'add_node', node: nodeB },
                    {
                        type: 'add_edge',
                        edge: expect.objectContaining({
                            id: 'edge-ax',
                            source: 'node-a',
                            target: 'node-x',
                        }),
                    },
                    {
                        type: 'move_node',
                        nodeId: 'node-a',
                        position: { x: 9000, y: 9000 },
                    },
                ],
            },
        ])

        // reversalBatch：item 内逆序（后执行先撤销）
        expect(entry.reversalBatches).toEqual([
            {
                graphId: ROOT,
                operations: [
                    {
                        type: 'move_node',
                        nodeId: 'node-a',
                        position: { x: 0, y: 0 },
                    },
                    { type: 'delete_edge', edgeId: 'edge-ax' },
                    { type: 'delete_node', nodeId: 'node-b' },
                ],
            },
        ])
    })

    test('混合多图批 → reversalBatch item 间逆序（后提交的图先撤销）', () => {
        const store = useGraphStore()
        const graphA = makeGraph('graph-a', [knowledgeNode('a-1', 'A1', 0, 0)])
        const graphB = makeGraph('graph-b', [knowledgeNode('b-1', 'B1', 0, 0)])
        registerGraphs(store, graphA, graphB)

        store.commitBatchToGraphs([
            {
                kind: 'inGraph',
                graph: graphA,
                operations: [
                    {
                        type: 'add_node',
                        node: knowledgeNode('a-2', 'A2', 5000, 5000),
                    },
                ],
            },
            {
                kind: 'inGraph',
                graph: graphB,
                operations: [
                    {
                        type: 'add_node',
                        node: knowledgeNode('b-2', 'B2', 5000, 5000),
                    },
                ],
            },
        ])

        const entry = store.operationLog.entries[0]!
        // operation：正向 item 顺序
        expect(entry.batches.map((item) => item.graphId)).toEqual([
            'graph-a',
            'graph-b',
        ])
        // reversalBatch：item 间逆序
        expect(entry.reversalBatches.map((item) => item.graphId)).toEqual([
            'graph-b',
            'graph-a',
        ])
        expect(entry.reversalBatches[0]!.operations).toEqual([
            { type: 'delete_node', nodeId: 'b-2' },
        ])
        expect(entry.reversalBatches[1]!.operations).toEqual([
            { type: 'delete_node', nodeId: 'a-2' },
        ])
    })

    test('图级逆元全量入 reversalBatch：add_graph ↔ delete_graph 互逆；parentIndex 首条 -1、第二条 0', () => {
        const store = useGraphStore()
        const sub = makeGraph('graph-sub', [], [], {
            kind: 'subgraph',
            parentGraphId: ROOT,
            ownerNodeId: 'node-owner' as NodeId,
        })

        store.commitBatchToGraphs([
            {
                kind: 'graphLevel',
                operations: [{ type: 'add_graph', graph: sub }],
            },
        ])
        store.commitBatchToGraphs([
            {
                kind: 'graphLevel',
                operations: [{ type: 'delete_graph', graph: sub }],
            },
        ])

        expect(store.operationLog.entries[0]!.parentIndex).toBe(-1)
        expect(store.operationLog.entries[1]!.parentIndex).toBe(0)
        // 图级逆元不再过滤：add_graph 逆元 = delete_graph、delete_graph 逆元 = add_graph
        expect(store.operationLog.entries[0]!.reversalBatches).toEqual([
            {
                graphId: 'graph-sub',
                operations: [{ type: 'delete_graph', graph: sub }],
            },
        ])
        expect(store.operationLog.entries[1]!.reversalBatches).toEqual([
            {
                graphId: 'graph-sub',
                operations: [{ type: 'add_graph', graph: sub }],
            },
        ])
    })

    test('entry.timestamp 与 executedAt 同一值（批级唯一时间，undo/redo 回读用）', () => {
        const store = useGraphStore()
        const graph = makeGraph(ROOT, [knowledgeNode('node-a', '节点A', 0, 0)])
        registerGraphs(store, graph)
        const EXEC = '2026-03-03T03:03:03.000Z'

        store.commitBatchToGraphs(
            [
                {
                    kind: 'inGraph',
                    graph,
                    operations: [
                        {
                            type: 'add_node',
                            node: knowledgeNode('node-b', '节点B', 5000, 5000),
                        },
                    ],
                },
            ],
            { executedAt: EXEC },
        )

        expect(store.operationLog.entries[0]!.timestamp).toBe(EXEC)
    })

    test('recordLog: false 提交 → 不追加 entry、cursor 不变（图修改仍生效）', () => {
        const store = useGraphStore()
        const graph = makeGraph(ROOT, [knowledgeNode('node-a', '节点A', 0, 0)])
        registerGraphs(store, graph)

        store.commitBatchToGraphs(
            [
                {
                    kind: 'inGraph',
                    graph,
                    operations: [
                        {
                            type: 'add_node',
                            node: knowledgeNode('node-b', '节点B', 5000, 5000),
                        },
                    ],
                },
            ],
            { recordLog: false },
        )

        expect(store.operationLog.entries).toHaveLength(0)
        expect(store.operationLog.cursor).toBe(-1)
        expect(store.redoStack).toEqual([])
        // 图修改本身仍提交到 registry（recordLog 只影响日志，不影响执行）
        expect(lookupGraph(store.graphRegistry, ROOT)!.nodes).toHaveLength(2)
    })
})

describe('undo 链', () => {
    beforeEach(() => {
        resetGraphStoreForTests()
        localStorage.clear()
        vi.restoreAllMocks()
    })

    afterAll(() => {
        localStorage.clear()
        vi.restoreAllMocks()
    })

    /**
     * 010.1 缺陷 #2（多级 undo 链 DataCloneError）已修复（operationLog 降级为 raw 普通字段，消除 proxy 泄漏），
     * 本测试为回归保护：add → update(+summary) → delete 链逐级 undo 精确恢复。
     * 修复前：第三级 undo 抛 DataCloneError（逆元 structuredClone 命中 reactive proxy
     * 烘焙的 position），链无法走完——"新增消失"无法验证。
     */
    test('add_node → update_node(+summary) → delete_node 逐级 undo 精确恢复（节点/属性）', () => {
        const store = useGraphStore()
        const graph = makeGraph(ROOT, [
            createNode({
                id: 'node-a' as NodeId,
                graphId: ROOT,
                label: '节点A',
                position: { x: 0, y: 0 },
            }),
        ])
        registerGraphs(store, graph)

        // 每条一次提交（单操作批）。update_node 的 node 用普通对象构造——
        // 不复用注册表中的图节点引用（避免后续断言被同一对象引用污染）
        store.commitBatchToGraphs([
            {
                kind: 'inGraph',
                graph,
                operations: [
                    {
                        type: 'add_node',
                        node: knowledgeNode('node-b', '节点B', 5000, 5000),
                    },
                ],
            },
        ])
        store.commitBatchToGraphs([
            {
                kind: 'inGraph',
                graph: store.graphRegistry.get(ROOT)!,
                operations: [
                    {
                        type: 'update_node',
                        node: createNode({
                            id: 'node-b' as NodeId,
                            graphId: ROOT,
                            label: '节点B',
                            position: { x: 5000, y: 5000 },
                            summary: '补充摘要',
                        }),
                    },
                ],
            },
        ])
        store.commitBatchToGraphs([
            {
                kind: 'inGraph',
                graph: store.graphRegistry.get(ROOT)!,
                operations: [
                    { type: 'delete_node', nodeId: 'node-b' as NodeId },
                ],
            },
        ])

        expect(store.operationLog.entries).toHaveLength(3)
        expect(store.operationLog.cursor).toBe(2)

        // ── undo 1（delete_node）：删除的节点带回 summary ──
        expect(store.undo()).toBe(true)
        let current = store.graphRegistry.get(ROOT)!
        expect(
            (
                current.nodes.find((n) => n.id === 'node-b') as
                    | KnowledgeNodeData
                    | undefined
            )?.summary,
        ).toBe('补充摘要')
        expect(store.operationLog.cursor).toBe(1)
        expect(store.redoStack).toEqual([2])

        // ── undo 2（update_node）：更新回退旧值（summary 消失）──
        expect(store.undo()).toBe(true)
        current = store.graphRegistry.get(ROOT)!
        expect(
            (
                current.nodes.find((n) => n.id === 'node-b') as
                    | KnowledgeNodeData
                    | undefined
            )?.summary,
        ).toBeUndefined()
        expect(store.operationLog.cursor).toBe(0)
        expect(store.redoStack).toEqual([2, 1])

        // ── undo 3（add_node）：新增消失 —— 当前实现在此抛 DataCloneError（缺陷 #2）──
        expect(store.undo()).toBe(true)
        current = store.graphRegistry.get(ROOT)!
        expect(current.nodes.map((n) => n.id)).toEqual(['node-a'])
        expect(store.operationLog.cursor).toBe(-1)
        expect(store.redoStack).toEqual([2, 1, 0])
    })

    test('undo 撤销 add_edge：边消失（边的逆元 delete_edge）', () => {
        const store = useGraphStore()
        const graph = makeGraph(ROOT, [
            knowledgeNode('node-a', '节点A', 0, 0),
            knowledgeNode('node-b', '节点B', 5000, 5000),
        ])
        registerGraphs(store, graph)

        store.commitBatchToGraphs([
            {
                kind: 'inGraph',
                graph,
                operations: [
                    {
                        type: 'add_edge',
                        edge: createEdge({
                            id: 'edge-ab' as EdgeId,
                            graphId: ROOT,
                            source: 'node-a' as NodeId,
                            target: 'node-b' as NodeId,
                            kind: 'real' as const,
                            direction: 'directed' as const,
                        }),
                    },
                ],
            },
        ])
        expect(store.graphRegistry.get(ROOT)!.edges).toHaveLength(1)

        expect(store.undo()).toBe(true)
        expect(store.graphRegistry.get(ROOT)!.edges).toHaveLength(0)
        expect(store.operationLog.cursor).toBe(-1)
        expect(store.redoStack).toEqual([0])
    })

    test('折叠链：collapse_dependency → expand_dependency 后 undo，折叠状态恢复（含 foldedNodeIds 成员）', () => {
        const store = useGraphStore()
        const graph = makeGraph(
            ROOT,
            [
                knowledgeNode('node-t', '目标', 0, 0),
                knowledgeNode('node-d', '依赖', 200, 0),
            ],
            [
                createEdge({
                    id: 'edge-td' as EdgeId,
                    graphId: ROOT,
                    source: 'node-d' as NodeId,
                    target: 'node-t' as NodeId,
                    kind: 'real' as const,
                    direction: 'directed' as const,
                }),
            ],
        )
        registerGraphs(store, graph)

        store.commitBatchToGraphs([
            {
                kind: 'inGraph',
                graph,
                operations: [
                    {
                        type: 'collapse_dependency',
                        targetNodeId: 'node-t' as NodeId,
                    },
                ],
            },
        ])
        store.commitBatchToGraphs([
            {
                kind: 'inGraph',
                graph: store.graphRegistry.get(ROOT)!,
                operations: [
                    {
                        type: 'expand_dependency',
                        targetNodeId: 'node-t' as NodeId,
                    },
                ],
            },
        ])

        // 展开后折叠状态为空
        expect(
            store.graphRegistry.get(ROOT)!.cognitiveState.foldedDependencies,
        ).toEqual([])

        // undo expand → 折叠条目恢复（expand 的逆元 collapse 携带原折叠成员名单）
        expect(store.undo()).toBe(true)
        expect(
            store.graphRegistry.get(ROOT)!.cognitiveState.foldedDependencies,
        ).toEqual([{ targetNodeId: 'node-t', foldedNodeIds: ['node-d'] }])

        // 继续 undo collapse → 完全展开
        expect(store.undo()).toBe(true)
        expect(
            store.graphRegistry.get(ROOT)!.cognitiveState.foldedDependencies,
        ).toEqual([])
    })

    test('undo 后执行新操作 → 旧 entry 保留（分支）+ redoStack 清空', () => {
        const store = useGraphStore()
        const graph = makeGraph(ROOT, [knowledgeNode('node-a', '节点A', 0, 0)])
        registerGraphs(store, graph)

        store.commitBatchToGraphs([
            {
                kind: 'inGraph',
                graph,
                operations: [
                    {
                        type: 'add_node',
                        node: knowledgeNode('node-b', '节点B', 5000, 5000),
                    },
                ],
            },
        ])
        store.commitBatchToGraphs([
            {
                kind: 'inGraph',
                graph: store.graphRegistry.get(ROOT)!,
                operations: [
                    {
                        type: 'add_node',
                        node: knowledgeNode('node-c', '节点C', 6000, 5000),
                    },
                ],
            },
        ])

        // undo → cursor 回到 entry 0（B 的父索引），redoStack 记录 entry 1
        expect(store.undo()).toBe(true)
        expect(store.operationLog.cursor).toBe(0)
        expect(store.redoStack).toEqual([1])

        // 新操作 → 分支：新 entry 挂在 cursor 0 下，旧分支保留，redoStack 清空
        store.commitBatchToGraphs([
            {
                kind: 'inGraph',
                graph: store.graphRegistry.get(ROOT)!,
                operations: [
                    {
                        type: 'add_node',
                        node: knowledgeNode('node-d', '节点D', 7000, 5000),
                    },
                ],
            },
        ])

        expect(store.operationLog.entries).toHaveLength(3)
        expect(store.operationLog.cursor).toBe(2)
        expect(store.operationLog.entries[2]!.parentIndex).toBe(0) // 分支挂在被撤销点
        expect(store.redoStack).toEqual([])
        // 旧分支 entry（add node-c）仍保留在日志中
        expect(store.operationLog.entries[1]!.batches[0]!.operations[0]).toEqual({
            type: 'add_node',
            node: expect.objectContaining({ id: 'node-c' }),
        })
        // 图数据 = 基线 + B + D（C 被撤销、D 新加）
        expect(store.graphRegistry.get(ROOT)!.nodes.map((n) => n.id)).toEqual([
            'node-a',
            'node-b',
            'node-d',
        ])
    })
})

describe('redo 链', () => {
    beforeEach(() => {
        resetGraphStoreForTests()
        localStorage.clear()
        vi.restoreAllMocks()
    })

    afterAll(() => {
        localStorage.clear()
        vi.restoreAllMocks()
    })

    test('undo 后 redo 重走原路径（图数据恢复、cursor 前进到原 entry）', () => {
        const store = useGraphStore()
        const graph = makeGraph(ROOT, [knowledgeNode('node-a', '节点A', 0, 0)])
        registerGraphs(store, graph)

        store.commitBatchToGraphs([
            {
                kind: 'inGraph',
                graph,
                operations: [
                    {
                        type: 'add_node',
                        node: knowledgeNode('node-b', '节点B', 5000, 5000),
                    },
                ],
            },
        ])
        store.commitBatchToGraphs([
            {
                kind: 'inGraph',
                graph: store.graphRegistry.get(ROOT)!,
                operations: [
                    {
                        type: 'add_node',
                        node: knowledgeNode('node-c', '节点C', 6000, 5000),
                    },
                ],
            },
        ])

        expect(store.undo()).toBe(true)
        expect(store.graphRegistry.get(ROOT)!.nodes.map((n) => n.id)).toEqual([
            'node-a',
            'node-b',
        ])

        expect(store.redo()).toBe(true)
        expect(store.graphRegistry.get(ROOT)!.nodes.map((n) => n.id)).toEqual([
            'node-a',
            'node-b',
            'node-c',
        ])
        expect(store.operationLog.cursor).toBe(1)
        expect(store.redoStack).toEqual([])
    })

    test('redoStack 空时 redo() → false 且不写任何状态', () => {
        const store = useGraphStore()
        const graph = makeGraph(ROOT, [knowledgeNode('node-a', '节点A', 0, 0)])
        registerGraphs(store, graph)

        // 从未 undo：redoStack 为空
        expect(store.redo()).toBe(false)
        expect(store.operationLog.cursor).toBe(-1)
        expect(store.operationLog.entries).toHaveLength(0)
        expect(store.redoStack).toEqual([])

        store.commitBatchToGraphs([
            {
                kind: 'inGraph',
                graph,
                operations: [
                    {
                        type: 'add_node',
                        node: knowledgeNode('node-b', '节点B', 5000, 5000),
                    },
                ],
            },
        ])

        // 提交后仍未 undo：redo 依旧 false
        expect(store.redo()).toBe(false)
        expect(store.operationLog.cursor).toBe(0)
        expect(store.redoStack).toEqual([])
    })

    test('undo → 新操作 → redo 失效（redoStack 已清）', () => {
        const store = useGraphStore()
        const graph = makeGraph(ROOT, [knowledgeNode('node-a', '节点A', 0, 0)])
        registerGraphs(store, graph)

        store.commitBatchToGraphs([
            {
                kind: 'inGraph',
                graph,
                operations: [
                    {
                        type: 'add_node',
                        node: knowledgeNode('node-b', '节点B', 5000, 5000),
                    },
                ],
            },
        ])
        store.commitBatchToGraphs([
            {
                kind: 'inGraph',
                graph: store.graphRegistry.get(ROOT)!,
                operations: [
                    {
                        type: 'add_node',
                        node: knowledgeNode('node-c', '节点C', 6000, 5000),
                    },
                ],
            },
        ])

        expect(store.undo()).toBe(true)
        expect(store.redoStack).toEqual([1])

        // 新操作清空 redoStack → redo 失效
        store.commitBatchToGraphs([
            {
                kind: 'inGraph',
                graph: store.graphRegistry.get(ROOT)!,
                operations: [
                    {
                        type: 'add_node',
                        node: knowledgeNode('node-d', '节点D', 7000, 5000),
                    },
                ],
            },
        ])
        expect(store.redoStack).toEqual([])
        expect(store.redo()).toBe(false)
        expect(store.operationLog.cursor).toBe(2) // 状态未被 redo 触碰
    })
})

describe('图级操作（add_graph / delete_graph）与视图一致性', () => {
    beforeEach(() => {
        resetGraphStoreForTests()
        localStorage.clear()
        vi.restoreAllMocks()
    })

    afterAll(() => {
        localStorage.clear()
        vi.restoreAllMocks()
    })

    test('含 add_graph 的批（add_graph + 子图内 add_node）：undo 注销子图（持久化跟随真删）/ redo 重新注册且节点完整', () => {
        const store = useGraphStore()
        const sub = makeGraph('graph-sub', [], [], {
            kind: 'subgraph',
            parentGraphId: ROOT,
            ownerNodeId: 'node-owner' as NodeId,
        })

        // 模拟 induce 子图批：add_graph 空壳（graphLevel 批）+ 子图内 add_node 填充（inGraph 批）
        store.commitBatchToGraphs([
            {
                kind: 'graphLevel',
                operations: [{ type: 'add_graph', graph: sub }],
            },
            {
                kind: 'inGraph',
                graph: sub,
                operations: [
                    {
                        type: 'add_node',
                        node: createNode({
                            id: 'sub-1' as NodeId,
                            graphId: 'graph-sub' as GraphId,
                            label: '子节点1',
                            position: { x: 0, y: 0 },
                        }),
                    },
                ],
            },
        ])

        // 提交后：子图已注册且含填充节点；reversalBatch 含图级逆元（add_graph 逆元 = delete_graph）
        expect(
            lookupGraph(store.graphRegistry, 'graph-sub')!.nodes,
        ).toHaveLength(1)
        expect(store.operationLog.entries[0]!.reversalBatches).toEqual([
            {
                graphId: 'graph-sub',
                operations: [{ type: 'delete_node', nodeId: 'sub-1' }],
            },
            {
                graphId: 'graph-sub',
                operations: [{ type: 'delete_graph', graph: sub }],
            },
        ])

        // undo：子图从 registry 注销，持久化同步删除（策略 A：注册表无 → deleteGraph 真删，
        // 不再保留软删残留）
        expect(store.undo()).toBe(true)
        expect(lookupGraph(store.graphRegistry, 'graph-sub')).toBeUndefined()
        const persistedSub = loadGraph('graph-sub' as GraphId)
        expect(persistedSub.ok).toBe(false)
        expect(store.operationLog.cursor).toBe(-1)

        // redo：子图重新注册（add_graph 骨架 + add_node 重新填充），节点完整，持久化恢复
        expect(store.redo()).toBe(true)
        expect(
            lookupGraph(store.graphRegistry, 'graph-sub')!.nodes.map(
                (n) => n.id,
            ),
        ).toEqual(['sub-1'])
        expect(store.operationLog.cursor).toBe(0)
        expect(loadGraph('graph-sub' as GraphId).ok).toBe(true)
    })

    test('含 delete_graph 的批：undo 逆元重建注册（持久化恢复）/ redo 再次注销（持久化真删）', () => {
        const store = useGraphStore()
        // 引擎 06.1 语义：delete_graph 只能删空图（与 add_graph 只建空图对称），
        // 内容经图内批填充——此处用空子图验证注册/注销与持久化跟随（策略 A 真删）
        const sub = makeGraph('graph-sub', [], [], {
            kind: 'subgraph',
            parentGraphId: ROOT,
            ownerNodeId: 'node-owner' as NodeId,
        })

        // 先注册 sub（add_graph 批注册 + 持久化）
        store.commitBatchToGraphs([
            {
                kind: 'graphLevel',
                operations: [{ type: 'add_graph', graph: sub }],
            },
        ])
        expect(lookupGraph(store.graphRegistry, 'graph-sub')).toBeDefined()

        // delete_graph：registry 注销 + 持久化真删（策略 A，无软删残留）
        store.commitBatchToGraphs([
            {
                kind: 'graphLevel',
                operations: [{ type: 'delete_graph', graph: sub }],
            },
        ])
        expect(lookupGraph(store.graphRegistry, 'graph-sub')).toBeUndefined()
        expect(loadGraph('graph-sub' as GraphId).ok).toBe(false)

        // undo：add_graph 逆元重建注册（纯内存，不依赖持久化），持久化恢复
        expect(store.undo()).toBe(true)
        expect(lookupGraph(store.graphRegistry, 'graph-sub')).toBeDefined()
        expect(loadGraph('graph-sub' as GraphId).ok).toBe(true)

        // redo：再次注销 + 持久化真删
        expect(store.redo()).toBe(true)
        expect(lookupGraph(store.graphRegistry, 'graph-sub')).toBeUndefined()
        expect(loadGraph('graph-sub' as GraphId).ok).toBe(false)
    })

    test('视图一致性：graphView 指向子图时 undo（撤销含 add_graph 的批）→ 上溯到父图 + graphPath 重算', () => {
        const store = useGraphStore()
        const root = makeGraph(ROOT)
        const sub = makeGraph('graph-sub', [], [], {
            kind: 'subgraph',
            parentGraphId: ROOT,
            ownerNodeId: 'node-owner' as NodeId,
        })

        // root 先持久化并加载为视图（保证 undo 上溯时父图在 registry 中可达）
        saveGraph(root)
        store.loadGraphToView(ROOT)

        // 提交 add_graph + 子图内 add_node 的批
        store.commitBatchToGraphs([
            {
                kind: 'graphLevel',
                operations: [{ type: 'add_graph', graph: sub }],
            },
            {
                kind: 'inGraph',
                graph: sub,
                operations: [
                    {
                        type: 'add_node',
                        node: createNode({
                            id: 'sub-1' as NodeId,
                            graphId: 'graph-sub' as GraphId,
                            label: '子节点1',
                            position: { x: 0, y: 0 },
                        }),
                    },
                ],
            },
        ])

        // 用户导航进子图：graphView 指向子图，graphPath = [根, 子图]
        store.loadGraphToView('graph-sub' as GraphId)
        expect(store.graphView!.id).toBe('graph-sub')
        expect(store.graphPath).toEqual([ROOT, 'graph-sub'])

        // undo 撤销含 add_graph 的批 → 子图被注销 → 视图上溯到父图根图
        expect(store.undo()).toBe(true)
        expect(lookupGraph(store.graphRegistry, 'graph-sub')).toBeUndefined()
        expect(store.graphView!.id).toBe(ROOT)
        expect(store.graphPath).toEqual([ROOT])
    })

    test('graphView 为 null 时 undo 不崩溃', () => {
        const store = useGraphStore()
        const root = makeGraph(ROOT)
        const sub = makeGraph('graph-sub', [], [], {
            kind: 'subgraph',
            parentGraphId: ROOT,
            ownerNodeId: 'node-owner' as NodeId,
        })

        saveGraph(root)
        store.loadGraphToView(ROOT)
        store.commitBatchToGraphs([
            {
                kind: 'graphLevel',
                operations: [{ type: 'add_graph', graph: sub }],
            },
        ])

        // 无公开卸载入口，直接置空 graphViewId 模拟视图清空
        store.graphViewId = null

        // undo 不崩溃且成功回溯（子图注销）；若内部抛异常则测试直接失败
        const ok = store.undo()
        expect(ok).toBe(true)
        expect(lookupGraph(store.graphRegistry, 'graph-sub')).toBeUndefined()
    })

    test('delete 抽象节点可撤销：undo 完整恢复整棵子树（含子图注册与内容），redo 再次删除', () => {
        const store = useGraphStore()
        const G0 = 'g0' as GraphId
        const G1 = 'g1' as GraphId
        const G2 = 'g2' as GraphId

        // 三层嵌套：G0=[A(abstract→G1), F] 含边 A-F；G1=[B(abstract→G2), D, E, 沟通节点]；
        // G2=[C]
        const g0 = makeGraph(
            G0,
            [
                createNode({
                    id: 'A' as NodeId,
                    graphId: G0,
                    label: 'A',
                    childGraphId: G1,
                }),
                createNode({ id: 'F' as NodeId, graphId: G0, label: 'F' }),
            ],
            [
                createEdge({
                    id: 'e-AF' as EdgeId,
                    graphId: G0,
                    source: 'A' as NodeId,
                    target: 'F' as NodeId,
                    kind: 'real' as const,
                    direction: 'undirected' as const,
                }),
            ],
        )
        const g1 = makeGraph(
            G1,
            [
                createNode({
                    id: 'B' as NodeId,
                    graphId: G1,
                    label: 'B',
                    childGraphId: G2,
                }),
                createNode({ id: 'D' as NodeId, graphId: G1, label: 'D' }),
                createNode({ id: 'E' as NodeId, graphId: G1, label: 'E' }),
                createNode({
                    id: 'comm' as NodeId,
                    graphId: G1,
                    label: '沟通',
                    role: 'reference' as const,
                    referenceKind: 'communication' as const,
                    sourceGraphId: G0,
                    sourceNodeId: 'A' as NodeId,
                }),
            ],
            [
                createEdge({
                    id: 'e-BD' as EdgeId,
                    graphId: G1,
                    source: 'B' as NodeId,
                    target: 'D' as NodeId,
                    kind: 'real' as const,
                    direction: 'directed' as const,
                }),
                createEdge({
                    id: 'e-DE' as EdgeId,
                    graphId: G1,
                    source: 'D' as NodeId,
                    target: 'E' as NodeId,
                    kind: 'real' as const,
                    direction: 'directed' as const,
                }),
                createEdge({
                    id: 'e-commE' as EdgeId,
                    graphId: G1,
                    source: 'comm' as NodeId,
                    target: 'E' as NodeId,
                    kind: 'real' as const,
                    direction: 'directed' as const,
                }),
            ],
            {
                kind: 'subgraph',
                parentGraphId: G0,
                ownerNodeId: 'A' as NodeId,
            },
        )
        const g2 = makeGraph(
            G2,
            [createNode({ id: 'C' as NodeId, graphId: G2, label: 'C' })],
            [],
            {
                kind: 'subgraph',
                parentGraphId: G1,
                ownerNodeId: 'B' as NodeId,
            },
        )
        registerGraphs(store, g0, g1, g2)

        // 07.3 compose 输出 → commitBatchToGraphs 提交（delete 工具未来分发路径）
        const result = deleteAbstractNode({
            nodeId: 'A' as NodeId,
            registry: store.graphRegistry,
        })
        expect(
            result.issues.filter((i) => i.severity === 'error'),
        ).toHaveLength(0)
        const { validation } = store.commitBatchToGraphs(result.batches)
        expect(validation.valid).toBe(true)

        // 删除后：G1/G2 注销，G0 仅剩 F（A-F 边随 delete_node 级联删除）
        expect(lookupGraph(store.graphRegistry, G1)).toBeUndefined()
        expect(lookupGraph(store.graphRegistry, G2)).toBeUndefined()
        expect(store.graphRegistry.get(G0)!.nodes.map((n) => n.id)).toEqual([
            'F',
        ])
        expect(store.graphRegistry.get(G0)!.edges).toHaveLength(0)

        // undo：整棵子树完整恢复（子图注册 + 节点 + 边；图级逆元纯内存重建，不依赖持久化）
        expect(store.undo()).toBe(true)
        expect(
            lookupGraph(store.graphRegistry, G2)!.nodes.map((n) => n.id),
        ).toEqual(['C'])
        const restoredG1 = lookupGraph(store.graphRegistry, G1)!
        expect(restoredG1.nodes.map((n) => n.id).sort()).toEqual([
            'B',
            'D',
            'E',
            'comm',
        ])
        expect(restoredG1.edges.map((e) => e.id).sort()).toEqual([
            'e-BD',
            'e-DE',
            'e-commE',
        ])
        const restoredG0 = store.graphRegistry.get(G0)!
        expect(restoredG0.nodes.map((n) => n.id).sort()).toEqual(['A', 'F'])
        expect(restoredG0.edges.map((e) => e.id)).toEqual(['e-AF'])

        // redo：再次整树删除（与正向一致）
        expect(store.redo()).toBe(true)
        expect(lookupGraph(store.graphRegistry, G1)).toBeUndefined()
        expect(lookupGraph(store.graphRegistry, G2)).toBeUndefined()
        expect(store.graphRegistry.get(G0)!.nodes.map((n) => n.id)).toEqual([
            'F',
        ])
    })
})

describe('边界', () => {
    beforeEach(() => {
        resetGraphStoreForTests()
        localStorage.clear()
        vi.restoreAllMocks()
    })

    afterAll(() => {
        localStorage.clear()
        vi.restoreAllMocks()
    })

    test('空日志（cursor = -1）undo() → false 不写状态；空 redoStack redo() → false 不写状态', () => {
        const store = useGraphStore()

        expect(store.undo()).toBe(false)
        expect(store.redo()).toBe(false)
        expect(store.operationLog.cursor).toBe(-1)
        expect(store.operationLog.entries).toHaveLength(0)
        expect(store.redoStack).toEqual([])
        expect(store.graphView).toBeNull()
    })

    test('全部撤销后 cursor 回到 -1，再次 undo → false', () => {
        const store = useGraphStore()
        const graph = makeGraph(ROOT, [knowledgeNode('node-a', '节点A', 0, 0)])
        registerGraphs(store, graph)

        store.commitBatchToGraphs([
            {
                kind: 'inGraph',
                graph,
                operations: [
                    {
                        type: 'add_node',
                        node: knowledgeNode('node-b', '节点B', 5000, 5000),
                    },
                ],
            },
        ])
        expect(store.undo()).toBe(true)
        expect(store.operationLog.cursor).toBe(-1)

        expect(store.undo()).toBe(false)
        expect(store.operationLog.cursor).toBe(-1)
        expect(store.redoStack).toEqual([0])
    })
})

/**
 * 010.1 缺陷修复回归（2026-08-09 回流修复，本 describe 两条测试由「预期失败」转为回归保护）。
 *
 * 缺陷 #1 —— 撤销「删除带关联边的节点」失败（已修复，D1）：
 *     根因：collectedReversals 整体 reverse 翻转单 op 逆元内部序（[add_node, add_edge] 被翻成
 *     [add_edge, add_node]）；且 applyBatch validate-all-first 基于输入图校验，恢复型逆元批
 *     （add_edge 端点依赖批内 add_node 恢复的节点）必然 EDGE_*_NOT_FOUND。
 *     修复：逆元改「操作级逆序」（perOpReversals.reverse().flat()）+ 引擎 BatchOptions.skipValidate
 *     （undo/redo 恢复型批跳过 Phase 1 前提校验）。
 *
 * 缺陷 #2 —— 多级 undo 链抛 DataCloneError（已修复，D2）：
 *     根因：applyEntry 从 reactive operationLog 读出的操作是 proxy；引擎 execute 对 op.node
 *     展开（{...op.node}）把嵌套 position proxy 烘焙进图数据；后续逆元 structuredClone 命中
 *     proxy 即崩溃。
 *     修复：operationLog 降级为 raw 普通字段（不再被 reactive 包装），读出即原始对象。
 *
 * 修复后行为：
 *     #1 delete_node 级联边撤销恢复节点（含 summary）与关联边；
 *     #2 带 position 节点的多级 undo 链不崩溃、逐级精确恢复。
 */
describe('缺陷修复回归（D1 级联撤销 / D2 多级 undo）', () => {
    beforeEach(() => {
        resetGraphStoreForTests()
        localStorage.clear()
        vi.restoreAllMocks()
    })

    afterAll(() => {
        localStorage.clear()
        vi.restoreAllMocks()
    })

    test('D1 回归：delete_node 级联边撤销恢复节点（含 summary）与关联边', () => {
        const store = useGraphStore()
        const graph = makeGraph(
            ROOT,
            [
                createNode({
                    id: 'node-a' as NodeId,
                    graphId: ROOT,
                    label: '节点A',
                    summary: '原始摘要',
                    position: { x: 0, y: 0 },
                }),
                knowledgeNode('node-x', '节点X', 200, 0),
            ],
            [
                createEdge({
                    id: 'edge-ax' as EdgeId,
                    graphId: ROOT,
                    source: 'node-a' as NodeId,
                    target: 'node-x' as NodeId,
                    kind: 'real' as const,
                    direction: 'directed' as const,
                }),
            ],
        )
        registerGraphs(store, graph)

        store.commitBatchToGraphs([
            {
                kind: 'inGraph',
                graph,
                operations: [
                    { type: 'delete_node', nodeId: 'node-a' as NodeId },
                ],
            },
        ])

        // 提交后：节点与关联边均被删除
        const afterDelete = store.graphRegistry.get(ROOT)!
        expect(afterDelete.nodes.find((n) => n.id === 'node-a')).toBeUndefined()
        expect(afterDelete.edges).toHaveLength(0)

        // 期望：undo 恢复节点（含 summary）与关联边（修复后 undo 返回 true）
        expect(store.undo()).toBe(true)
        const restored = store.graphRegistry.get(ROOT)!
        expect(
            (
                restored.nodes.find((n) => n.id === 'node-a') as
                    | KnowledgeNodeData
                    | undefined
            )?.summary,
        ).toBe('原始摘要')
        expect(restored.edges.map((e) => e.id)).toEqual(['edge-ax'])
    })
})
