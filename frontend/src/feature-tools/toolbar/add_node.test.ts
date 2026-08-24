/**
 * tests/toolbar/add-node.test.ts
 *
 * 功能：
 *     添加节点工具（useAddNodeTool）的集成测试。
 *     覆盖激活、光标实时预览（含碰撞高亮）、画布点击创建草稿、提交确认、
 *     空标签拒绝、取消和停用。
 *
 * 规则：
 *     1. 使用金牌图作为测试数据。
 *     2. 每个测试独立环境（beforeEach 重置 store 单例和 localStorage）。
 *     3. useRenderer 被 vi.mock 拦截（Cytoscape 在 jsdom 下不可用），
 *        trackCursor 的 mock 暴露回调句柄供测试手动触发以模拟光标位置。
 *     4. previewAddNode 被 vi.mock 拦截——handler 只关心其返回值的分支行为，
 *        碰撞判定本身的正确性由 preview_engine.test.ts 覆盖。
 */

import { useGraphStore, resetGraphStoreForTests } from '@/graph/graph_store'
import { useLifecycle } from '@/graph/use-case/useLifecycle'
import { saveGraph } from '@/graph/graph_persistence'
import { createGoldenTestGraphV2 } from '@/dev/test_case_factory'
import { useAddNodeTool } from './add_node'

import type { NodeId } from '@my-project/graph-engine'

// ── vi.hoisted：共享 mock 状态 ──
// 在 vi.mock factory 和测试代码间共享 mockPreviewAddNode 等函数与 capturedCallback / stopFn。

const {
    mockPreviewAddNode,
    mockSyncFromGraphData,
    mockAddNodeClass,
    mockClearAllPreviews,
    mockTrackCursor,
    stopFn,
    capturedCallback,
} = vi.hoisted(() => {
    const capturedCallback: {
        current: ((pos: { x: number; y: number }) => void) | null
    } = { current: null }

    return {
        mockPreviewAddNode: vi.fn(),
        mockSyncFromGraphData: vi.fn(),
        mockAddNodeClass: vi.fn(),
        mockClearAllPreviews: vi.fn(),
        mockTrackCursor: vi.fn(
            (cb: (pos: { x: number; y: number }) => void) => {
                capturedCallback.current = cb
                return { stop: stopFn }
            },
        ),
        stopFn: vi.fn(),
        capturedCallback,
    }
})

// ── Mock useRenderer / previewAddNode ──
// Cytoscape 需要 Canvas API，jsdom 不支持。唯一需要 mock 的边界。

vi.mock('@/cytoscape/useRenderer', () => ({
    useRenderer: () => ({
        syncFromGraphData: mockSyncFromGraphData,
        addNodeClass: mockAddNodeClass,
        clearAllPreviews: mockClearAllPreviews,
        trackCursor: mockTrackCursor,
    }),
}))

vi.mock('@/feature-tools/preview/preview_engine', () => ({
    previewAddNode: mockPreviewAddNode,
}))

beforeEach(() => {
    resetGraphStoreForTests()
    localStorage.clear()
    const golden = createGoldenTestGraphV2()
    saveGraph(golden)
    // loadGraphToView 不再负责注册——先全量注册所有持久化图
    useLifecycle().registerAllGraphs()
    const store = useGraphStore()
    store.loadGraphToView(golden.id)

    vi.clearAllMocks()
    capturedCallback.current = null

    // 默认预览结果：有效、无碰撞
    mockPreviewAddNode.mockImplementation(() => ({
        previewGraph: useGraphStore().graphView,
        valid: true,
        collides: false,
        nodeId: 'preview-node-1' as NodeId,
    }))
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

    test('onCanvasClick 创建 DraftNode（含预览节点 nodeId，供浮空窗锚定）', () => {
        handler.onCanvasClick!({ x: 100, y: 200 })
        expect(handler.draftNode).not.toBeNull()
        expect(handler.draftNode!.nodeId).toBe('preview-node-1')
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

    test('空 label 提交由引擎拒绝（EMPTY_LABEL）', () => {
        handler.onCanvasClick!({ x: 999, y: 999 })
        handler.onConfirm!('', '摘要')

        const store = useGraphStore()
        expect(store.graphView!.nodes.length).toBe(6)
        expect(store.lastValidationResult).not.toBeNull()
        expect(store.lastValidationResult!.valid).toBe(false)
        expect(
            store.lastValidationResult!.issues.some(
                (issue) => issue.code === 'EMPTY_LABEL',
            ),
        ).toBe(true)
    })

    test('deactivate 清除草稿', () => {
        handler.onCanvasClick!({ x: 100, y: 200 })
        handler.deactivate()
        expect(handler.draftNode).toBeNull()
        expect(handler.isActive).toBe(false)
    })

    test('onCancel 清除草稿并清理预览', () => {
        handler.onCanvasClick!({ x: 100, y: 200 })
        handler.onCancel!()
        expect(handler.draftNode).toBeNull()
        expect(mockClearAllPreviews).toHaveBeenCalledWith('add-node')
        expect(mockSyncFromGraphData).toHaveBeenCalledWith(
            useGraphStore().graphView,
        )
    })
})

// ── 实时预览 ──

describe('useAddNodeTool 实时预览', () => {
    let handler: ReturnType<typeof useAddNodeTool>

    beforeEach(() => {
        handler = useAddNodeTool('real')
        handler.activate()
    })

    test('激活后 trackCursor 被调用', () => {
        expect(mockTrackCursor).toHaveBeenCalledTimes(1)
    })

    test('光标移动 → syncFromGraphData 收到预览图并施加 add-node-preview class', () => {
        capturedCallback.current!({ x: 100, y: 200 })

        expect(mockSyncFromGraphData).toHaveBeenCalledTimes(1)
        expect(mockAddNodeClass).toHaveBeenCalledWith(
            'preview-node-1',
            'add-node-preview',
            'add-node',
        )
        expect(mockAddNodeClass).not.toHaveBeenCalledWith(
            'preview-node-1',
            'preview-collision',
            'add-node',
        )
    })

    test('碰撞 → 叠加 preview-collision class', () => {
        mockPreviewAddNode.mockImplementation(() => ({
            previewGraph: useGraphStore().graphView,
            valid: true,
            collides: true,
            nodeId: 'preview-node-1' as NodeId,
        }))

        capturedCallback.current!({ x: 50, y: 200 })

        expect(mockAddNodeClass).toHaveBeenCalledWith(
            'preview-node-1',
            'add-node-preview',
            'add-node',
        )
        expect(mockAddNodeClass).toHaveBeenCalledWith(
            'preview-node-1',
            'preview-collision',
            'add-node',
        )
    })

    test('onCanvasClick 定格预览节点在点击位置并创建草稿，不清理预览', () => {
        capturedCallback.current!({ x: 100, y: 200 })
        handler.onCanvasClick!({ x: 100, y: 200 })

        // 预览节点定格：重新施加 preview class，不清理（confirm 前画布保留预览节点）
        expect(mockPreviewAddNode).toHaveBeenCalled()
        expect(mockAddNodeClass).toHaveBeenCalledWith(
            'preview-node-1',
            'add-node-preview',
            'add-node',
        )
        expect(mockClearAllPreviews).not.toHaveBeenCalled()
        expect(handler.draftNode).not.toBeNull()
    })

    test('点击碰撞位置 → 直接报错拒绝，不创建草稿', () => {
        mockPreviewAddNode.mockImplementation(() => ({
            previewGraph: useGraphStore().graphView,
            valid: true,
            collides: true,
            nodeId: 'preview-node-1' as NodeId,
        }))

        handler.onCanvasClick!({ x: 50, y: 200 })

        expect(handler.draftNode).toBeNull()
        expect(handler.notification).not.toBeNull()
        expect(handler.notification!.message).toContain('碰撞')
    })

    test('deactivate 停止追踪、清预览并切回真实图', () => {
        capturedCallback.current!({ x: 100, y: 200 })
        handler.deactivate()

        expect(stopFn).toHaveBeenCalledTimes(1)
        expect(mockClearAllPreviews).toHaveBeenCalledWith('add-node')
        expect(mockSyncFromGraphData).toHaveBeenCalledWith(
            useGraphStore().graphView,
        )
        expect(handler.draftNode).toBeNull()
        expect(handler.isActive).toBe(false)
    })

    test('草稿打开后光标移动不再触发预览', () => {
        handler.onCanvasClick!({ x: 100, y: 200 })
        const previewCallsBefore = mockPreviewAddNode.mock.calls.length
        const syncCallsBefore = mockSyncFromGraphData.mock.calls.length

        capturedCallback.current!({ x: 300, y: 300 })

        // onCanvasClick 已定格预览 1 次；草稿打开后光标移动不再新增预览调用
        expect(mockPreviewAddNode).toHaveBeenCalledTimes(previewCallsBefore)
        expect(mockSyncFromGraphData).toHaveBeenCalledTimes(syncCallsBefore)
    })
})
