/**
 * useLifecycleAdapter.test.ts
 *
 * 功能：
 *     生命周期适配层（useLifecycleAdapter）的单元测试。
 *     覆盖 restoreLastRootTree 的恢复与异常路径（kind 非 root / corrupted / missing / 无历史）、
 *     ensureWorkspaceRoot 的恢复复用与兜底创建。
 *
 * 规则：
 *     1. 使用金牌图（graph-golden 根图 + sub-golden 子图）作为恢复测试数据。
 *     2. 适配层为模块级单例，方法内部每次解析当前 store 单例——每用例经
 *        resetGraphStoreForTests 重置 store 实现隔离。
 */

import { useGraphStore, resetGraphStoreForTests } from '@/graph/graph_store'
import {
    saveGraph,
    loadGraph,
    saveLastActiveRootId,
    loadLastActiveRootId,
} from '@/graph/graph_persistence'
import { createGoldenTestGraphV2 } from '@/dev/test_case_factory'
import { useLifecycleAdapter } from './useLifecycleAdapter'

import type { GraphId, NodeId } from '@my-project/graph-engine'

describe('useLifecycleAdapter', () => {
    beforeEach(() => {
        resetGraphStoreForTests()
        localStorage.clear()
        vi.restoreAllMocks()
    })

    afterAll(() => {
        localStorage.clear()
        vi.restoreAllMocks()
    })

    test('restoreLastRootTree 恢复根图树并返回根图 ID', () => {
        const golden = createGoldenTestGraphV2()
        saveGraph(golden)
        saveLastActiveRootId('graph-golden' as GraphId)
        const store = useGraphStore()
        const lifecycle = useLifecycleAdapter()

        const rootId = lifecycle.restoreLastRootTree()

        expect(rootId).toBe('graph-golden')
        // 根图已注册
        expect(store.graphRegistry.has('graph-golden' as GraphId)).toBe(true)
        // 子图已注册（sub-golden 属于金牌根图树）
        expect(store.graphRegistry.has('sub-golden' as GraphId)).toBe(true)
    })

    test('restoreLastRootTree：lastActiveRootId 指向非根图 → 报告 + 清理 + 返回 null', () => {
        saveGraph({
            id: 'graph-sub' as GraphId,
            kind: 'subgraph',
            title: '子图',
            parentGraphId: 'graph-golden' as GraphId,
            ownerNodeId: 'node-x' as NodeId,
            nodes: [],
            edges: [],
            cognitiveState: { foldedDependencies: [] },
        })
        saveLastActiveRootId('graph-sub' as GraphId)
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const lifecycle = useLifecycleAdapter()

        const rootId = lifecycle.restoreLastRootTree()

        expect(rootId).toBeNull()
        expect(loadLastActiveRootId()).toBeNull()
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('[data-integrity]'),
        )
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('LAST_ACTIVE_NOT_ROOT'),
        )
    })

    test('restoreLastRootTree：lastActiveRootId 指向损坏图 → 报告 + 清理 + 返回 null', () => {
        localStorage.setItem('graph:graph-corrupt', 'not-valid-json{{{')
        saveLastActiveRootId('graph-corrupt' as GraphId)
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const lifecycle = useLifecycleAdapter()

        const rootId = lifecycle.restoreLastRootTree()

        expect(rootId).toBeNull()
        expect(loadLastActiveRootId()).toBeNull()
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('CORRUPTED_GRAPH'),
        )
    })

    test('restoreLastRootTree：lastActiveRootId 指向已删图 → 静默清理 + 返回 null', () => {
        saveLastActiveRootId('graph-deleted' as GraphId)
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const lifecycle = useLifecycleAdapter()

        const rootId = lifecycle.restoreLastRootTree()

        expect(rootId).toBeNull()
        expect(loadLastActiveRootId()).toBeNull()
        expect(warnSpy).not.toHaveBeenCalled()
    })

    test('restoreLastRootTree：无历史 → 返回 null 且不清理', () => {
        const lifecycle = useLifecycleAdapter()

        const rootId = lifecycle.restoreLastRootTree()

        expect(rootId).toBeNull()
        expect(loadLastActiveRootId()).toBeNull()
    })

    test('ensureWorkspaceRoot：无健康根图时创建兜底根图（新图谱）并经 commitBatchToGraphs', () => {
        const store = useGraphStore()
        const commitSpy = vi.spyOn(store, 'commitBatchToGraphs')
        const lifecycle = useLifecycleAdapter()

        const rootId = lifecycle.ensureWorkspaceRoot()

        expect(rootId).toBeTruthy()
        expect(commitSpy).toHaveBeenCalledTimes(1)
        // registry 可查（add_graph 信号已注册）
        expect(store.graphRegistry.has(rootId)).toBe(true)
        // 持久化可见
        const result = loadGraph(rootId)
        expect(result.ok).toBe(true)
        if (result.ok) {
            expect(result.graph.kind).toBe('root')
            expect(result.graph.title).toBe('新图谱')
        }
    })

    test('ensureWorkspaceRoot：有健康根图时返回恢复的根图 ID，不创建新图', () => {
        const golden = createGoldenTestGraphV2()
        saveGraph(golden)
        saveLastActiveRootId('graph-golden' as GraphId)
        const store = useGraphStore()
        const commitSpy = vi.spyOn(store, 'commitBatchToGraphs')
        const lifecycle = useLifecycleAdapter()

        const rootId = lifecycle.ensureWorkspaceRoot()

        expect(rootId).toBe('graph-golden')
        expect(commitSpy).not.toHaveBeenCalled()
    })
})
