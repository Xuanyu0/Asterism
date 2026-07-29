/**
 * tests/toolbar/add-node.test.ts
 *
 * 功能：
 *     添加节点工具（useAddNodeTool）的集成测试。
 *     覆盖激活、画布点击创建草稿、提交确认、空标签拒绝、取消和停用。
 *
 * 规则：
 *     1. 使用金牌图作为测试数据。
 *     2. 每个测试独立环境（beforeEach 重置 Pinia 和 localStorage）。
 */

import { setActivePinia, createPinia } from 'pinia'

import { useGraphStore } from '@/graph/graph_store'
import { saveGraph } from '@/graph/graph_persistence'
import { createGoldenTestGraphV2 } from '@/dev/test_case_factory'
import { useAddNodeTool } from './add-node'


beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    const golden = createGoldenTestGraphV2()
    saveGraph(golden)
    const store = useGraphStore()
    store.loadGraphToView(golden.id)
})


describe('useAddNodeTool', () => {
    let handler: ReturnType<typeof useAddNodeTool>

    beforeEach(() => {
        handler = useAddNodeTool('real')
        handler.activate()
    })

    test('激活后 isActive 为 true', () => {
        expect(handler.isActive).toBe(true)
    })

    test('onCanvasClick 创建 DraftNode', () => {
        handler.onCanvasClick!({ x: 100, y: 200 })
        expect(handler.draftNode).not.toBeNull()
        expect(handler.draftNode!.x).toBe(100)
        expect(handler.draftNode!.y).toBe(200)
        expect(handler.draftNode!.kind).toBe('real')
    })

    test('onConfirm 提交节点到 store', () => {
        // 使用远离所有已有节点的位置以避免碰撞
        handler.onCanvasClick!({ x: 999, y: 999 })
        handler.onConfirm!('测试标签', '摘要')

        const store = useGraphStore()
        expect(store.graphView!.nodes.length).toBe(7)
    })

    test('空 label 拒绝', () => {
        handler.onCanvasClick!({ x: 999, y: 999 })
        handler.onConfirm!('', '摘要')

        const store = useGraphStore()
        expect(store.graphView!.nodes.length).toBe(6)
        expect(store.lastValidationResult).not.toBeNull()
        expect(store.lastValidationResult!.valid).toBe(false)
    })

    test('deactivate 清除草稿', () => {
        handler.onCanvasClick!({ x: 100, y: 200 })
        handler.deactivate()
        expect(handler.draftNode).toBeNull()
        expect(handler.isActive).toBe(false)
    })

    test('onCancel 清除草稿', () => {
        handler.onCanvasClick!({ x: 100, y: 200 })
        handler.onCancel!()
        expect(handler.draftNode).toBeNull()
    })
})
