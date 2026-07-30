/**
 * tests/toolbar/add-edge.test.ts
 *
 * 功能：
 *     添加边工具（useAddEdgeTool）的集成测试。
 *     覆盖激活、两次点击添加边、连续添加、停用、光标切换。
 *
 * 规则：
 *     1. 使用金牌图作为测试数据。
 *     2. 每个测试独立环境（beforeEach 重置 Pinia 和 localStorage）。
 */

import { setActivePinia, createPinia } from 'pinia'

import { useGraphStore } from '@/graph/graph_store'
import { saveGraph } from '@/graph/graph_persistence'
import { createGoldenTestGraphV2 } from '@/dev/test_case_factory'
import { useAddEdgeTool } from './add_edge'


beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    const golden = createGoldenTestGraphV2()
    saveGraph(golden)
    const store = useGraphStore()
    store.loadGraphToView(golden.id)
})


describe('useAddEdgeTool', () => {
    let handler: ReturnType<typeof useAddEdgeTool>

    beforeEach(() => {
        handler = useAddEdgeTool('real', 'directed')
        handler.activate()
    })

    test('激活后 isActive 为 true', () => {
        expect(handler.isActive).toBe(true)
    })

    test('首次 onNodeClick 记录 source', () => {
        handler.onNodeClick!('node-g1')
        expect(handler.highlightNode).toBe('node-g1')
    })

    test('两次 onNodeClick 添加边', () => {
        handler.onNodeClick!('node-g1')
        handler.onNodeClick!('node-g6')

        const store = useGraphStore()
        expect(store.graphView!.edges.length).toBe(5)
    })

    test('添加成功后重置 source', () => {
        handler.onNodeClick!('node-g1')
        handler.onNodeClick!('node-g6')
        expect(handler.highlightNode).toBeNull()
    })

    test('第二次可继续加边', () => {
        handler.onNodeClick!('node-g1')
        handler.onNodeClick!('node-g6')
        const store1 = useGraphStore()
        expect(store1.graphView!.edges.length).toBe(5)

        // 添加第二条边 g1→g3（g1→g3 尚无直接边）
        handler.onNodeClick!('node-g1')
        handler.onNodeClick!('node-g3')
        const store2 = useGraphStore()
        expect(store2.graphView!.edges.length).toBe(6)
    })

    test('deactivate 清空 source', () => {
        handler.onNodeClick!('node-g1')
        handler.deactivate()
        expect(handler.highlightNode).toBeNull()
        expect(handler.isActive).toBe(false)
    })

    test('cursorClass 变化', () => {
        expect(handler.cursorClass).toBe('cursor-crosshair')
        handler.onNodeClick!('node-g1')
        expect(handler.cursorClass).toBe('cursor-cell')
    })
})
