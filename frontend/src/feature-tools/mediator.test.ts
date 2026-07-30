/**
 * tests/mediator.test.ts
 *
 * 功能：
 *     工具中介者（useToolMediator）的集成测试。
 *     覆盖单例、注册/激活、互斥取消、事件转发、右键取消。
 *
 * 规则：
 *     1. 使用金牌图作为测试数据。
 *     2. 每个测试独立环境（beforeEach 重置 Pinia 和 localStorage）。
 *     3. 中介者模块级单例在同一文件测试间共享，各测试通过重新注册 handler 隔离。
 */

import { setActivePinia, createPinia } from 'pinia'

import { useGraphStore } from '@/graph/graph_store'
import { saveGraph } from '@/graph/graph_persistence'
import { createGoldenTestGraphV2 } from '@/dev/test_case_factory'
import { useToolMediator } from './mediator'
import { useAddNodeTool } from './toolbar/add_node'
import { useFoldTool } from './toolbar/fold'

import type { ToolHandler } from './types'


beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    const golden = createGoldenTestGraphV2()
    saveGraph(golden)
    const store = useGraphStore()
    store.loadGraphToView(golden.id)
    // 用 mock 替换自动注册的 default 工具（测试需要可控的 isActive 状态）
    const mediator = useToolMediator()
    const mockDefault: ToolHandler = {
        id: 'default',
        isActive: false,
        activate() { (mockDefault as any).isActive = true },
        deactivate() { (mockDefault as any).isActive = false },
        cursorClass: null,
        notification: null,
    }
    mediator.register('default', mockDefault)
})


describe('useToolMediator', () => {
    let mediator: ReturnType<typeof useToolMediator>

    beforeEach(() => {
        mediator = useToolMediator()
    })

    test('获取单例：两次调用返回同一实例', () => {
        const m1 = useToolMediator()
        const m2 = useToolMediator()
        expect(m1).toBe(m2)
    })

    test('注册 handler 后可激活', () => {
        const handler = useAddNodeTool('real')
        mediator.register('add-real-node', handler)
        mediator.activate('add-real-node')
        expect(mediator.activeToolId.value).toBe('add-real-node')
        expect(mediator.activeHandler.value).not.toBeNull()
    })

    test('激活新工具自动取消旧工具', () => {
        const handlerA = useAddNodeTool('real')
        const handlerB = useFoldTool()
        mediator.register('add-real-node', handlerA)
        mediator.register('fold', handlerB)

        mediator.activate('add-real-node')
        expect(handlerA.isActive).toBe(true)

        mediator.activate('fold')
        expect(handlerA.isActive).toBe(false)
        expect(handlerB.isActive).toBe(true)
    })

    test('activate(null) 取消所有', () => {
        const handler = useAddNodeTool('real')
        mediator.register('add-real-node', handler)
        mediator.activate('add-real-node')
        expect(mediator.activeToolId.value).toBe('add-real-node')

        mediator.activate(null)
        expect(mediator.activeToolId.value).toBeNull()
    })

    test('deactivate 取消并恢复 default', () => {
        const handler = useAddNodeTool('real')
        mediator.register('add-real-node', handler)
        mediator.activate('add-real-node')
        expect(mediator.activeToolId.value).toBe('add-real-node')

        mediator.deactivate()
        // deactivate() 自动恢复 default 工具
        expect(mediator.activeToolId.value).toBe('default')
    })

    test('事件转发到 activeHandler', () => {
        let canvasCalled = false
        let capturedPos = { x: 0, y: 0 }

        const handler: ToolHandler = {
            id: 'add-real-node',
            isActive: false,
            activate() { (handler as any).isActive = true },
            deactivate() { (handler as any).isActive = false },
            onCanvasClick(pos: { x: number; y: number }) {
                canvasCalled = true
                capturedPos = pos
            },
            cursorClass: null,
            notification: null,
        }
        mediator.register('add-real-node', handler)
        mediator.activate('add-real-node')
        mediator.onCanvasClick({ x: 150, y: 250 })
        expect(canvasCalled).toBe(true)
        expect(capturedPos).toEqual({ x: 150, y: 250 })
    })

    test('onRightClick 执行 deactivate 并恢复 default', () => {
        const handler = useAddNodeTool('real')
        mediator.register('add-real-node', handler)
        mediator.activate('add-real-node')
        expect(mediator.activeToolId.value).toBe('add-real-node')

        mediator.onRightClick()
        // 右键始终触发 deactivate，恢复 default
        expect(mediator.activeToolId.value).toBe('default')
    })
})
