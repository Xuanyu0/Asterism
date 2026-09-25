/**
 * operation_controller.test.ts
 *
 * 功能：
 *     diverge 产生点收紧的单元测试：peer 搜索域被限定在「当前视图所在图谱树成员」内，
 *     因此同 id 节点即使存在于另一棵树的图中，也不会被跨树选中。
 *
 * 规则：
 *     1. 真正经过 useOperationController().diverge → 引擎 findPeerGraph 的 peer 查找路径。
 *     2. 测试数据经 dev/test_case_factory 组装，不重复造数据。
 */

import type { GraphId, NodeId } from '@my-project/graph-engine'

import { resetGraphStoreForTests, useGraphStore } from '@/graph/graph_store'
import { useLifecycle } from '@/graph/use-case/useLifecycle'
import { assembleGraph, createNode } from '@/dev/test_case_factory'
import { commitGraphs, loadGraph } from '@/persistence'
import * as medium from '@/persistence/medium/local_storage'

import { useOperationController } from './operation_controller'

describe('diverge peer 搜索域（本图谱树）', () => {
    beforeEach(() => {
        resetGraphStoreForTests()
        medium.resetMediumForTests()
        vi.restoreAllMocks()
    })

    afterAll(() => {
        medium.resetMediumForTests()
    })

    test('同 id 节点位于另一棵树 → 不被跨树选中（DIVERGE_PEER_NODE_NOT_FOUND）', () => {
        const treeA = assembleGraph({
            id: 'tree-a' as GraphId,
            title: '树A',
            nodes: [createNode({ id: 'src-a' as NodeId, graphId: 'tree-a' as GraphId, label: '源节点' })],
            edges: [],
        })
        const treeB = assembleGraph({
            id: 'tree-b' as GraphId,
            title: '树B',
            nodes: [createNode({ id: 'peer-b' as NodeId, graphId: 'tree-b' as GraphId, label: '异树目标' })],
            edges: [],
        })
        commitGraphs({ upserts: [treeA, treeB], deletes: [] })
        useLifecycle().registerAllGraphs()

        const store = useGraphStore()
        store.loadGraphToView('tree-a' as GraphId)

        useOperationController().diverge('src-a' as NodeId, 'peer-b' as NodeId, { x: 0, y: 0 })

        // 跨树节点不在本树 peer 域内 → compose 报错，且未写入任何图
        expect(store.lastValidationResult?.issues.some((issue) => issue.code === 'DIVERGE_PEER_NODE_NOT_FOUND')).toBe(
            true,
        )
        const otherTree = loadGraph('tree-b' as GraphId)
        expect(otherTree.ok).toBe(true)
        if (otherTree.ok) {
            expect(otherTree.value.nodes.length).toBe(1)
            expect(otherTree.value.nodes.some((node) => node.id === 'peer-b')).toBe(true)
        }
    })

    test('同树子图中的节点 → 仍在 peer 域内，可被选中', () => {
        const treeA = assembleGraph({
            id: 'tree-a2' as GraphId,
            title: '树A2',
            nodes: [createNode({ id: 'src-a2' as NodeId, graphId: 'tree-a2' as GraphId, label: '源节点' })],
            edges: [],
        })
        const subA = assembleGraph({
            id: 'sub-a2' as GraphId,
            kind: 'subgraph',
            title: '子图A2',
            parentGraphId: 'tree-a2' as GraphId,
            ownerNodeId: 'src-a2' as NodeId,
            nodes: [createNode({ id: 'peer-a2' as NodeId, graphId: 'sub-a2' as GraphId, label: '同树目标' })],
            edges: [],
        })
        commitGraphs({ upserts: [treeA, subA], deletes: [] })
        useLifecycle().registerAllGraphs()

        const store = useGraphStore()
        store.loadGraphToView('tree-a2' as GraphId)

        useOperationController().diverge('src-a2' as NodeId, 'peer-a2' as NodeId, { x: 10, y: 10 })

        // 同树 peer 被命中：当前图新增启发节点、对端子图新增镜像启发节点
        expect(store.lastValidationResult?.valid).toBe(true)
        const rootGraph = loadGraph('tree-a2' as GraphId)
        const peerGraph = loadGraph('sub-a2' as GraphId)
        expect(rootGraph.ok && rootGraph.value.nodes.length).toBe(2)
        expect(peerGraph.ok && peerGraph.value.nodes.length).toBe(2)
    })
})
