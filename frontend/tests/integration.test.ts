/**
 * regression.test.ts
 *
 * 功能：
 *     前端 Runtime 回归测试。覆盖核心集成链路：
 *     GraphData 完整性校验、Store 加载、原子操作链路、
 *     fold/expand/undo、持久化往返。
 *
 * 规则：
 *     1. 只测 Runtime 层集成链路，不测引擎纯函数。
 *     2. 所有测试数据通过 test_case_factory 构造，不重复造数据。
 *     3. 每个 describe 独立环境，beforeEach 清零。
 */

import { setActivePinia, createPinia } from 'pinia'
import { useGraphStore } from '@/graph/graph_store'
import { useGraphOperationAdapter } from '@/graph/adapters/useGraphOperationAdapter'
import { saveGraph, loadGraph, deleteGraph, listRootGraphIds } from '@/graph/graph_persistence'
import { createGoldenTestGraphV2, createSilverTestGraph } from '@/dev/test_case_factory'
import { validateGraph } from '@my-project/graph-engine'
import type { NodeId } from '@my-project/graph-engine'


describe('数据合法性校验', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        localStorage.clear()
    })

    afterAll(() => {
        localStorage.clear()
    })

    test('金牌图通过全图所有全局规则校验', () => {
        const golden = createGoldenTestGraphV2()
        const result = validateGraph(golden)
        expect(result.valid).toBe(true)
    })

    test('银牌图通过全图所有全局规则校验', () => {
        const silver = createSilverTestGraph()
        const result = validateGraph(silver)
        expect(result.valid).toBe(true)
    })
})


describe('Store 加载', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        localStorage.clear()
    })

    afterAll(() => {
        localStorage.clear()
    })

    test('保存并加载金牌图后 graphView 不为 null', () => {
        const golden = createGoldenTestGraphV2()
        saveGraph(golden)
        const store = useGraphStore()
        const loaded = store.loadGraphToView(golden.id)
        expect(loaded).toBe(true)
        expect(store.graphView).not.toBeNull()
    })

    test('金牌图节点数 === 6', () => {
        const golden = createGoldenTestGraphV2()
        saveGraph(golden)
        const store = useGraphStore()
        store.loadGraphToView(golden.id)
        expect(store.graphView!.nodes.length).toBe(6)
    })

    test('金牌图边数 === 4', () => {
        const golden = createGoldenTestGraphV2()
        saveGraph(golden)
        const store = useGraphStore()
        store.loadGraphToView(golden.id)
        expect(store.graphView!.edges.length).toBe(4)
    })

    test('graphPath 长度 === 1', () => {
        const golden = createGoldenTestGraphV2()
        saveGraph(golden)
        const store = useGraphStore()
        store.loadGraphToView(golden.id)
        expect(store.graphPath.length).toBe(1)
    })
})


describe('原子操作链路', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        localStorage.clear()
    })

    afterAll(() => {
        localStorage.clear()
    })

    test('add_node：节点数从 6 变为 7', () => {
        const golden = createGoldenTestGraphV2()
        saveGraph(golden)
        const store = useGraphStore()
        store.loadGraphToView(golden.id)

        const result = useGraphOperationAdapter().commitToCurrentGraph([{
            type: 'add_node',
            node: {
                role: 'knowledge',
                id: 'reg-node-new' as NodeId,
                graphId: store.graphView!.id,
                kind: 'real',
                form: 'atomic',
                label: '回归测试节点',
                summary: '',
                abstractionLevel: 0,
                degree: 0,
                position: { x: 999, y: 999 },
            },
        }])

        expect(result.valid).toBe(true)
        expect(store.graphView!.nodes.length).toBe(7)
    })


})


describe('fold/expand + undo', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        localStorage.clear()
    })

    afterAll(() => {
        localStorage.clear()
    })

    test('fold：折叠 node-g2 后 foldedDependencies 非空', () => {
        const golden = createGoldenTestGraphV2()
        saveGraph(golden)
        const store = useGraphStore()
        store.loadGraphToView(golden.id)

        useGraphOperationAdapter().commitToCurrentGraph([{
            type: 'collapse_dependency',
            targetNodeId: 'node-g2' as NodeId,
        }])

        expect(store.graphView!.cognitiveState?.foldedDependencies.length).toBeGreaterThan(0)
    })

    test('undo：撤销折叠后 foldedDependencies 为空', () => {
        const golden = createGoldenTestGraphV2()
        saveGraph(golden)
        const store = useGraphStore()
        store.loadGraphToView(golden.id)

        useGraphOperationAdapter().commitToCurrentGraph([{
            type: 'collapse_dependency',
            targetNodeId: 'node-g2' as NodeId,
        }])

        expect(store.graphView!.cognitiveState?.foldedDependencies.length).toBeGreaterThan(0)

        const undone = store.undo()
        expect(undone).toBe(true)

        const folded = store.graphView!.cognitiveState?.foldedDependencies
        expect(folded?.length).toBe(0)
    })

    test('非法操作拒绝：delete 不存在的节点', () => {
        const golden = createGoldenTestGraphV2()
        saveGraph(golden)
        const store = useGraphStore()
        store.loadGraphToView(golden.id)

        const result = useGraphOperationAdapter().commitToCurrentGraph([{
            type: 'delete_node',
            nodeId: 'non-existent-node' as NodeId,
        }])

        expect(result.valid).toBe(false)
        expect(store.graphView!.nodes.length).toBe(6)
    })
})


describe('持久化', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        localStorage.clear()
    })

    afterAll(() => {
        localStorage.clear()
    })

    test('save → load 往返：节点数不变', () => {
        const golden = createGoldenTestGraphV2()
        saveGraph(golden)

        const loaded = loadGraph(golden.id)
        expect(loaded).not.toBeNull()
        expect(loaded!.nodes.length).toBe(6)
    })

    test('delete → load 返回 null', () => {
        const golden = createGoldenTestGraphV2()
        saveGraph(golden)
        deleteGraph(golden.id)
        const loaded = loadGraph(golden.id)
        expect(loaded).toBeNull()
    })

    test('listRootGraphIds 包含金牌图 ID', () => {
        const golden = createGoldenTestGraphV2()
        saveGraph(golden)
        const ids = listRootGraphIds()
        expect(ids).toContain(golden.id)
    })
})
