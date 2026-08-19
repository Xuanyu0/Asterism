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
import { saveGraph } from '@/graph/graph_persistence'
import { createGoldenTestGraphV2 } from '@/dev/test_case_factory'
import { useDeleteTool } from './delete'

beforeEach(() => {
    resetGraphStoreForTests()
    localStorage.clear()
    const golden = createGoldenTestGraphV2()
    saveGraph(golden)
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
        handler.onNodeClick!('node-g3')
        handler.onNodeClick!('node-g3')

        const store = useGraphStore()
        // node-g3 是 edge-g23 (g2→g3) 的 target
        expect(store.graphView!.nodes.length).toBe(5)
        expect(store.graphView!.edges.length).toBe(3) // 4 → 3 (edge-g23 被级联移除)
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
