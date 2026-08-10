/**
 * cy_popper 锚定模块单元测试。
 *
 * @remarks
 * 覆盖：扩展注册幂等、popperFactory 的 middleware 组成（flip + shift(limitShift)）、
 * attachElementPopper 的 update/destroy 契约与事件绑定、边锚定默认中点行为、
 * 目标不存在时 no-op 兜底。测试边界：
 * - computePosition 被 mock（捕获调用参数）；flip / shift / limitShift 保持真实实现，
 *   以便验证 middleware 组成
 * - attachElementPopper 使用 mock cy（getElementById / on / off / popper）
 */

import {
    attachElementPopper,
    popperFactory,
    registerPopperExtension,
} from './cy_popper'

import type { Core } from 'cytoscape'

const { mockComputePosition } = vi.hoisted(() => ({
    mockComputePosition: vi.fn(),
}))

vi.mock('@floating-ui/dom', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@floating-ui/dom')>()
    return {
        ...actual,
        computePosition: mockComputePosition,
    }
})

describe('registerPopperExtension', () => {
    test('可重复调用不抛错（cytoscape 重复注册扩展为覆盖写）', () => {
        expect(() => {
            registerPopperExtension()
            registerPopperExtension()
        }).not.toThrow()
    })
})

describe('popperFactory', () => {
    test('middleware 含 flip + shift(limiter: limitShift)，初始定位写入 left/top', async () => {
        const content = document.createElement('div')
        const ref = {
            getBoundingClientRect: () => ({
                left: 0,
                top: 0,
                width: 10,
                height: 10,
                right: 10,
                bottom: 10,
            }),
        }

        mockComputePosition.mockResolvedValue({ x: 100, y: 200 })

        const handle = popperFactory(
            ref as unknown as Pick<Element, 'getBoundingClientRect'>,
            content,
        )
        handle.update()

        expect(mockComputePosition).toHaveBeenCalledTimes(2)

        const options = mockComputePosition.mock.calls.at(-1)![2]
        const middleware = options.middleware as Array<{
            name: string
            options?: { limiter?: unknown }
        }>

        // 缺省 placement 必须为 'right'（"目标右侧"验收契约；floating-ui 默认是 'bottom'）
        expect(options.placement).toBe('right')

        // 缺省 strategy 必须为 'fixed'（相对视口定位——absolute 会让超出视口的
        // 浮窗撑大文档触发滚动条，fixed 不撑大文档、浮窗钉在视口位置）
        expect(options.strategy).toBe('fixed')

        expect(middleware.some((m) => m.name === 'flip')).toBe(true)

        const shiftMiddleware = middleware.find((m) => m.name === 'shift')
        expect(shiftMiddleware).toBeDefined()
        // limitShift() 返回 middleware 对象（{ fn, options }）——shift 的 limiter 必须是它（视口边缘不截断）
        expect(shiftMiddleware?.options?.limiter).toBeDefined()

        // computePosition 异步：等待微任务后断言 left/top 已写入
        await Promise.resolve()
        await Promise.resolve()
        expect(content.style.left).toBe('100px')
        expect(content.style.top).toBe('200px')
    })

    test('调用方 options 可覆盖 middleware', () => {
        const content = document.createElement('div')
        const ref = {
            getBoundingClientRect: () => ({
                left: 0,
                top: 0,
                width: 10,
                height: 10,
                right: 10,
                bottom: 10,
            }),
        }

        mockComputePosition.mockResolvedValue({ x: 0, y: 0 })

        popperFactory(
            ref as unknown as Pick<Element, 'getBoundingClientRect'>,
            content,
            { middleware: [] },
        )

        const options = mockComputePosition.mock.calls.at(-1)![2]
        expect(options.middleware).toEqual([])
    })

    test('调用方显式传 options.placement 可覆盖默认 right', () => {
        const content = document.createElement('div')
        const ref = {
            getBoundingClientRect: () => ({
                left: 0,
                top: 0,
                width: 10,
                height: 10,
                right: 10,
                bottom: 10,
            }),
        }

        mockComputePosition.mockResolvedValue({ x: 0, y: 0 })

        popperFactory(
            ref as unknown as Pick<Element, 'getBoundingClientRect'>,
            content,
            { placement: 'bottom-start' },
        )

        const options = mockComputePosition.mock.calls.at(-1)![2]
        expect(options.placement).toBe('bottom-start')
    })
})

describe('attachElementPopper', () => {
    test('返回 update/destroy；update 调 popper.update；destroy 解绑事件并清理 popper', () => {
        const mockUpdate = vi.fn()
        const mockPopperDestroy = vi.fn()
        const mockEleOn = vi.fn()
        const mockEleOff = vi.fn()
        const mockCyOn = vi.fn()
        const mockCyOff = vi.fn()

        const mockPopper = vi.fn(() => ({
            update: mockUpdate,
            destroy: mockPopperDestroy,
        }))
        const ele = {
            length: 1,
            popper: mockPopper,
            on: mockEleOn,
            off: mockEleOff,
        }
        const cy = {
            getElementById: vi.fn(() => ele),
            on: mockCyOn,
            off: mockCyOff,
        }

        const contentEl = document.createElement('div')
        const handle = attachElementPopper(
            cy as unknown as Core,
            'node-g1',
            contentEl,
        )

        expect(cy.getElementById).toHaveBeenCalledWith('node-g1')
        // content 传入 + popper 选项；不覆盖 renderedPosition（沿用扩展默认锚点）
        expect(mockPopper).toHaveBeenCalledWith({
            content: contentEl,
            popper: undefined,
        })
        expect(mockEleOn).toHaveBeenCalledWith('position', expect.any(Function))
        expect(mockCyOn).toHaveBeenCalledWith(
            'pan zoom resize',
            expect.any(Function),
        )

        handle.update()
        expect(mockUpdate).toHaveBeenCalledTimes(1)

        handle.destroy()
        expect(mockEleOff).toHaveBeenCalledWith(
            'position',
            undefined,
            expect.any(Function),
        )
        expect(mockCyOff).toHaveBeenCalledWith(
            'pan zoom resize',
            expect.any(Function),
        )
        expect(mockPopperDestroy).toHaveBeenCalledTimes(1)
    })

    test('边锚定：不覆盖 renderedPosition，沿用 cytoscape-popper 默认包围盒中心（即中点）', () => {
        const mockPopper = vi.fn((_opts: Record<string, unknown>) => ({
            update: vi.fn(),
        }))
        const ele = { length: 1, popper: mockPopper, on: vi.fn(), off: vi.fn() }
        const cy = {
            getElementById: vi.fn(() => ele),
            on: vi.fn(),
            off: vi.fn(),
        }

        const contentEl = document.createElement('div')
        attachElementPopper(cy as unknown as Core, 'edge-g12', contentEl)

        const popperOpts = mockPopper.mock.calls[0]![0]
        expect(popperOpts.content).toBe(contentEl)
        expect(popperOpts.renderedPosition).toBeUndefined()
    })

    test('目标元素不存在时返回 no-op 句柄，不抛错、不绑定事件', () => {
        const cy = {
            getElementById: vi.fn(() => ({ length: 0 })),
            on: vi.fn(),
            off: vi.fn(),
        }

        const contentEl = document.createElement('div')
        const handle = attachElementPopper(
            cy as unknown as Core,
            'missing',
            contentEl,
        )

        expect(() => {
            handle.update()
            handle.destroy()
        }).not.toThrow()
        expect(cy.on).not.toHaveBeenCalled()
    })
})
