/**
 * graph_store.test.ts
 *
 * 功能：
 *     graph_store 错误出口行为的单元测试（08.2 行为变更断言 + 08.3 补全 + oracle 防回归）。
 *     覆盖 loadGraphToView 的 missing / corrupted 出口、祖先链断裂与环检测的开发者通道迁移。
 *     （createRootGraph 幂等保护已随创建逻辑下沉至 useNavigation，测试见其对应文件。）
 *
 * 规则：
 *     1. validation 通道（lastValidationResult）= 图规则校验专用；missing 静默；
 *        corrupted 与链断裂 / 环走开发者通道（console.warn）。
 *     2. missing / corrupted 断言以预置 sentinel 证明"既不写也不清 lastValidationResult"。
 *     3. 祖先链断裂 / 环的开发者通道报告在 buildGraphPath 回溯过程中产出且恰好一次
 *        （loadGraphToView 不重复报告），断言 message 含关键 id。
 *     4. 规则校验路径（commitBatchToGraphs / 工具层）的 lastValidationResult 行为由
 *        useGraphOperation 测试覆盖，不在此重复。
 */

import { useGraphStore, resetGraphStoreForTests } from '@/graph/graph_store'
import { registerGraph } from '@/graph/graph_registry'
import { commitGraphs } from '@/persistence'
import * as medium from '@/persistence/medium/local_storage'
import { createGoldenTestGraphV2, createNode } from '@/dev/test_case_factory'

import type { GraphData, GraphId, NodeId } from '@my-project/graph-engine'

describe('graph_store loadGraphToView 错误出口（08.2）', () => {
    beforeEach(() => {
        resetGraphStoreForTests()
        medium.resetMediumForTests()
        vi.restoreAllMocks()
    })

    afterAll(() => {
        medium.resetMediumForTests()
        vi.restoreAllMocks()
    })

    test('loadGraphToView 不再注册图：图未预注册时 graphView 为 null', () => {
        const golden = createGoldenTestGraphV2()
        commitGraphs({ upserts: [golden], deletes: [] })
        const store = useGraphStore()

        const loaded = store.loadGraphToView(golden.id)

        expect(loaded).toBe(true)
        // 注册由 registerAllGraphs 负责，loadGraphToView 仅切换视图
        expect(store.graphRegistry.has(golden.id)).toBe(false)
        expect(store.graphView).toBeNull()
    })

    test('missing：静默返回 false，无任何状态写入', () => {
        const store = useGraphStore()
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        // 预置 sentinel：证明 missing 路径既不写也不清 lastValidationResult（validation 通道与图状态均不被触碰）
        store.lastValidationResult = { valid: false, issues: [] }

        const loaded = store.loadGraphToView('graph-nonexistent' as GraphId)

        expect(loaded).toBe(false)
        expect(store.lastValidationResult).toEqual({ valid: false, issues: [] })
        expect(store.graphView).toBeNull()
        expect(store.graphPath).toEqual([])
        expect(warnSpy).not.toHaveBeenCalled()
    })

    test('corrupted：返回 false，不写 lastValidationResult，入开发者通道（含 code 与 targetId）', () => {
        medium.writeString('graph:graph-corrupt', 'not-valid-json{{{')
        const store = useGraphStore()
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        // 预置 sentinel：证明 corrupted 路径不覆盖 lastValidationResult（08.1 前此处会写 LOAD_FAILED）
        store.lastValidationResult = { valid: false, issues: [] }

        const loaded = store.loadGraphToView('graph-corrupt' as GraphId)

        expect(loaded).toBe(false)
        expect(store.lastValidationResult).toEqual({ valid: false, issues: [] })
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[data-integrity]'))
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('CORRUPTED_GRAPH'))
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('graph-corrupt'))
    })

    test('祖先链断裂：图加载成功返回 true，不再写 lastValidationResult，message 含三要素（graphId / terminalId / 缺失父图 id）', () => {
        // 子图的父图不存在 → buildGraphPath 回溯在子图处中断
        commitGraphs({
            upserts: [
                {
                    id: 'graph-broken-sub' as GraphId,
                    kind: 'subgraph',
                    title: '断裂子图',
                    parentGraphId: 'graph-missing-parent' as GraphId,
                    ownerNodeId: 'node-x' as NodeId,
                    nodes: [],
                    edges: [],
                    cognitiveState: { foldedDependencies: [] },
                },
            ],
            deletes: [],
        })
        const store = useGraphStore()
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

        const loaded = store.loadGraphToView('graph-broken-sub' as GraphId)

        expect(loaded).toBe(true)
        expect(store.lastValidationResult).toBeNull()
        // 恰好一次：报告只在 buildGraphPath 断裂点产出，loadGraphToView 不重复报告
        expect(warnSpy).toHaveBeenCalledTimes(1)
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[data-integrity]'))
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('ANCESTOR_CHAIN_BROKEN'))
        // 三要素：发起回溯的 graphId / 断裂处 terminalId（此处同为断裂子图）/ 缺失父图 id
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('graph-broken-sub'))
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('graph-missing-parent'))
    })

    test('环检测：parentGraphId 链成环（A→B→A），console.warn 恰好一次且含 CYCLE_DETECTED 与环入口 id', () => {
        // 构造成环的持久化数据：A.parentGraphId = B，B.parentGraphId = A
        commitGraphs({
            upserts: [
                {
                    id: 'graph-cyc-a' as GraphId,
                    kind: 'subgraph',
                    title: '环图 A',
                    parentGraphId: 'graph-cyc-b' as GraphId,
                    ownerNodeId: 'node-a' as NodeId,
                    nodes: [],
                    edges: [],
                    cognitiveState: { foldedDependencies: [] },
                },
                {
                    id: 'graph-cyc-b' as GraphId,
                    kind: 'subgraph',
                    title: '环图 B',
                    parentGraphId: 'graph-cyc-a' as GraphId,
                    ownerNodeId: 'node-b' as NodeId,
                    nodes: [],
                    edges: [],
                    cognitiveState: { foldedDependencies: [] },
                },
            ],
            deletes: [],
        })
        const store = useGraphStore()
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

        // 加载 A 触发 buildGraphPath：A → B → 回溯到 A 时命中环检测
        const loaded = store.loadGraphToView('graph-cyc-a' as GraphId)

        expect(loaded).toBe(true)
        expect(store.lastValidationResult).toBeNull()
        // 恰好一次：环检测报告只在 buildGraphPath 环 break 处产出
        expect(warnSpy).toHaveBeenCalledTimes(1)
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[data-integrity]'))
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('CYCLE_DETECTED'))
        // 环入口 id（被重复访问的父图）应在 message 中
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('graph-cyc-a'))
    })

    test('落盘失败：内存注册表不前进、storageError 置位、返回 STORAGE_WRITE_FAILED', () => {
        const store = useGraphStore()
        const graph: GraphData = {
            id: 'graph-write-fail' as GraphId,
            kind: 'root',
            title: '写失败图',
            nodes: [],
            edges: [],
            cognitiveState: { foldedDependencies: [] },
        }
        registerGraph(store.graphRegistry, graph)
        vi.spyOn(medium, 'writeString').mockReturnValue({ ok: false, reason: 'quota-exceeded' })

        const { validation } = store.commitBatchToGraphs([
            {
                kind: 'inGraph',
                graph,
                operations: [
                    {
                        type: 'add_node',
                        node: createNode({
                            id: 'node-fail' as NodeId,
                            graphId: graph.id,
                            label: '写失败节点',
                            position: { x: 0, y: 0 },
                        }),
                    },
                ],
            },
        ])

        // 返回失败信号（供工具 handler 中止收尾），真实错误走 storageError 独立通道
        expect(validation.valid).toBe(false)
        expect(validation.issues.some((issue) => issue.code === 'STORAGE_WRITE_FAILED')).toBe(true)
        expect(store.storageError?.reason).toBe('quota-exceeded')
        expect(store.lastValidationResult).toBeNull()
        // 内存不前进：注册表未替换、日志未追加
        expect(store.graphRegistry.get('graph-write-fail' as GraphId)!.nodes).toHaveLength(0)
        expect(store.operationLog.entries).toHaveLength(0)
    })
})
