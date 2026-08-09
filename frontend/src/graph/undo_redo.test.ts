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
 *        以普通对象直传 commitBatchToGraphs（实现内部 toRaw 解包 reactive，测试侧无需构造）。
 *     2. 多操作批遵守引擎 pipeline 语义：Phase 1 逐操作校验基于输入图（validate-all-first），
 *        后置操作不得依赖前置操作新创建的对象（如 add_edge 端点必须是输入图中已存在的节点）。
 * 3. 每用例独立环境：setActivePinia(createPinia()) + localStorage.clear() + vi.restoreAllMocks()。
 * 4. 010.1 缺陷 #1（删除带关联边节点的撤销失败）与缺陷 #2（多级 undo 链 DataCloneError）
 *    已由 010.1 回流修复（D1 操作级逆序 + skipValidate、D2 markRaw），原「已知缺陷暴露」
 *    describe 的两条测试现为回归保护，不再预期失败。
 */

import { setActivePinia, createPinia } from 'pinia'

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

import { useGraphStore } from '@/graph/graph_store'
import { lookupGraph } from '@/graph/graph_registry'
import { loadGraph, saveGraph } from '@/graph/graph_persistence'
import { assembleGraph, createNode, createEdge } from '@/dev/test_case_factory'

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

function knowledgeNode(id: NodeId, label: string, x: number, y: number): NodeData {
    return createNode({ id, graphId: ROOT, label, position: { x, y } })
}

describe('双存接线（commitBatchToGraphs → OperationLogEntry）', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        localStorage.clear()
        vi.restoreAllMocks()
    })

    afterAll(() => {
        localStorage.clear()
        vi.restoreAllMocks()
    })

    test('单图多操作提交 → 组装一条 entry（operation 正向 / reversalOperations item 内逆序 / parentIndex -1）', () => {
        const store = useGraphStore()
        const graph = makeGraph(ROOT, [
            knowledgeNode('node-a', '节点A', 0, 0),
            knowledgeNode('node-x', '节点X', 200, 0),
        ])
        const nodeB = knowledgeNode('node-b', '节点B', 5000, 5000)
        const ops = [
            { type: 'add_node' as const, node: nodeB },
            { type: 'add_edge' as const, edge: createEdge({ id: 'edge-ax' as EdgeId, graphId: ROOT, source: 'node-a' as NodeId, target: 'node-x' as NodeId, kind: 'real' as const, direction: 'directed' as const }) },
            { type: 'move_node' as const, nodeId: 'node-a' as NodeId, position: { x: 9000, y: 9000 } },
        ]

        const { validation } = store.commitBatchToGraphs([{ graph, operations: ops }])

        expect(validation.valid).toBe(true)
        expect(store.operationLog.entries).toHaveLength(1)
        expect(store.operationLog.cursor).toBe(0)

        const entry = store.operationLog.entries[0]!
        expect(entry.parentIndex).toBe(-1)

        // operation：按图分组、正向顺序
        expect(entry.operation).toEqual([{
            graphId: ROOT,
            operations: [
                { type: 'add_node', node: nodeB },
                { type: 'add_edge', edge: expect.objectContaining({ id: 'edge-ax', source: 'node-a', target: 'node-x' }) },
                { type: 'move_node', nodeId: 'node-a', position: { x: 9000, y: 9000 } },
            ],
        }])

        // reversalOperations：item 内逆序（后执行先撤销）
        expect(entry.reversalOperations).toEqual([{
            graphId: ROOT,
            operations: [
                { type: 'move_node', nodeId: 'node-a', position: { x: 0, y: 0 } },
                { type: 'delete_edge', edgeId: 'edge-ax' },
                { type: 'delete_node', nodeId: 'node-b' },
            ],
        }])
    })

    test('混合多图批 → reversalOperations item 间逆序（后提交的图先撤销）', () => {
        const store = useGraphStore()
        const graphA = makeGraph('graph-a', [knowledgeNode('a-1', 'A1', 0, 0)])
        const graphB = makeGraph('graph-b', [knowledgeNode('b-1', 'B1', 0, 0)])

        store.commitBatchToGraphs([
            { graph: graphA, operations: [{ type: 'add_node', node: knowledgeNode('a-2', 'A2', 5000, 5000) }] },
            { graph: graphB, operations: [{ type: 'add_node', node: knowledgeNode('b-2', 'B2', 5000, 5000) }] },
        ])

        const entry = store.operationLog.entries[0]!
        // operation：正向 item 顺序
        expect(entry.operation.map(item => item.graphId)).toEqual(['graph-a', 'graph-b'])
        // reversalOperations：item 间逆序
        expect(entry.reversalOperations.map(item => item.graphId)).toEqual(['graph-b', 'graph-a'])
        expect(entry.reversalOperations[0]!.operations).toEqual([{ type: 'delete_node', nodeId: 'b-2' }])
        expect(entry.reversalOperations[1]!.operations).toEqual([{ type: 'delete_node', nodeId: 'a-2' }])
    })

    test('graphSignals：add_graph / delete_graph 信号提取正确；parentIndex 首条 -1、第二条 0', () => {
        const store = useGraphStore()
        const root = makeGraph(ROOT)
        const sub = makeGraph('graph-sub', [], [], { kind: 'subgraph', parentGraphId: ROOT, ownerNodeId: 'node-owner' as NodeId })

        store.commitBatchToGraphs([{ graph: root, operations: [{ type: 'add_graph', graph: sub }] }])
        store.commitBatchToGraphs([{ graph: store.graphRegistry.get(ROOT)!, operations: [{ type: 'delete_graph', graphId: 'graph-sub' as GraphId }] }])

        expect(store.operationLog.entries[0]!.graphSignals).toEqual({ added: ['graph-sub'], deleted: [] })
        expect(store.operationLog.entries[1]!.graphSignals).toEqual({ added: [], deleted: ['graph-sub'] })
        expect(store.operationLog.entries[0]!.parentIndex).toBe(-1)
        expect(store.operationLog.entries[1]!.parentIndex).toBe(0)
        // 图级操作不构造逆元：两条 entry 的 reversalOperations 均为空
        expect(store.operationLog.entries[0]!.reversalOperations).toEqual([])
        expect(store.operationLog.entries[1]!.reversalOperations).toEqual([])
    })

    test('recordLog: false 提交 → 不追加 entry、cursor 不变（图修改仍生效）', () => {
        const store = useGraphStore()
        const graph = makeGraph(ROOT, [knowledgeNode('node-a', '节点A', 0, 0)])

        store.commitBatchToGraphs(
            [{ graph, operations: [{ type: 'add_node', node: knowledgeNode('node-b', '节点B', 5000, 5000) }] }],
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
        setActivePinia(createPinia())
        localStorage.clear()
        vi.restoreAllMocks()
    })

    afterAll(() => {
        localStorage.clear()
        vi.restoreAllMocks()
    })

    /**
     * 010.1 缺陷 #2（多级 undo 链 DataCloneError）已修复（entry markRaw 消除 proxy 泄漏），
     * 本测试为回归保护：add → update(+summary) → delete 链逐级 undo 精确恢复。
     * 修复前：第三级 undo 抛 DataCloneError（逆元 structuredClone 命中 reactive proxy
     * 烘焙的 position），链无法走完——"新增消失"无法验证。
     */
    test('add_node → update_node(+summary) → delete_node 逐级 undo 精确恢复（节点/属性）', () => {
        const store = useGraphStore()
        const graph = makeGraph(ROOT, [
            createNode({ id: 'node-a' as NodeId, graphId: ROOT, label: '节点A', position: { x: 0, y: 0 } }),
        ])

        // 每条一次提交（单操作批）。update_node 的 node 用普通对象构造——
        // 不可 spread Pinia 注册表中的 reactive 节点（嵌套 position 会以 proxy 进入操作）
        store.commitBatchToGraphs([{ graph, operations: [{ type: 'add_node', node: knowledgeNode('node-b', '节点B', 5000, 5000) }] }])
        store.commitBatchToGraphs([{
            graph: store.graphRegistry.get(ROOT)!,
            operations: [{
                type: 'update_node',
                node: createNode({ id: 'node-b' as NodeId, graphId: ROOT, label: '节点B', position: { x: 5000, y: 5000 }, summary: '补充摘要' }),
            }],
        }])
        store.commitBatchToGraphs([{ graph: store.graphRegistry.get(ROOT)!, operations: [{ type: 'delete_node', nodeId: 'node-b' as NodeId }] }])

        expect(store.operationLog.entries).toHaveLength(3)
        expect(store.operationLog.cursor).toBe(2)

        // ── undo 1（delete_node）：删除的节点带回 summary ──
        expect(store.undo()).toBe(true)
        let current = store.graphRegistry.get(ROOT)!
        expect((current.nodes.find(n => n.id === 'node-b') as KnowledgeNodeData | undefined)?.summary).toBe('补充摘要')
        expect(store.operationLog.cursor).toBe(1)
        expect(store.redoStack).toEqual([2])

        // ── undo 2（update_node）：更新回退旧值（summary 消失）──
        expect(store.undo()).toBe(true)
        current = store.graphRegistry.get(ROOT)!
        expect((current.nodes.find(n => n.id === 'node-b') as KnowledgeNodeData | undefined)?.summary).toBeUndefined()
        expect(store.operationLog.cursor).toBe(0)
        expect(store.redoStack).toEqual([2, 1])

        // ── undo 3（add_node）：新增消失 —— 当前实现在此抛 DataCloneError（缺陷 #2）──
        expect(store.undo()).toBe(true)
        current = store.graphRegistry.get(ROOT)!
        expect(current.nodes.map(n => n.id)).toEqual(['node-a'])
        expect(store.operationLog.cursor).toBe(-1)
        expect(store.redoStack).toEqual([2, 1, 0])
    })

    test('undo 撤销 add_edge：边消失（边的逆元 delete_edge）', () => {
        const store = useGraphStore()
        const graph = makeGraph(ROOT, [
            knowledgeNode('node-a', '节点A', 0, 0),
            knowledgeNode('node-b', '节点B', 5000, 5000),
        ])

        store.commitBatchToGraphs([{
            graph,
            operations: [{ type: 'add_edge', edge: createEdge({ id: 'edge-ab' as EdgeId, graphId: ROOT, source: 'node-a' as NodeId, target: 'node-b' as NodeId, kind: 'real' as const, direction: 'directed' as const }) }],
        }])
        expect(store.graphRegistry.get(ROOT)!.edges).toHaveLength(1)

        expect(store.undo()).toBe(true)
        expect(store.graphRegistry.get(ROOT)!.edges).toHaveLength(0)
        expect(store.operationLog.cursor).toBe(-1)
        expect(store.redoStack).toEqual([0])
    })

    test('折叠链：collapse_dependency → expand_dependency 后 undo，折叠状态恢复（含 foldedNodeIds 成员）', () => {
        const store = useGraphStore()
        const graph = makeGraph(ROOT, [
            knowledgeNode('node-t', '目标', 0, 0),
            knowledgeNode('node-d', '依赖', 200, 0),
        ], [
            createEdge({ id: 'edge-td' as EdgeId, graphId: ROOT, source: 'node-d' as NodeId, target: 'node-t' as NodeId, kind: 'real' as const, direction: 'directed' as const }),
        ])

        store.commitBatchToGraphs([{ graph, operations: [{ type: 'collapse_dependency', targetNodeId: 'node-t' as NodeId }] }])
        store.commitBatchToGraphs([{ graph: store.graphRegistry.get(ROOT)!, operations: [{ type: 'expand_dependency', targetNodeId: 'node-t' as NodeId }] }])

        // 展开后折叠状态为空
        expect(store.graphRegistry.get(ROOT)!.cognitiveState?.foldedDependencies).toEqual([])

        // undo expand → 折叠条目恢复（expand 的逆元 collapse 携带原折叠成员名单）
        expect(store.undo()).toBe(true)
        expect(store.graphRegistry.get(ROOT)!.cognitiveState?.foldedDependencies).toEqual([
            { targetNodeId: 'node-t', foldedNodeIds: ['node-d'] },
        ])

        // 继续 undo collapse → 完全展开
        expect(store.undo()).toBe(true)
        expect(store.graphRegistry.get(ROOT)!.cognitiveState?.foldedDependencies ?? []).toEqual([])
    })

    test('undo 后执行新操作 → 旧 entry 保留（分支）+ redoStack 清空', () => {
        const store = useGraphStore()
        const graph = makeGraph(ROOT, [knowledgeNode('node-a', '节点A', 0, 0)])

        store.commitBatchToGraphs([{ graph, operations: [{ type: 'add_node', node: knowledgeNode('node-b', '节点B', 5000, 5000) }] }])
        store.commitBatchToGraphs([{ graph: store.graphRegistry.get(ROOT)!, operations: [{ type: 'add_node', node: knowledgeNode('node-c', '节点C', 6000, 5000) }] }])

        // undo → cursor 回到 entry 0（B 的父索引），redoStack 记录 entry 1
        expect(store.undo()).toBe(true)
        expect(store.operationLog.cursor).toBe(0)
        expect(store.redoStack).toEqual([1])

        // 新操作 → 分支：新 entry 挂在 cursor 0 下，旧分支保留，redoStack 清空
        store.commitBatchToGraphs([{ graph: store.graphRegistry.get(ROOT)!, operations: [{ type: 'add_node', node: knowledgeNode('node-d', '节点D', 7000, 5000) }] }])

        expect(store.operationLog.entries).toHaveLength(3)
        expect(store.operationLog.cursor).toBe(2)
        expect(store.operationLog.entries[2]!.parentIndex).toBe(0) // 分支挂在被撤销点
        expect(store.redoStack).toEqual([])
        // 旧分支 entry（add node-c）仍保留在日志中
        expect(store.operationLog.entries[1]!.operation[0]!.operations[0]).toEqual(
            { type: 'add_node', node: expect.objectContaining({ id: 'node-c' }) },
        )
        // 图数据 = 基线 + B + D（C 被撤销、D 新加）
        expect(store.graphRegistry.get(ROOT)!.nodes.map(n => n.id)).toEqual(['node-a', 'node-b', 'node-d'])
    })
})

describe('redo 链', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
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

        store.commitBatchToGraphs([{ graph, operations: [{ type: 'add_node', node: knowledgeNode('node-b', '节点B', 5000, 5000) }] }])
        store.commitBatchToGraphs([{ graph: store.graphRegistry.get(ROOT)!, operations: [{ type: 'add_node', node: knowledgeNode('node-c', '节点C', 6000, 5000) }] }])

        expect(store.undo()).toBe(true)
        expect(store.graphRegistry.get(ROOT)!.nodes.map(n => n.id)).toEqual(['node-a', 'node-b'])

        expect(store.redo()).toBe(true)
        expect(store.graphRegistry.get(ROOT)!.nodes.map(n => n.id)).toEqual(['node-a', 'node-b', 'node-c'])
        expect(store.operationLog.cursor).toBe(1)
        expect(store.redoStack).toEqual([])
    })

    test('redoStack 空时 redo() → false 且不写任何状态', () => {
        const store = useGraphStore()
        const graph = makeGraph(ROOT, [knowledgeNode('node-a', '节点A', 0, 0)])

        // 从未 undo：redoStack 为空
        expect(store.redo()).toBe(false)
        expect(store.operationLog.cursor).toBe(-1)
        expect(store.operationLog.entries).toHaveLength(0)
        expect(store.redoStack).toEqual([])

        store.commitBatchToGraphs([{ graph, operations: [{ type: 'add_node', node: knowledgeNode('node-b', '节点B', 5000, 5000) }] }])

        // 提交后仍未 undo：redo 依旧 false
        expect(store.redo()).toBe(false)
        expect(store.operationLog.cursor).toBe(0)
        expect(store.redoStack).toEqual([])
    })

    test('undo → 新操作 → redo 失效（redoStack 已清）', () => {
        const store = useGraphStore()
        const graph = makeGraph(ROOT, [knowledgeNode('node-a', '节点A', 0, 0)])

        store.commitBatchToGraphs([{ graph, operations: [{ type: 'add_node', node: knowledgeNode('node-b', '节点B', 5000, 5000) }] }])
        store.commitBatchToGraphs([{ graph: store.graphRegistry.get(ROOT)!, operations: [{ type: 'add_node', node: knowledgeNode('node-c', '节点C', 6000, 5000) }] }])

        expect(store.undo()).toBe(true)
        expect(store.redoStack).toEqual([1])

        // 新操作清空 redoStack → redo 失效
        store.commitBatchToGraphs([{ graph: store.graphRegistry.get(ROOT)!, operations: [{ type: 'add_node', node: knowledgeNode('node-d', '节点D', 7000, 5000) }] }])
        expect(store.redoStack).toEqual([])
        expect(store.redo()).toBe(false)
        expect(store.operationLog.cursor).toBe(2) // 状态未被 redo 触碰
    })
})

describe('图级操作（add_graph / delete_graph）与视图一致性', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        localStorage.clear()
        vi.restoreAllMocks()
    })

    afterAll(() => {
        localStorage.clear()
        vi.restoreAllMocks()
    })

    test('含 add_graph 的批（add_graph + 子图内 add_node）：undo 注销子图（持久化保留）/ redo 重新注册且节点完整', () => {
        const store = useGraphStore()
        const sub = makeGraph('graph-sub', [], [], { kind: 'subgraph', parentGraphId: ROOT, ownerNodeId: 'node-owner' as NodeId })

        // 模拟 induce 子图批：add_graph 空壳 + 子图内 add_node 填充
        store.commitBatchToGraphs([{
            graph: sub,
            operations: [
                { type: 'add_graph', graph: sub },
                { type: 'add_node', node: createNode({ id: 'sub-1' as NodeId, graphId: 'graph-sub' as GraphId, label: '子节点1', position: { x: 0, y: 0 } }) },
            ],
        }])

        // 提交后：子图已注册且含填充节点；entry 提取 graphSignals.added
        expect(lookupGraph(store.graphRegistry, 'graph-sub')!.nodes).toHaveLength(1)
        expect(store.operationLog.entries[0]!.graphSignals.added).toEqual(['graph-sub'])

        // undo：子图从 registry 注销，持久化保留填充版内容（修复 1：逆元批跳过 added 图
        // 的 item，不再把中间态空壳写回持久化覆盖正向批保存的填充版）
        expect(store.undo()).toBe(true)
        expect(lookupGraph(store.graphRegistry, 'graph-sub')).toBeUndefined()
        const persistedSub = loadGraph('graph-sub' as GraphId)
        expect(persistedSub.ok).toBe(true)
        if (persistedSub.ok) {
            // 持久化内容完整（节点仍在，非空壳）——刷新/新操作（redo 失效）后子图内容不丢失
            expect(persistedSub.graph.nodes.map(n => n.id)).toEqual(['sub-1'])
        }
        expect(store.operationLog.cursor).toBe(-1)

        // redo：子图重新注册（add_graph.graph 空壳作入参 + add_node 重新填充），节点完整
        expect(store.redo()).toBe(true)
        expect(lookupGraph(store.graphRegistry, 'graph-sub')!.nodes.map(n => n.id)).toEqual(['sub-1'])
        expect(store.operationLog.cursor).toBe(0)
    })

    test('含 delete_graph 的批：undo 从持久化恢复注册 / redo 再次注销', () => {
        const store = useGraphStore()
        const root = makeGraph(ROOT)
        const sub = makeGraph('graph-sub', [createNode({ id: 'sub-1' as NodeId, graphId: 'graph-sub' as GraphId, label: '子节点1', position: { x: 0, y: 0 } })], [], {
            kind: 'subgraph', parentGraphId: ROOT, ownerNodeId: 'node-owner' as NodeId,
        })

        // 先注册 root + sub（add_graph 批注册 + 持久化 sub）
        store.commitBatchToGraphs([{ graph: root, operations: [{ type: 'add_graph', graph: sub }] }])
        expect(lookupGraph(store.graphRegistry, 'graph-sub')).toBeDefined()

        // delete_graph：软删（registry 注销，持久化保留）
        store.commitBatchToGraphs([{ graph: store.graphRegistry.get(ROOT)!, operations: [{ type: 'delete_graph', graphId: 'graph-sub' as GraphId }] }])
        expect(lookupGraph(store.graphRegistry, 'graph-sub')).toBeUndefined()

        // undo：从持久化 loadGraph 恢复注册
        expect(store.undo()).toBe(true)
        const restored = lookupGraph(store.graphRegistry, 'graph-sub')
        expect(restored).toBeDefined()
        expect(restored!.nodes.map(n => n.id)).toEqual(['sub-1'])

        // redo：再次注销
        expect(store.redo()).toBe(true)
        expect(lookupGraph(store.graphRegistry, 'graph-sub')).toBeUndefined()
        // 持久化始终保留（软删）
        const persisted = loadGraph('graph-sub' as GraphId)
        expect(persisted.ok).toBe(true)
    })

    test('视图一致性：graphView 指向子图时 undo（撤销含 add_graph 的批）→ 上溯到父图 + graphPath 重算', () => {
        const store = useGraphStore()
        const root = makeGraph(ROOT)
        const sub = makeGraph('graph-sub', [], [], { kind: 'subgraph', parentGraphId: ROOT, ownerNodeId: 'node-owner' as NodeId })

        // root 先持久化并加载为视图（保证 undo 上溯时父图在 registry 中可达）
        saveGraph(root)
        store.loadGraphToView(ROOT)

        // 提交 add_graph + 子图内 add_node 的批
        store.commitBatchToGraphs([{
            graph: sub,
            operations: [
                { type: 'add_graph', graph: sub },
                { type: 'add_node', node: createNode({ id: 'sub-1' as NodeId, graphId: 'graph-sub' as GraphId, label: '子节点1', position: { x: 0, y: 0 } }) },
            ],
        }])

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
        const sub = makeGraph('graph-sub', [], [], { kind: 'subgraph', parentGraphId: ROOT, ownerNodeId: 'node-owner' as NodeId })

        saveGraph(root)
        store.loadGraphToView(ROOT)
        store.commitBatchToGraphs([{ graph: sub, operations: [{ type: 'add_graph', graph: sub }] }])

        // 无公开卸载入口，直接置空 graphView 模拟视图清空
        store.graphView = null

        // undo 不崩溃且成功回溯（子图注销）；若内部抛异常则测试直接失败
        const ok = store.undo()
        expect(ok).toBe(true)
        expect(lookupGraph(store.graphRegistry, 'graph-sub')).toBeUndefined()
    })
})

describe('边界', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
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

        store.commitBatchToGraphs([{ graph, operations: [{ type: 'add_node', node: knowledgeNode('node-b', '节点B', 5000, 5000) }] }])
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
 *     修复：entry 组装后整体 markRaw 再入日志（Vue 尊重 markRaw，读出不包装）。
 *
 * 修复后行为：
 *     #1 delete_node 级联边撤销恢复节点（含 summary）与关联边；
 *     #2 带 position 节点的多级 undo 链不崩溃、逐级精确恢复。
 */
describe('缺陷修复回归（D1 级联撤销 / D2 多级 undo）', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        localStorage.clear()
        vi.restoreAllMocks()
    })

    afterAll(() => {
        localStorage.clear()
        vi.restoreAllMocks()
    })

    test('D1 回归：delete_node 级联边撤销恢复节点（含 summary）与关联边', () => {
        const store = useGraphStore()
        const graph = makeGraph(ROOT, [
            createNode({ id: 'node-a' as NodeId, graphId: ROOT, label: '节点A', summary: '原始摘要', position: { x: 0, y: 0 } }),
            knowledgeNode('node-x', '节点X', 200, 0),
        ], [
            createEdge({ id: 'edge-ax' as EdgeId, graphId: ROOT, source: 'node-a' as NodeId, target: 'node-x' as NodeId, kind: 'real' as const, direction: 'directed' as const }),
        ])

        store.commitBatchToGraphs([{ graph, operations: [{ type: 'delete_node', nodeId: 'node-a' as NodeId }] }])

        // 提交后：节点与关联边均被删除
        const afterDelete = store.graphRegistry.get(ROOT)!
        expect(afterDelete.nodes.find(n => n.id === 'node-a')).toBeUndefined()
        expect(afterDelete.edges).toHaveLength(0)

        // 期望：undo 恢复节点（含 summary）与关联边（修复后 undo 返回 true）
        expect(store.undo()).toBe(true)
        const restored = store.graphRegistry.get(ROOT)!
        expect((restored.nodes.find(n => n.id === 'node-a') as KnowledgeNodeData | undefined)?.summary).toBe('原始摘要')
        expect(restored.edges.map(e => e.id)).toEqual(['edge-ax'])
    })
})
