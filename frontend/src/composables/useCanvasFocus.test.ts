/**
 * useCanvasFocus.test.ts
 *
 * 功能：
 *     画布视口定位请求单例（useCanvasFocus）的单元测试。
 *     覆盖单例性、写入→读取闭环、清除、清除后可重复触发。
 *
 * 规则：
 *     1. 单例在文件级共享（模块级单例），各测试通过 clearCanvasFocus 复位。
 */

import { useCanvasFocus } from './useCanvasFocus'

describe('useCanvasFocus', () => {
    let canvasFocus: ReturnType<typeof useCanvasFocus>

    beforeEach(() => {
        canvasFocus = useCanvasFocus()
        canvasFocus.clearCanvasFocus()
    })

    test('模块级单例：多次调用返回同一实例', () => {
        const another = useCanvasFocus()
        expect(another).toBe(canvasFocus)
    })

    test('requestCanvasFocus 写入后 pendingCanvasFocusId 等于目标 ID', () => {
        canvasFocus.requestCanvasFocus('node-42')
        expect(canvasFocus.pendingCanvasFocusId.value).toBe('node-42')
    })

    test('clearCanvasFocus 清除后回 null', () => {
        canvasFocus.requestCanvasFocus('node-42')
        canvasFocus.clearCanvasFocus()
        expect(canvasFocus.pendingCanvasFocusId.value).toBeNull()
    })

    test('清除后可再次写入', () => {
        canvasFocus.requestCanvasFocus('node-1')
        canvasFocus.clearCanvasFocus()
        canvasFocus.requestCanvasFocus('node-2')
        expect(canvasFocus.pendingCanvasFocusId.value).toBe('node-2')
    })
})
