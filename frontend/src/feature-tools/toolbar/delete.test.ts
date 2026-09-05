/**
 * tests/toolbar/delete.test.ts
 *
 * 功能：
 *     删除工具（useDeleteTool）的集成测试。
 *     覆盖激活、两步确认删除、级联删除、切换目标、停用、通知状态。
 *
 * 规则：
 *     1. 使用金牌图作为测试数据。
 *     2. 每个测试独立环境（beforeEach 重置 store 单例和 localStorage）。
 */

import { useGraphStore, resetGraphStoreForTests } from '@/graph/graph_store'
import { useLifecycle } from '@/graph/use-case/useLifecycle'
import { saveGraph } from '@/graph/graph_persistence'
import { createGoldenTestGraphV2 } from '@/dev/test_case_factory'
import { useDeleteTool } from './delete'

import type { GraphId } from '@my-project/graph-engine'

beforeEach(() => {
    resetGraphStoreForTests()
    localStorage.clear()
    const golden = createGoldenTestGraphV2()
    saveGraph(golden)
    // loadGraphToView 不再负责注册——先全量注册所有持久化图
    useLifecycle().registerAllGraphs()
    const store = useGraphStore()
    store.loadGraphToView(golden.id)
})

describe('useDeleteTool', () => {
    let handler: ReturnType<typeof useDeleteTool>

    beforeEach(() => {
        handler = useDeleteTool()
        handler.activate()
    })

    test('激活后 isActive 为 true', () => {
        expect(handler.isActive).toBe(true)
    })

    test('首次 onNodeClick 标记待定', () => {
        handler.onNodeClick!('node-g1')
        expect(handler.highlightNode).toBe('node-g1')
    })

    test('两次点击同一节点确认删除', () => {
        handler.onNodeClick!('node-g1')
        expect(handler.highlightNode).toBe('node-g1')
        handler.onNodeClick!('node-g1')

        const store = useGraphStore()
        expect(store.graphView!.nodes.length).toBe(5)
    })

    test('删除节点级联删除关联边', () => {
        handler.onNodeClick!('node-g1')
        handler.onNodeClick!('node-g1')

        const store = useGraphStore()
        // node-g1 是 edge-g12 (g1→g2) 与 edge-g51 (g5→g1) 的端点
        expect(store.graphView!.nodes.length).toBe(5)
        expect(store.graphView!.edges.length).toBe(2) // 4 → 2 (两条关联边被级联移除)
    })

    test('抽象节点删除：递归删除子图树（子图从 registry 消失，死图不残留）', () => {
        const store = useGraphStore()
        // 前置：sub-golden 已由 registerAllGraphs 全量注册
        expect(store.graphRegistry.has('sub-golden' as GraphId)).toBe(true)

        // node-g3 为抽象节点（childGraphId: sub-golden）——两次点击确认删除
        handler.onNodeClick!('node-g3')
        handler.onNodeClick!('node-g3')

        // 当前图：node-g3 消失，关联边 edge-g23 (g2→g3) 级联删除
        expect(store.graphView!.nodes.map((n) => n.id)).not.toContain('node-g3')
        expect(store.graphView!.nodes.length).toBe(5) // 6 → 5
        expect(store.graphView!.edges.length).toBe(3) // 4 → 3
        // 子图树：sub-golden 整图注销（其节点/边随图消失）——无死图残留
        expect(store.graphRegistry.has('sub-golden' as GraphId)).toBe(false)
    })

    test('notification：抽象节点 pending 时文案含"（及其子图）"', () => {
        handler.onNodeClick!('node-g3')
        expect(handler.notification!.message).toContain('（及其子图）')
    })

    test('notification：非抽象节点 pending 时保持原文案（不含"及其子图"）', () => {
        handler.onNodeClick!('node-g1')
        expect(handler.notification!.message).toBe(
            '再次点击将删除："知识节点A"',
        )
        expect(handler.notification!.message).not.toContain('（及其子图）')
    })

    test('两次点击不同节点切换目标', () => {
        handler.onNodeClick!('node-g1')
        expect(handler.highlightNode).toBe('node-g1')
        handler.onNodeClick!('node-g2')
        expect(handler.highlightNode).toBe('node-g2')
    })

    test('deactivate 清空 pending 状态', () => {
        handler.onNodeClick!('node-g1')
        handler.deactivate()
        expect(handler.highlightNode).toBeNull()
        expect(handler.isActive).toBe(false)
    })

    test('notification 状态', () => {
        // 未激活时（handler 已在 beforeEach 中 activate）
        expect(handler.notification).toBeNull()
        // 激活但未标记
        expect(handler.notification).toBeNull()
        handler.onNodeClick!('node-g1')
        // 标记待定后
        expect(handler.notification).not.toBeNull()
        expect(handler.notification!.visible).toBe(true)
    })
})
