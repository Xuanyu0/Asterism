/**
 * tests/toolbar/fold.test.ts
 *
 * 功能：
 *     折叠/展开工具（useFoldTool）的集成测试。
 *     覆盖激活、折叠节点、展开节点、非依赖节点、停用。
 *
 * 规则：
 *     1. 使用金牌图作为测试数据。
 *     2. 每个测试独立环境（beforeEach 重置 store 单例和 localStorage）。
 */

import { useGraphStore, resetGraphStoreForTests } from '@/graph/graph_store'
import { saveGraph } from '@/graph/graph_persistence'
import { createGoldenTestGraphV2 } from '@/dev/test_case_factory'
import { useFoldTool } from './fold'

beforeEach(() => {
    resetGraphStoreForTests()
    localStorage.clear()
    const golden = createGoldenTestGraphV2()
    saveGraph(golden)
    const store = useGraphStore()
    store.loadGraphToView(golden.id)
})

describe('useFoldTool', () => {
    let handler: ReturnType<typeof useFoldTool>

    beforeEach(() => {
        handler = useFoldTool()
        handler.activate()
    })

    test('激活后 isActive 为 true', () => {
        expect(handler.isActive).toBe(true)
    })

    test('onNodeClick 折叠节点', () => {
        handler.onNodeClick!('node-g2')

        const store = useGraphStore()
        expect(
            store.graphView!.cognitiveState?.foldedDependencies.length,
        ).toBeGreaterThan(0)
    })

    test('再次点击同一节点展开', () => {
        handler.onNodeClick!('node-g2')

        const store = useGraphStore()
        const foldCount =
            store.graphView!.cognitiveState?.foldedDependencies.length ?? 0
        expect(foldCount).toBeGreaterThan(0)

        // 再次点击同一个节点展开
        handler.onNodeClick!('node-g2')
        expect(store.graphView!.cognitiveState?.foldedDependencies.length).toBe(
            0,
        )
    })

    test('折叠非依赖节点不改变 foldedDependencies', () => {
        const store = useGraphStore()
        const before =
            store.graphView!.cognitiveState?.foldedDependencies.length ?? 0
        handler.onNodeClick!('node-g6')
        const after =
            store.graphView!.cognitiveState?.foldedDependencies.length ?? 0
        expect(after).toBe(before)
    })

    test('deactivate 取消激活', () => {
        handler.deactivate()
        expect(handler.isActive).toBe(false)
    })
})
