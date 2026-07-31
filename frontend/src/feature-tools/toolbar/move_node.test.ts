/**
 * feature-tools/toolbar/move-node.test.ts
 *
 * 功能：
 *
 *     移动节点工具（useMoveNodeTool）的单元测试。
 *     覆盖拾取放置状态机（idle ↔ picked）的全生命周期。
 *
 * 总体结构：
 *
 *     1. vi.mock useRenderer — 共享 mock 状态（vi.hoisted）
 *     2. 顶层 beforeEach — 重置 Pinia / localStorage 并加载金牌图
 *     3. 测试用例分组 — 生命周期 / 状态转换 / 放置 / 取消拾取 / 计算属性
 *
 * 规则：
 *
 *     1. 使用金牌图作为测试数据。
 *     2. 每个测试独立环境（beforeEach 重置 Pinia 和 localStorage）。
 *     3. useRenderer 被 vi.mock 拦截（Cytoscape 在 jsdom 下不可用）。
 *     4. trackCursor 的 mock 暴露回调句柄供测试手动触发以模拟光标位置。
 *     5. getNodePosition mock 对已知节点返回正确坐标，并在 setNodePosition 调用后更新。
 *     6. 执行方式：pnpm --filter frontend test 自动发现并执行本文件；独立运行追加 `-- move-node.test.ts`。
 */

import { setActivePinia, createPinia } from 'pinia'

import { useGraphStore } from '@/graph/graph_store'
import { saveGraph } from '@/graph/graph_persistence'
import { createGoldenTestGraphV2 } from '@/dev/test_case_factory'
import { useMoveNodeTool } from './move_node'
import { useRenderer } from '@/cytoscape/useRenderer'


// ── vi.hoisted：共享可变状态 ──
// 在 vi.mock factory 和测试代码间共享 capturedCallback、nodePositionsMap 和 stopFn。
// vi.mock 是文件级（影响本文件所有 import），vi.hoisted 保证变量提升次序正确。

const { capturedCallback, nodePositionsMap, stopFn } = vi.hoisted(() => {
    const capturedCallback:
        { current: ((pos: { x: number; y: number }) => void) | null }
        = { current: null }

    const nodePositionsMap = new Map<string, { x: number; y: number }>()

    const stopFn = vi.fn()

    // 金牌图节点坐标（按提示词文档表）
    nodePositionsMap.set('node-g1', { x: 50, y: 200 })
    nodePositionsMap.set('node-g2', { x: 350, y: 200 })
    nodePositionsMap.set('node-g3', { x: 650, y: 200 })
    nodePositionsMap.set('node-g4', { x: 950, y: 200 })
    nodePositionsMap.set('node-g5', { x: 50, y: 500 })
    nodePositionsMap.set('node-g6', { x: 350, y: 500 })

    return { capturedCallback, nodePositionsMap, stopFn }
})

// ── Mock useRenderer ──
// Cytoscape 需要 Canvas API，jsdom 不支持。唯一需要 mock 的边界。
//
// 关键：vi.fn() 实例在 factory 闭包中创建一次，每次 useRenderer() 返回同一个实例的引用。
// 这样 handler 内部和测试代码中调用 useRenderer() 获取的是同一份 mock 函数。

vi.mock('@/cytoscape/useRenderer', () => {
    const mockSetNodePosition = vi.fn(
        (nodeId: string, pos: { x: number; y: number }) => {
            nodePositionsMap.set(nodeId, pos)
        },
    )
    const mockGetNodePosition = vi.fn(
        (nodeId: string): { x: number; y: number } | null => {
            return nodePositionsMap.get(nodeId) ?? null
        },
    )
    const mockResetNodePosition = vi.fn()
    const mockAddNodeClass = vi.fn()
    const mockRemoveNodeClass = vi.fn()
    const mockClearAllPreviews = vi.fn()
    const mockTrackCursor = vi.fn(
        (cb: (pos: { x: number; y: number }) => void) => {
            capturedCallback.current = cb
            return { stop: stopFn }
        },
    )
    return {
        useRenderer: () => ({
            setNodePosition: mockSetNodePosition,
            getNodePosition: mockGetNodePosition,
            resetNodePosition: mockResetNodePosition,
            addNodeClass: mockAddNodeClass,
            removeNodeClass: mockRemoveNodeClass,
            clearAllPreviews: mockClearAllPreviews,
            trackCursor: mockTrackCursor,
        }),
    }
})


// ── 重置工具函数 ──

function resetNodePositionsToGolden(): void {
    nodePositionsMap.clear()
    nodePositionsMap.set('node-g1', { x: 50, y: 200 })
    nodePositionsMap.set('node-g2', { x: 350, y: 200 })
    nodePositionsMap.set('node-g3', { x: 650, y: 200 })
    nodePositionsMap.set('node-g4', { x: 950, y: 200 })
    nodePositionsMap.set('node-g5', { x: 50, y: 500 })
    nodePositionsMap.set('node-g6', { x: 350, y: 500 })
}


// ── 顶层 beforeEach：重置 Pinia + 持久化 + 加载金牌图 ──

beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    const golden = createGoldenTestGraphV2()
    saveGraph(golden)
    const store = useGraphStore()
    store.loadGraphToView(golden.id)

    vi.clearAllMocks()
    resetNodePositionsToGolden()
    capturedCallback.current = null
})


// ── 测试用例 ──

// ── activate / deactivate 生命周期 ──

describe('activate', () => {
    let handler: ReturnType<typeof useMoveNodeTool>

    beforeEach(() => {
        handler = useMoveNodeTool()
        handler.activate()
    })

    test('激活后 isActive 为 true', () => {
        expect(handler.isActive).toBe(true)
    })

    test('激活后 cursorClass 为 cursor-crosshair', () => {
        expect(handler.cursorClass).toBe('cursor-crosshair')
    })

    test('激活后 trackCursor 被调用', () => {
        const renderer = useRenderer()
        expect(renderer.trackCursor).toHaveBeenCalledTimes(1)
    })

    test('激活后 notification 为 null', () => {
        expect(handler.notification).toBeNull()
    })
})

describe('deactivate', () => {
    let handler: ReturnType<typeof useMoveNodeTool>

    beforeEach(() => {
        handler = useMoveNodeTool()
        handler.activate()
    })

    test('deactivate 后 isActive 为 false', () => {
        handler.deactivate()
        expect(handler.isActive).toBe(false)
    })

    test('deactivate 后 cursorClass 为 null', () => {
        handler.deactivate()
        expect(handler.cursorClass).toBeNull()
    })

    test('deactivate 后 trackCursor stop 被调用', () => {
        handler.deactivate()
        expect(stopFn).toHaveBeenCalledTimes(1)
    })

    test('deactivate 重置后再次 activate 状态正确', () => {
        // 第一次 activate → deactivate
        handler.deactivate()
        expect(handler.isActive).toBe(false)
        expect(handler.cursorClass).toBeNull()

        // 第二次 activate
        handler.activate()
        expect(handler.isActive).toBe(true)
        expect(handler.cursorClass).toBe('cursor-crosshair')
        const renderer = useRenderer()
        // trackCursor 应在每次 activate 被调用
        expect(renderer.trackCursor).toHaveBeenCalledTimes(2)
    })
})


// ── idle → picked 状态转换（onNodeClick） ──

describe('idle → picked', () => {
    let handler: ReturnType<typeof useMoveNodeTool>

    beforeEach(() => {
        handler = useMoveNodeTool()
        handler.activate()
    })

    test('onNodeClick 拾取后 addNodeClass move-picked 被调用', () => {
        const renderer = useRenderer()
        handler.onNodeClick!('node-g1')

        expect(renderer.addNodeClass).toHaveBeenCalledWith(
            'node-g1', 'move-picked', 'move',
        )
    })

    test('onNodeClick 拾取后 setNodePosition 吸附到当前光标位置', () => {
        const renderer = useRenderer()

        // 先模拟光标移动到 (300, 400)
        capturedCallback.current!({ x: 300, y: 400 })
        handler.onNodeClick!('node-g1')

        expect(renderer.setNodePosition).toHaveBeenCalledWith(
            'node-g1', { x: 300, y: 400 },
        )
    })

    // 注：onNodeClick 无 isActive 守卫，未激活时调用同样触发拾取逻辑。
})


// ── picked → idle 放置成功（无碰撞） ──

describe('picked → idle 无碰撞放置', () => {
    let handler: ReturnType<typeof useMoveNodeTool>

    beforeEach(() => {
        handler = useMoveNodeTool()
        handler.activate()

        // 进入 picked 状态：光标在 (2000, 2000) → 拾取 node-g1
        capturedCallback.current!({ x: 2000, y: 2000 })
        handler.onNodeClick!('node-g1')

        // 此时 node-g1 在 mock 中的位置已更新为 { x: 2000, y: 2000 }
        // （setNodePosition 将 lastModelPos 写入 nodePositionsMap）
    })

    test('无碰撞放置后 commitBatchToGraph 被调用', () => {
        const store = useGraphStore()
        const nodeBefore = store.graphView!.nodes.find(
            n => n.id === 'node-g1',
        )!
        // 验证原始位置
        expect(nodeBefore.position).toEqual({ x: 50, y: 200 })

        // 在远离所有已有节点的位置放置
        handler.onCanvasClick!({ x: 2000, y: 2000 })

        // 验证 graphView 中节点位置已更新
        const nodeAfter = store.graphView!.nodes.find(
            n => n.id === 'node-g1',
        )!
        expect(nodeAfter.position).toEqual({ x: 2000, y: 2000 })
    })

    test('无碰撞放置后 removeNodeClass move-picked 被调用', () => {
        const renderer = useRenderer()
        handler.onCanvasClick!({ x: 2000, y: 2000 })

        expect(renderer.removeNodeClass).toHaveBeenCalledWith(
            'node-g1', 'move-picked', 'move',
        )
    })

    test('无碰撞放置后 isActive 仍为 true（工具未停用）', () => {
        handler.onCanvasClick!({ x: 2000, y: 2000 })
        expect(handler.isActive).toBe(true)
    })

    test('无碰撞放置后 cursorClass 回到 cursor-crosshair', () => {
        handler.onCanvasClick!({ x: 2000, y: 2000 })
        expect(handler.cursorClass).toBe('cursor-crosshair')
    })

    test('无碰撞放置后 notification 为 null', () => {
        handler.onCanvasClick!({ x: 2000, y: 2000 })
        expect(handler.notification).toBeNull()
    })
})


// ── cancelPick（弹回） ──
//
// cancelPick 的触发路径：notification 的 onCancel 回调。
// notification 只有在碰撞后才非 null（collisionMessage 被设置）。
// 因此 beforeEach 需要触发一次碰撞放置使 notification 可用。

describe('cancelPick', () => {
    let handler: ReturnType<typeof useMoveNodeTool>

    beforeEach(() => {
        handler = useMoveNodeTool()
        handler.activate()

        // 进入 picked 状态：光标移动到 node-g2 所在位置 (350, 200)
        // 后续触发放置时 getNodePosition 将返回此位置 → 与 node-g2 碰撞
        capturedCallback.current!({ x: 350, y: 200 })
        handler.onNodeClick!('node-g1')

        // 触发放置尝试 → 引擎检测到碰撞 → collisionMessage 被设置 → notification 非 null
        handler.onCanvasClick!({ x: 350, y: 200 })
    })

    test('碰撞后 notification 非 null（前置条件验证）', () => {
        expect(handler.notification).not.toBeNull()
        expect(handler.notification!.visible).toBe(true)
        expect(handler.notification!.message).toContain('碰撞')
    })

    test('cancelPick 调用 resetNodePosition', () => {
        const renderer = useRenderer()
        handler.notification!.onCancel()

        expect(renderer.resetNodePosition).toHaveBeenCalledWith('node-g1')
    })

    test('cancelPick 调用 clearAllPreviews move', () => {
        const renderer = useRenderer()
        handler.notification!.onCancel()

        expect(renderer.clearAllPreviews).toHaveBeenCalledWith('move')
    })

    test('cancelPick 后 cursorClass 回到 cursor-crosshair', () => {
        handler.notification!.onCancel()
        expect(handler.cursorClass).toBe('cursor-crosshair')
    })

    test('cancelPick 后 notification 为 null', () => {
        handler.notification!.onCancel()
        expect(handler.notification).toBeNull()
    })

    test('deactivate 在 picked 状态时触发弹回', () => {
        const renderer = useRenderer()
        handler.deactivate()

        // deactivate 内部先调 tracking.stop()，再调 cancelPick()
        // cancelPick 调 resetNodePosition + clearAllPreviews
        expect(renderer.resetNodePosition).toHaveBeenCalledWith('node-g1')
        expect(renderer.clearAllPreviews).toHaveBeenCalledWith('move')
        expect(stopFn).toHaveBeenCalledTimes(1)
    })
})


// ── cursorClass / notification 计算属性 ──

describe('cursorClass / notification 计算属性', () => {
    // 未激活状态
    describe('未激活', () => {
        let handler: ReturnType<typeof useMoveNodeTool>

        beforeEach(() => {
            handler = useMoveNodeTool()
            // 不调 activate
        })

        test('未激活时 cursorClass 为 null', () => {
            expect(handler.cursorClass).toBeNull()
        })

        test('未激活时 notification 为 null', () => {
            expect(handler.notification).toBeNull()
        })
    })

    // 激活且未拾取
    describe('激活且未拾取', () => {
        let handler: ReturnType<typeof useMoveNodeTool>

        beforeEach(() => {
            handler = useMoveNodeTool()
            handler.activate()
        })

        test('激活且未拾取时 cursorClass 为 cursor-crosshair', () => {
            expect(handler.cursorClass).toBe('cursor-crosshair')
        })

        test('激活且未拾取时 notification 为 null', () => {
            expect(handler.notification).toBeNull()
        })
    })
})
