/**
 * feature-tools/toolbar/add_edge.test.ts
 *
 * 功能：
 *
 *     添加边工具（useAddEdgeTool）的单元测试。
 *     覆盖激活、两次点击添加边、hover 预览渲染与 class 施加、碰撞拦截、
 *     连续添加、停用、光标切换与四种变体。
 *
 * 总体结构：
 *
 *     1. vi.mock useRenderer / previewAddEdge — 共享 mock 状态（vi.hoisted）
 *     2. 顶层 beforeEach — 重置 Pinia / localStorage 并加载金牌图
 *     3. 测试用例分组 — 生命周期 / 点击流程 / hover 预览 / 碰撞拦截 / 计算属性 / 四种变体
 *
 * 规则：
 *
 *     1. 使用金牌图作为测试数据。
 *     2. 每个测试独立环境（beforeEach 重置 Pinia 和 localStorage）。
 *     3. useRenderer 被 vi.mock 拦截（Cytoscape 在 jsdom 下不可用）。
 *     4. previewAddEdge 被 vi.mock 拦截——handler 只关心其返回值的分支行为，
 *        碰撞判定本身的正确性由 preview_engine.test.ts 覆盖。
 *     5. 执行方式：pnpm --filter frontend test 自动发现并执行本文件。
 */

import { setActivePinia, createPinia } from 'pinia'

import { useGraphStore } from '@/graph/graph_store'
import { saveGraph } from '@/graph/graph_persistence'
import { createGoldenTestGraphV2 } from '@/dev/test_case_factory'
import { useAddEdgeTool } from './add_edge'

// ── vi.hoisted：共享 mock 函数 ──
// vi.mock 是文件级，vi.hoisted 保证 mock 函数在 factory 闭包与测试代码间共享同一实例。

const {
    mockPreviewAddEdge,
    mockSyncFromGraphData,
    mockAddNodeClass,
    mockClearAllPreviews,
} = vi.hoisted(() => ({
    mockPreviewAddEdge: vi.fn(),
    mockSyncFromGraphData: vi.fn(),
    mockAddNodeClass: vi.fn(),
    mockClearAllPreviews: vi.fn(),
}))

vi.mock('@/cytoscape/useRenderer', () => ({
    useRenderer: () => ({
        syncFromGraphData: mockSyncFromGraphData,
        addNodeClass: mockAddNodeClass,
        clearAllPreviews: mockClearAllPreviews,
    }),
}))

vi.mock('@/feature-tools/preview/preview_engine', () => ({
    previewAddEdge: mockPreviewAddEdge,
}))

// ── 顶层 beforeEach：重置 Pinia + 持久化 + 加载金牌图 ──

beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    const golden = createGoldenTestGraphV2()
    saveGraph(golden)
    const store = useGraphStore()
    store.loadGraphToView(golden.id)

    vi.clearAllMocks()

    // 默认预览结果：有效、无碰撞（previewGraph 透传当前 graphView 即可，sync 是 mock）
    mockPreviewAddEdge.mockImplementation(() => ({
        previewGraph: useGraphStore().graphView,
        valid: true,
        sourceCollides: false,
        targetCollides: false,
    }))
})

// ── 生命周期 ──

describe('useAddEdgeTool', () => {
    let handler: ReturnType<typeof useAddEdgeTool>

    beforeEach(() => {
        handler = useAddEdgeTool('real', 'directed')
        handler.activate()
    })

    test('激活后 isActive 为 true', () => {
        expect(handler.isActive).toBe(true)
    })

    test('首次 onNodeClick 记录 source 并施加起点高亮', () => {
        handler.onNodeClick!('node-g1')
        expect(mockAddNodeClass).toHaveBeenCalledWith(
            'node-g1',
            'edge-source-target',
            'add-edge',
        )
    })

    test('cursorClass 变化', () => {
        expect(handler.cursorClass).toBe('cursor-crosshair')
        handler.onNodeClick!('node-g1')
        expect(handler.cursorClass).toBe('cursor-cell')
    })

    test('deactivate 非预览态不冗余 sync，仅清 class 与状态', () => {
        handler.onNodeClick!('node-g1')
        handler.deactivate()

        expect(mockClearAllPreviews).toHaveBeenCalledWith('add-edge')
        expect(mockSyncFromGraphData).not.toHaveBeenCalled()
        expect(handler.isActive).toBe(false)
    })

    test('deactivate 在预览态时切回真实图', () => {
        handler.onNodeClick!('node-g1')
        handler.onNodeHover!('node-g6') // 进入预览态（hoverTargetId 置位）
        handler.deactivate()

        expect(mockClearAllPreviews).toHaveBeenCalledWith('add-edge')
        expect(mockSyncFromGraphData).toHaveBeenCalledWith(
            useGraphStore().graphView,
        )
        expect(handler.isActive).toBe(false)
    })

    test('deactivate 后可再次激活', () => {
        handler.deactivate()
        handler.activate()
        expect(handler.isActive).toBe(true)
    })
})

// ── 两次点击流程 ──

describe('两次点击添加边', () => {
    let handler: ReturnType<typeof useAddEdgeTool>

    beforeEach(() => {
        handler = useAddEdgeTool('real', 'directed')
        handler.activate()
    })

    test('两次 onNodeClick 添加边', () => {
        handler.onNodeClick!('node-g1')
        handler.onNodeClick!('node-g6')

        const store = useGraphStore()
        expect(store.graphView!.edges.length).toBe(5)
    })

    test('第二次点击前调用 previewAddEdge 做碰撞校验', () => {
        handler.onNodeClick!('node-g1')
        const graphBefore = useGraphStore().graphView
        handler.onNodeClick!('node-g6')

        expect(mockPreviewAddEdge).toHaveBeenCalledWith(graphBefore, {
            sourceId: 'node-g1',
            targetId: 'node-g6',
            kind: 'real',
            direction: 'directed',
        })
    })

    test('添加成功后清空预览并复位 source', () => {
        handler.onNodeClick!('node-g1')
        handler.onNodeClick!('node-g6')

        expect(mockClearAllPreviews).toHaveBeenCalledWith('add-edge')
        // source 复位后，下一次点击应重新记录 source
        handler.onNodeClick!('node-g2')
        expect(mockAddNodeClass).toHaveBeenLastCalledWith(
            'node-g2',
            'edge-source-target',
            'add-edge',
        )
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

    test('点击 source 自身被忽略（不创建自环）', () => {
        handler.onNodeClick!('node-g1')
        handler.onNodeClick!('node-g1')

        const store = useGraphStore()
        expect(store.graphView!.edges.length).toBe(4)
    })

    test('碰撞时点击被忽略且 source 保持可重试', () => {
        handler.onNodeClick!('node-g1')
        mockPreviewAddEdge.mockReturnValue({
            previewGraph: useGraphStore().graphView,
            valid: true,
            sourceCollides: true,
            targetCollides: false,
        })
        handler.onNodeClick!('node-g6')

        const store = useGraphStore()
        expect(store.graphView!.edges.length).toBe(4)
        // source 保持选中 → 光标仍为 cell，且未触发成功清空
        expect(handler.cursorClass).toBe('cursor-cell')
        expect(mockClearAllPreviews).not.toHaveBeenCalledWith('add-edge')
    })

    test('校验失败时点击被忽略', () => {
        handler.onNodeClick!('node-g1')
        mockPreviewAddEdge.mockReturnValue({
            previewGraph: useGraphStore().graphView,
            valid: false,
            sourceCollides: false,
            targetCollides: false,
        })
        handler.onNodeClick!('node-g6')

        const store = useGraphStore()
        expect(store.graphView!.edges.length).toBe(4)
        expect(handler.cursorClass).toBe('cursor-cell')
    })
})

// ── hover 预览 ──

describe('hover 预览', () => {
    let handler: ReturnType<typeof useAddEdgeTool>

    beforeEach(() => {
        handler = useAddEdgeTool('real', 'directed')
        handler.activate()
    })

    test('source 未选中时 hover 不产生预览', () => {
        handler.onNodeHover!('node-g6')

        expect(mockPreviewAddEdge).not.toHaveBeenCalled()
        expect(mockSyncFromGraphData).not.toHaveBeenCalled()
    })

    test('hover 自身不产生预览', () => {
        handler.onNodeClick!('node-g1')
        handler.onNodeHover!('node-g1')

        expect(mockPreviewAddEdge).not.toHaveBeenCalled()
    })

    test('hover 到目标节点切换预览图并重施 source 高亮', () => {
        handler.onNodeClick!('node-g1')
        handler.onNodeHover!('node-g6')

        expect(mockSyncFromGraphData).toHaveBeenCalledWith(
            useGraphStore().graphView,
        )
        expect(mockAddNodeClass).toHaveBeenCalledWith(
            'node-g1',
            'edge-source-target',
            'add-edge',
        )
    })

    test('hover 后 previewAddEdge 以正确 kind/direction 调用', () => {
        handler.onNodeClick!('node-g1')
        handler.onNodeHover!('node-g6')

        expect(mockPreviewAddEdge).toHaveBeenCalledWith(
            useGraphStore().graphView,
            {
                sourceId: 'node-g1',
                targetId: 'node-g6',
                kind: 'real',
                direction: 'directed',
            },
        )
    })

    test('source 碰撞时施加 preview-collision', () => {
        handler.onNodeClick!('node-g1')
        mockPreviewAddEdge.mockReturnValue({
            previewGraph: useGraphStore().graphView,
            valid: true,
            sourceCollides: true,
            targetCollides: false,
        })
        handler.onNodeHover!('node-g6')

        expect(mockAddNodeClass).toHaveBeenCalledWith(
            'node-g1',
            'preview-collision',
            'add-edge',
        )
        expect(mockAddNodeClass).not.toHaveBeenCalledWith(
            'node-g6',
            'preview-collision',
            'add-edge',
        )
    })

    test('target 碰撞时施加 preview-collision', () => {
        handler.onNodeClick!('node-g1')
        mockPreviewAddEdge.mockReturnValue({
            previewGraph: useGraphStore().graphView,
            valid: true,
            sourceCollides: false,
            targetCollides: true,
        })
        handler.onNodeHover!('node-g6')

        expect(mockAddNodeClass).toHaveBeenCalledWith(
            'node-g6',
            'preview-collision',
            'add-edge',
        )
        expect(mockAddNodeClass).not.toHaveBeenCalledWith(
            'node-g1',
            'preview-collision',
            'add-edge',
        )
    })

    test('valid=false 时不切换预览图', () => {
        handler.onNodeClick!('node-g1')
        mockPreviewAddEdge.mockReturnValue({
            previewGraph: useGraphStore().graphView,
            valid: false,
            sourceCollides: false,
            targetCollides: false,
        })
        handler.onNodeHover!('node-g6')

        expect(mockSyncFromGraphData).not.toHaveBeenCalled()
    })

    test('hover 离开切回真实图并保持 source 高亮', () => {
        handler.onNodeClick!('node-g1')
        handler.onNodeHover!('node-g6')
        handler.onNodeHoverOut!('node-g6')

        expect(mockClearAllPreviews).toHaveBeenCalledWith('add-edge')
        expect(mockSyncFromGraphData).toHaveBeenLastCalledWith(
            useGraphStore().graphView,
        )
        expect(mockAddNodeClass).toHaveBeenLastCalledWith(
            'node-g1',
            'edge-source-target',
            'add-edge',
        )
    })
})

// ── 四种变体 ──

describe('四种变体', () => {
    const variants = [
        ['real', 'directed', 'add-real-directed'],
        ['real', 'undirected', 'add-real-undirected'],
        ['virtual', 'directed', 'add-virtual-directed'],
        ['virtual', 'undirected', 'add-virtual-undirected'],
    ] as const

    test.each(variants)(
        '%s-%s 的 id 正确且两次点击可加边',
        (kind, direction, expectedId) => {
            const h = useAddEdgeTool(kind, direction)
            expect(h.id).toBe(expectedId)
            h.activate()

            h.onNodeClick!('node-g1')
            const graphBefore = useGraphStore().graphView
            h.onNodeClick!('node-g6')

            const store = useGraphStore()
            expect(store.graphView!.edges.length).toBe(5)
            expect(mockPreviewAddEdge).toHaveBeenCalledWith(graphBefore, {
                sourceId: 'node-g1',
                targetId: 'node-g6',
                kind,
                direction,
            })
        },
    )
})
