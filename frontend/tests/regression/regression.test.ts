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

import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useGraphStore } from '@/graph/graph_store'
import { saveGraph, loadGraph, deleteGraph, listRootGraphIds } from '@/graph/graph_persistence'
import { createGoldenTestGraphV2, createSilverTestGraph } from '@/dev/test_case_factory'
import { validateGraph } from '@my-project/graph-engine'
import type { NodeId } from '@my-project/graph-engine'


describe('数据完整性', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        localStorage.clear()
    })

    afterAll(() => {
        localStorage.clear()
    })

    it('金牌图通过 validateGraph', () => {
        const golden = createGoldenTestGraphV2()
        const result = validateGraph(golden)
        expect(result.valid).toBe(true)
    })

    it('银牌图通过 validateGraph', () => {
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

    it('保存并加载金牌图后 graphView 不为 null', () => {
        const golden = createGoldenTestGraphV2()
        saveGraph(golden)
        const store = useGraphStore()
        const loaded = store.loadGraphToView(golden.id)
        expect(loaded).toBe(true)
        expect(store.graphView).not.toBeNull()
    })

    it('金牌图节点数 === 6', () => {
        const golden = createGoldenTestGraphV2()
        saveGraph(golden)
        const store = useGraphStore()
        store.loadGraphToView(golden.id)
        expect(store.graphView!.nodes.length).toBe(6)
    })

    it('金牌图边数 === 4', () => {
        const golden = createGoldenTestGraphV2()
        saveGraph(golden)
        const store = useGraphStore()
        store.loadGraphToView(golden.id)
        expect(store.graphView!.edges.length).toBe(4)
    })

    it('graphPath 长度 === 1', () => {
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

    it('add_node：节点数从 6 变为 7', () => {
        const golden = createGoldenTestGraphV2()
        saveGraph(golden)
        const store = useGraphStore()
        store.loadGraphToView(golden.id)

        const result = store.applyBatchToGraph(store.graphView!, [{
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

        expect(result.validation.valid).toBe(true)
        expect(store.graphView!.nodes.length).toBe(7)
    })

    it('add_edge：边数从 4 变为 5', () => {
        const golden = createGoldenTestGraphV2()
        saveGraph(golden)
        const store = useGraphStore()
        store.loadGraphToView(golden.id)

        // 在 node-g1 和 node-g6 之间加一条有向实边
        const result = store.applyBatchToGraph(store.graphView!, [{
            type: 'add_edge',
            edge: {
                id: 'reg-edge-test',
                graphId: store.graphView!.id,
                source: 'node-g1' as NodeId,
                target: 'node-g6' as NodeId,
                kind: 'real',
                direction: 'directed',
                label: '回归测试边',
            },
        }])

        expect(result.validation.valid).toBe(true)
        expect(store.graphView!.edges.length).toBe(5)
    })

    it('delete_node：删除孤立节点后节点数恢复', () => {
        const golden = createGoldenTestGraphV2()
        saveGraph(golden)
        const store = useGraphStore()
        store.loadGraphToView(golden.id)

        // 先添加一个孤立节点
        store.applyBatchToGraph(store.graphView!, [{
            type: 'add_node',
            node: {
                role: 'knowledge',
                id: 'reg-node-new' as NodeId,
                graphId: store.graphView!.id,
                kind: 'real',
                form: 'atomic',
                label: '待删除节点',
                summary: '',
                abstractionLevel: 0,
                degree: 0,
                position: { x: 999, y: 999 },
            },
        }])
        expect(store.graphView!.nodes.length).toBe(7)

        // 删除该节点
        store.applyBatchToGraph(store.graphView!, [{
            type: 'delete_node',
            nodeId: 'reg-node-new' as NodeId,
        }])

        expect(store.graphView!.nodes.length).toBe(6)
    })

    it('delete_node 级联：删除 node-g3 导致关联边被移除', () => {
        const golden = createGoldenTestGraphV2()
        saveGraph(golden)
        const store = useGraphStore()
        store.loadGraphToView(golden.id)

        // node-g3 是 edge-g23 (g2→g3) 的 target
        // 删除 node-g3 应级联移除 edge-g23
        store.applyBatchToGraph(store.graphView!, [{
            type: 'delete_node',
            nodeId: 'node-g3' as NodeId,
        }], false)

        expect(store.graphView!.nodes.length).toBe(5)   // 6 → 5
        expect(store.graphView!.edges.length).toBe(3)   // 4 → 3 (edge-g23 被移除)
    })

    it('update_node：修改 node-g1 的 label', () => {
        const golden = createGoldenTestGraphV2()
        saveGraph(golden)
        const store = useGraphStore()
        store.loadGraphToView(golden.id)

        const originalNode = store.graphView!.nodes.find(n => n.id === 'node-g1')
        expect(originalNode).toBeDefined()

        store.applyBatchToGraph(store.graphView!, [{
            type: 'update_node',
            node: { ...originalNode!, label: '新标签' },
        }], false)

        const updatedNode = store.graphView!.nodes.find(n => n.id === 'node-g1')
        expect(updatedNode!.label).toBe('新标签')
    })

    it('move_node：移动 node-g1 到新位置', () => {
        const golden = createGoldenTestGraphV2()
        saveGraph(golden)
        const store = useGraphStore()
        store.loadGraphToView(golden.id)

        store.applyBatchToGraph(store.graphView!, [{
            type: 'move_node',
            nodeId: 'node-g1' as NodeId,
            position: { x: 999, y: 888 },
        }], false)

        const movedNode = store.graphView!.nodes.find(n => n.id === 'node-g1')
        expect(movedNode!.position!.x).toBe(999)
        expect(movedNode!.position!.y).toBe(888)
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

    it('fold：折叠 node-g2 后 foldedDependencies 非空', () => {
        const golden = createGoldenTestGraphV2()
        saveGraph(golden)
        const store = useGraphStore()
        store.loadGraphToView(golden.id)

        store.applyBatchToGraph(store.graphView!, [{
            type: 'collapse_dependency',
            targetNodeId: 'node-g2' as NodeId,
        }], false)

        expect(store.graphView!.cognitiveState?.foldedDependencies.length).toBeGreaterThan(0)
    })

    it('undo：撤销折叠后 foldedDependencies 为空', () => {
        const golden = createGoldenTestGraphV2()
        saveGraph(golden)
        const store = useGraphStore()
        store.loadGraphToView(golden.id)

        store.applyBatchToGraph(store.graphView!, [{
            type: 'collapse_dependency',
            targetNodeId: 'node-g2' as NodeId,
        }], false)

        expect(store.graphView!.cognitiveState?.foldedDependencies.length).toBeGreaterThan(0)

        const undone = store.undo()
        expect(undone).toBe(true)

        const folded = store.graphView!.cognitiveState?.foldedDependencies
        expect(folded?.length).toBe(0)
    })

    it('非法操作拒绝：delete 不存在的节点', () => {
        const golden = createGoldenTestGraphV2()
        saveGraph(golden)
        const store = useGraphStore()
        store.loadGraphToView(golden.id)

        const result = store.applyBatchToGraph(store.graphView!, [{
            type: 'delete_node',
            nodeId: 'non-existent-node' as NodeId,
        }], false)

        expect(result.validation.valid).toBe(false)
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

    it('save → load 往返：节点数不变', () => {
        const golden = createGoldenTestGraphV2()
        saveGraph(golden)

        const loaded = loadGraph(golden.id)
        expect(loaded).not.toBeNull()
        expect(loaded!.nodes.length).toBe(6)
    })

    it('delete → load 返回 null', () => {
        const golden = createGoldenTestGraphV2()
        saveGraph(golden)
        deleteGraph(golden.id)
        const loaded = loadGraph(golden.id)
        expect(loaded).toBeNull()
    })

    it('listRootGraphIds 包含金牌图 ID', () => {
        const golden = createGoldenTestGraphV2()
        saveGraph(golden)
        const ids = listRootGraphIds()
        expect(ids).toContain(golden.id)
    })
})
