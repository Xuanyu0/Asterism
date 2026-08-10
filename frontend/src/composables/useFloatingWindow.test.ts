/**
 * useFloatingWindow.test.ts
 *
 * 功能：
 *     浮空窗状态单例（useFloatingWindow）的单元测试。
 *     覆盖单例性、open/close 状态流转、clearValidationResult 联动、外部点击关闭规则。
 *
 * 规则：
 *     1. 单例在文件级共享（模块级单例），各测试通过 close + registerContainer(null) 复位。
 *     2. graphStore 使用真实 Pinia store，clearValidationResult 用 spy 断言。
 */

import { setActivePinia, createPinia } from 'pinia'

import { useGraphStore } from '@/graph/graph_store'
import { useFloatingWindow } from './useFloatingWindow'

import type { NodeData } from '@my-project/graph-engine'

const fixtureNode: NodeData = {
    id: 'node-1',
    graphId: 'graph-1',
    role: 'knowledge',
    kind: 'real',
    label: '测试节点',
    degree: 0,
    abstractionLevel: 0,
}

describe('useFloatingWindow', () => {
    let floatingWindow: ReturnType<typeof useFloatingWindow>

    beforeEach(() => {
        setActivePinia(createPinia())
        floatingWindow = useFloatingWindow()
        floatingWindow.close()
        floatingWindow.registerContainer(null)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    test('模块级单例：多次调用返回同一实例', () => {
        const another = useFloatingWindow()
        expect(another).toBe(floatingWindow)
    })

    test('open 写入展示数据，close 置空', () => {
        floatingWindow.open(fixtureNode)
        // ref 包裹的对象是 reactive proxy，用 toEqual 断言内容一致
        expect(floatingWindow.floatingData.value).toEqual(fixtureNode)

        floatingWindow.close()
        expect(floatingWindow.floatingData.value).toBeNull()
    })

    test('close 触发 clearValidationResult 联动', () => {
        const store = useGraphStore()
        const spy = vi.spyOn(store, 'clearValidationResult')

        floatingWindow.open(fixtureNode)
        floatingWindow.close()

        expect(spy).toHaveBeenCalledTimes(1)
        expect(floatingWindow.floatingData.value).toBeNull()
    })

    test('容器内 pointerdown 不关闭浮空窗', () => {
        floatingWindow.open(fixtureNode)

        const container = document.createElement('div')
        floatingWindow.registerContainer(container)

        // jsdom 无 PointerEvent，用 MouseEvent 代替（监听器只读 event.target）
        container.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))

        expect(floatingWindow.floatingData.value).toEqual(fixtureNode)
    })

    test('容器外 pointerdown 关闭浮空窗', () => {
        floatingWindow.open(fixtureNode)

        const container = document.createElement('div')
        floatingWindow.registerContainer(container)

        window.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))

        expect(floatingWindow.floatingData.value).toBeNull()
    })

    test('容器未注册时任意 pointerdown 关闭浮空窗', () => {
        floatingWindow.open(fixtureNode)

        floatingWindow.registerContainer(null)
        window.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))

        expect(floatingWindow.floatingData.value).toBeNull()
    })

    test('浮空窗未打开时 pointerdown 不触发 clearValidationResult', () => {
        const store = useGraphStore()
        const spy = vi.spyOn(store, 'clearValidationResult')

        // 未 open（floatingData 为 null），任意外部点击应被守卫拦截，不产生副作用
        window.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))

        expect(spy).not.toHaveBeenCalled()
    })
})
